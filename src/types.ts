/** A slice of a source document, small enough to embed and cite. */
export interface Chunk {
  /** Stable across runs: `${sourceFile}#chunk${n}`. This is what makes upsert idempotent. */
  id: string;
  sourceFile: string;
  text: string;
  /** Character offset of this chunk's first character in the source document. */
  offset: number;
  /**
   * Heading trail this chunk sits under, e.g. `Ahven > Syönti ja ajankohta`.
   *
   * Prepended at embedding time only, never folded into `text`: it is
   * synthesised from headings that are not contiguous with the body, so
   * storing it inline would break the invariant that
   * `source.slice(offset, offset + text.length) === text`.
   */
  headingPath?: string;
}

/** A chunk plus its embedding, as persisted in the store. */
export interface StoredVector {
  id: string;
  vector: number[];
  metadata: Chunk;
}

/** A retrieval hit: the chunk and its cosine similarity to the query. */
export interface ScoredChunk {
  chunk: Chunk;
  score: number;
}

/** The two halves of a request to the model, as built by `prompt.ts`. */
export interface Prompt {
  system: string;
  user: string;
}

/**
 * The seam between retrieval and generation. `ClaudeProvider` calls the API;
 * `MockProvider` returns a canned answer so tests never touch the network.
 */
export interface LLMProvider {
  complete(prompt: Prompt): Promise<string>;
}

/** A document as read off disk, before chunking. */
export interface LoadedDocument {
  /** Basename, e.g. `ahven.md` — this is what appears in citations. */
  sourceFile: string;
  text: string;
}
