import { type FeatureExtractionPipeline, pipeline } from "@huggingface/transformers";

export interface Embedder {
  /** Embedding dimensionality, known once the first vector has been produced. */
  readonly dimensions: number | null;
  embed(text: string): Promise<number[]>;
  embedAll(texts: string[]): Promise<number[][]>;
}

/**
 * Load the local sentence-embedding model and return an embedder over it.
 *
 * The pipeline is created once and reused: loading the model costs seconds and
 * hundreds of megabytes, while embedding a chunk costs milliseconds. The first
 * call on a machine downloads the weights and caches them under
 * `node_modules/.cache/huggingface`.
 *
 * Vectors are mean-pooled and L2-normalised, which is what makes cosine
 * similarity in `vectorstore.ts` the right distance measure.
 */
export async function createEmbedder(model: string): Promise<Embedder> {
  let extract: FeatureExtractionPipeline;
  try {
    extract = await pipeline("feature-extraction", model);
  } catch (cause) {
    throw new Error(
      `Could not load embedding model "${model}". Check EMBEDDING_MODEL and your network connection.`,
      { cause },
    );
  }

  let dimensions: number | null = null;

  async function embed(text: string): Promise<number[]> {
    const output = await extract(text, { pooling: "mean", normalize: true });
    const vector = Array.from(output.data as Float32Array, Number);
    dimensions ??= vector.length;
    return vector;
  }

  return {
    get dimensions() {
      return dimensions;
    },
    embed,
    async embedAll(texts: string[]) {
      // Sequential on purpose: the runtime is single-threaded here, so
      // concurrency buys nothing and makes progress reporting meaningless.
      const vectors: number[][] = [];
      for (const text of texts) {
        vectors.push(await embed(text));
      }
      return vectors;
    },
  };
}
