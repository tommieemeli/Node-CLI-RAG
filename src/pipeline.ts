import { chunk } from "./chunker";
import type { Config } from "./config";
import { createEmbedder } from "./embeddings";
import { redactChunks } from "./guardrails";
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

  const embedder = await createEmbedder(config.embeddingModel);
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

export type AskResult =
  | { refused: true; hits: ScoredChunk[] }
  | { refused: false; answer: string; hits: ScoredChunk[] };

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
  const store = await VectorStore.load(config.storePath);
  const embedder = await createEmbedder(config.embeddingModel);
  const hits = store.search(await embedder.embed(question), config.topK);

  const best = hits[0];
  if (!best || best.score < config.similarityThreshold) {
    return { refused: true, hits };
  }

  const context = redactChunks(hits.map((hit) => hit.chunk));
  const answer = await providerFor().complete(buildPrompt(question, context));

  return { refused: false, answer, hits };
}
