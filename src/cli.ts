import { Command } from "commander";

import { chunk } from "./chunker";
import { loadConfig } from "./config";
import { createEmbedder } from "./embeddings";
import { ClaudeProvider } from "./generation";
import { redactChunks } from "./guardrails";
import { loadDocuments } from "./loader";
import { buildPrompt } from "./prompt";
import type { Chunk } from "./types";
import { VectorStore } from "./vectorstore";

async function ingest(dir: string): Promise<void> {
  const config = loadConfig();

  const documents = await loadDocuments(dir);
  if (documents.length === 0) {
    throw new Error(`No .txt or .md files found in ${dir}`);
  }

  const chunks: Chunk[] = documents.flatMap((doc) =>
    chunk(doc.text, doc.sourceFile, {
      size: config.chunkSize,
      overlap: config.chunkOverlap,
    }),
  );

  console.log(`Loaded ${documents.length} documents → ${chunks.length} chunks`);
  console.log(`Embedding with ${config.embeddingModel} …`);

  const embedder = await createEmbedder(config.embeddingModel);
  const store = new VectorStore();
  for (const item of chunks) {
    store.upsert(item.id, await embedder.embed(item.text), item);
  }

  await store.save(config.storePath);
  console.log(
    `Wrote ${store.size} vectors (${embedder.dimensions} dimensions) to ${config.storePath}`,
  );
}

async function ask(question: string): Promise<void> {
  const config = loadConfig();

  const store = await VectorStore.load(config.storePath);
  const embedder = await createEmbedder(config.embeddingModel);
  const hits = store.search(await embedder.embed(question), config.topK);

  const best = hits[0];
  if (!best || best.score < config.similarityThreshold) {
    // Cheap refusal: nothing retrieved is close enough to be worth grounding
    // an answer in, so there is no reason to spend a model call finding that out.
    const score = best ? best.score.toFixed(3) : "n/a";
    console.log(
      `I don't know — nothing in the corpus is close enough to this question ` +
        `(best score ${score}, threshold ${config.similarityThreshold}).`,
    );
    return;
  }

  const context = redactChunks(hits.map((hit) => hit.chunk));
  const provider = ClaudeProvider.fromEnv(config.anthropicModel);
  const answer = await provider.complete(buildPrompt(question, context));

  console.log(answer);
  console.log(
    `\nRetrieved: ${hits.map((hit) => `${hit.chunk.id} (${hit.score.toFixed(3)})`).join(", ")}`,
  );
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
  .action(ingest);

program
  .command("ask")
  .argument("<question>", "question to answer from the ingested corpus")
  .description("Retrieve context and answer the question, citing its sources")
  .action(ask);

try {
  await program.parseAsync();
} catch (error) {
  // A failed run should read as a message, not a stack trace.
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
