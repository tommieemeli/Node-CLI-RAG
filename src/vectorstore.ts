import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { Chunk, ScoredChunk, StoredVector } from "./types";

/**
 * Cosine similarity of two equal-length vectors, in [-1, 1].
 * Returns 0 for a zero vector rather than NaN, so a degenerate embedding
 * sorts to the bottom instead of poisoning the ranking.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`vector dimension mismatch: ${a.length} vs ${b.length}`);
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dot / magnitude;
}

/**
 * In-memory vector store keyed by chunk id, persisted as JSON.
 *
 * Keying by id is what makes ingest idempotent: re-ingesting an unchanged
 * document overwrites each entry with itself instead of duplicating it.
 */
export class VectorStore {
  private readonly vectors = new Map<string, StoredVector>();

  get size(): number {
    return this.vectors.size;
  }

  upsert(id: string, vector: number[], metadata: Chunk): void {
    this.vectors.set(id, { id, vector, metadata });
  }

  /** Top-k chunks by cosine similarity to `queryVector`, best first. */
  search(queryVector: number[], k: number): ScoredChunk[] {
    return [...this.vectors.values()]
      .map((entry) => ({
        chunk: entry.metadata,
        score: cosineSimilarity(queryVector, entry.vector),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }

  /** Entries sorted by id, so the serialised form does not depend on insertion order. */
  toJSON(): StoredVector[] {
    return [...this.vectors.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  static fromJSON(entries: StoredVector[]): VectorStore {
    const store = new VectorStore();
    for (const entry of entries) {
      store.upsert(entry.id, entry.vector, entry.metadata);
    }
    return store;
  }

  async save(path: string): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(this.toJSON(), null, 2)}\n`, "utf8");
  }

  static async load(path: string): Promise<VectorStore> {
    let raw: string;
    try {
      raw = await readFile(path, "utf8");
    } catch {
      throw new Error(`No store at ${path} — run \`npm run ingest\` first.`);
    }
    return VectorStore.fromJSON(JSON.parse(raw) as StoredVector[]);
  }
}
