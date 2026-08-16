/**
 * The two pipelines, composed from the single-purpose modules in `src/`.
 *
 *   ingest:  load → chunk → embed → persist
 *   ask:     redact question → load store → embed query → retrieve
 *              → refuse? → redact context → prompt → generate
 *
 * This is the only file where the stages are wired together. `cli.ts` parses
 * arguments and prints; every other module does one thing and is unit-tested
 * on its own.
 */

import { chunk } from "./chunker";
import type { Config } from "./config";
import { createEmbedder } from "./embeddings";
import { redact, redactChunks } from "./guardrails";
import { loadDocuments } from "./loader";
import { buildPrompt } from "./prompt";
import type { Chunk, LLMProvider, ScoredChunk } from "./types";
import { VectorStore } from "./vectorstore";

export interface IngestResult {
  documents: number;
  chunks: number;
  dimensions: number | null;
  storePath: string;
}

export async function ingest(dir: string, config: Config): Promise<IngestResult> {
  // 1. LOAD — .txt and .md only, non-recursive, so nothing unexpected is indexed.
  const documents = await loadDocuments(dir);
  if (documents.length === 0) {
    throw new Error(`No .txt or .md files found in ${dir}`);
  }

  // 2. CHUNK — pure. Chunk ids are derived from the source file and position,
  //    so they are stable across runs; that is what makes step 4 idempotent.
  const chunks: Chunk[] = documents.flatMap((doc) =>
    chunk(doc.text, doc.sourceFile, {
      size: config.chunkSize,
      overlap: config.chunkOverlap,
    }),
  );

  // 3. EMBED — the slow stage. The model loads once, then one vector per chunk.
  const embedder = await createEmbedder(config.embeddingModel);

  // 4. PERSIST — upsert is keyed by chunk id, so re-ingesting an unchanged
  //    document overwrites each entry with itself instead of duplicating it.
  const store = new VectorStore();
  for (const item of chunks) {
    store.upsert(item.id, await embedder.embed(item.text), item);
  }
  await store.save(config.storePath);

  return {
    documents: documents.length,
    chunks: chunks.length,
    dimensions: embedder.dimensions,
    storePath: config.storePath,
  };
}

interface AskResultCommon {
  hits: ScoredChunk[];
  /** True when step 1 stripped an identifier out of the question. */
  questionRedacted: boolean;
}

export type AskResult =
  | ({ refused: true } & AskResultCommon)
  | ({ refused: false; answer: string } & AskResultCommon);

/**
 * Answer a question from the persisted store.
 *
 * `providerFor` is a factory rather than an instance so that the refusal path
 * demonstrably never reaches the model — not even to construct a client.
 */
export async function ask(
  question: string,
  config: Config,
  providerFor: () => LLMProvider,
): Promise<AskResult> {
  // 1. GUARDRAIL — redact the question, before anything else reads it.
  //    Deliberately ahead of the embedder rather than just ahead of the prompt:
  //    one redaction means retrieval and the model see the same question, and
  //    the rule stays correct if embedding ever moves to a hosted service.
  const safeQuestion = redact(question);
  const questionRedacted = safeQuestion !== question;

  // 2. LOAD STORE — reports "run ingest first" rather than an ENOENT if absent.
  const store = await VectorStore.load(config.storePath);

  // 3. EMBED QUERY — must be the same model used at ingest. A mismatch would
  //    not throw; it would silently make every score meaningless.
  const embedder = await createEmbedder(config.embeddingModel);
  const queryVector = await embedder.embed(safeQuestion);

  // 4. RETRIEVE — top-k by cosine. k is 3 rather than 1 because top-1 picks the
  //    wrong document roughly one time in seven on this corpus (see SPEC).
  const hits = store.search(queryVector, config.topK);

  // 5. GUARDRAIL — refuse. Nothing retrieved is close enough to ground an
  //    answer in, so there is no reason to spend a model call finding that out.
  const best = hits[0];
  if (!best || best.score < config.similarityThreshold) {
    return { refused: true, hits, questionRedacted };
  }

  // 6. GUARDRAIL — redact the context. Ids and offsets survive, so citations
  //    still resolve. Together with step 1, nothing leaving for the model has
  //    passed through unredacted.
  const context = redactChunks(hits.map((hit) => hit.chunk));

  // 7. PROMPT — grounding rules in the system turn, labelled context and the
  //    question in the user turn. Throws if the context is empty, which would
  //    mean step 5 let something through it should not have.
  const prompt = buildPrompt(safeQuestion, context);

  // 8. GENERATE — the provider is constructed only here, which is what makes
  //    "the refusal path never reaches the model" testable rather than claimed.
  const answer = await providerFor().complete(prompt);

  return { refused: false, answer, hits, questionRedacted };
}
