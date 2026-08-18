import { Command } from "commander";

import { loadConfig } from "./config";
import { ClaudeProvider } from "./generation";
import { ask, ingest } from "./pipeline";
import type { ScoredChunk } from "./types";

function formatHits(hits: ScoredChunk[]): string {
  return hits.map((hit) => `${hit.chunk.id} (${hit.score.toFixed(3)})`).join(", ");
}

async function runIngest(dir: string): Promise<void> {
  const config = loadConfig();
  console.log(`Embedding with ${config.embeddingModel} …`);

  const result = await ingest(dir, config);
  console.log(`Loaded ${result.documents} documents → ${result.chunks} chunks`);
  console.log(
    `Wrote ${result.chunks} vectors (${result.dimensions} dimensions) to ${result.storePath}`,
  );
}

async function runAsk(question: string): Promise<void> {
  const config = loadConfig();
  const result = await ask(question, config, () => ClaudeProvider.fromEnv(config.anthropicModel));

  if (result.questionRedacted) {
    // Silently rewriting the question would leave the user puzzling over a
    // "[REDACTED]" in the answer.
    console.log("Note: personal identifiers were redacted from your question.\n");
  }

  if (result.refused) {
    const score = result.hits[0]?.score.toFixed(3) ?? "n/a";
    console.log(
      `En tiedä ` +
        `(best score ${score}, threshold ${config.similarityThreshold}).`,
    );
    return;
  }

  console.log(result.answer);
  console.log(`\nRetrieved: ${formatHits(result.hits)}`);
}

const program = new Command();

program
  .name("rag")
  .description("Answer questions over a folder of local documents, with citations")
  .version("0.1.0");

program
  .command("ingest")
  .argument("<dir>", "directory containing .txt and .md documents")
  .description("Load, chunk, embed and persist the corpus")
  .action(runIngest);

program
  .command("ask")
  .argument("<question>", "question to answer from the ingested corpus")
  .description("Retrieve context and answer the question, citing its sources")
  .action(runAsk);

try {
  await program.parseAsync();
} catch (error) {
  // A failed run should read as a message, not a stack trace.
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
