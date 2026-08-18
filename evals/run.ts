/**
 * Retrieval evaluation. Run with `npm run eval` after `npm run ingest`.
 *
 * Exists because the pipeline's quality is otherwise unmeasurable: a change to
 * chunking, the embedding model, top-k or the threshold has no visible effect
 * until someone happens to ask the right question.
 *
 * The metric that matters is `ans@k` — does a retrieved chunk actually contain
 * the answer. Document-level accuracy (`doc@k`) is the weaker measure and can
 * look healthy while the retrieved chunk is useless.
 */

import { readFileSync } from "node:fs";

import dotenv from "dotenv";

import { loadConfig } from "../src/config";
import { MockProvider } from "../src/generation";
import { ask } from "../src/pipeline";

interface Answerable {
  q: string;
  doc: string;
  contains: string;
  lang: "fi" | "en";
}
interface Unanswerable {
  q: string;
  lang: "fi" | "en";
}

const set: { answerable: Answerable[]; unanswerable: Unanswerable[] } = JSON.parse(
  readFileSync(new URL("./questions.json", import.meta.url), "utf8"),
);

// This is an entry point, so it owns .env (see src/config.ts).
dotenv.config({ quiet: true });

const config = loadConfig();
const provider = () => new MockProvider("unused");

function pct(hit: number, total: number): string {
  return `${hit}/${total} (${Math.round((hit / total) * 100)}%)`;
}

const rows: Array<Answerable & { doc1: boolean; doc3: boolean; ans1: boolean; ans3: boolean; score: number }> = [];

for (const item of set.answerable) {
  const { hits } = await ask(item.q, config, provider);
  const top = hits[0];
  const has = (h: typeof hits) =>
    h.some((x) => x.chunk.text.toLowerCase().includes(item.contains.toLowerCase()));

  rows.push({
    ...item,
    score: top?.score ?? 0,
    doc1: top?.chunk.sourceFile === item.doc,
    doc3: hits.some((h) => h.chunk.sourceFile === item.doc),
    ans1: has(hits.slice(0, 1)),
    ans3: has(hits),
  });
}

const negatives: Array<Unanswerable & { score: number }> = [];
for (const item of set.unanswerable) {
  const { hits } = await ask(item.q, config, provider);
  negatives.push({ ...item, score: hits[0]?.score ?? 0 });
}

console.log("ANSWERABLE");
for (const r of rows) {
  const flags = `${r.doc1 ? "D" : "·"}${r.ans1 ? "A" : "·"}${r.ans3 ? "a" : "·"}`;
  const refused = r.score < config.similarityThreshold ? "  FALSE REFUSAL" : "";
  console.log(`  ${flags}  ${r.score.toFixed(3)}  [${r.lang}] ${r.q}${refused}`);
}

console.log("\nUNANSWERABLE");
for (const n of negatives) {
  const passed = n.score >= config.similarityThreshold ? "  FALSE PASS" : "";
  console.log(`  ${n.score.toFixed(3)}  [${n.lang}] ${n.q}${passed}`);
}

const n = rows.length;
const falseRefusals = rows.filter((r) => r.score < config.similarityThreshold);
const falsePasses = negatives.filter((x) => x.score >= config.similarityThreshold);
const lowestAnswerable = Math.min(...rows.map((r) => r.score));
const highestUnanswerable = Math.max(...negatives.map((x) => x.score));

console.log("\n─── flags: D = right document@1, A = answer in top-1 chunk, a = answer in top-3");
console.log(`\ndoc@1  ${pct(rows.filter((r) => r.doc1).length, n)}`);
console.log(`doc@3  ${pct(rows.filter((r) => r.doc3).length, n)}`);
console.log(`ans@1  ${pct(rows.filter((r) => r.ans1).length, n)}   <- the metric that matters`);
console.log(`ans@3  ${pct(rows.filter((r) => r.ans3).length, n)}`);

for (const lang of ["fi", "en"] as const) {
  const sub = rows.filter((r) => r.lang === lang);
  if (sub.length === 0) continue;
  console.log(
    `   ${lang}: ans@1 ${pct(sub.filter((r) => r.ans1).length, sub.length)}` +
      `  ans@3 ${pct(sub.filter((r) => r.ans3).length, sub.length)}`,
  );
}

console.log(`\nfalse refusals  ${falseRefusals.length}/${n}`);
console.log(`false passes    ${falsePasses.length}/${negatives.length}`);
console.log(
  `margin          ${(lowestAnswerable - highestUnanswerable).toFixed(3)} ` +
    `(lowest answerable ${lowestAnswerable.toFixed(3)}, highest unanswerable ${highestUnanswerable.toFixed(3)})`,
);
console.log(`threshold       ${config.similarityThreshold}`);
