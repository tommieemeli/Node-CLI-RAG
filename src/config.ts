import dotenv from "dotenv";

export interface Config {
  chunkSize: number;
  chunkOverlap: number;
  topK: number;
  /** Below this cosine score the CLI refuses without calling the model at all. */
  similarityThreshold: number;
  embeddingModel: string;
  anthropicModel: string;
  storePath: string;
}

export const defaults: Config = {
  chunkSize: 500,
  chunkOverlap: 50,
  topK: 3,
  similarityThreshold: 0.35,
  // Multilingual on purpose: the corpus is Finnish. An English-only model such
  // as all-MiniLM-L6-v2 retrieves poorly here.
  embeddingModel: "Xenova/paraphrase-multilingual-MiniLM-L12-v2",
  anthropicModel: "claude-opus-5",
  storePath: ".rag/store.json",
};

function readNumber(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${key} must be a number, got "${raw}"`);
  }
  return parsed;
}

function readString(key: string, fallback: string): string {
  const raw = process.env[key];
  return raw === undefined || raw.trim() === "" ? fallback : raw.trim();
}

/**
 * Read configuration from `.env` and the environment, falling back to defaults.
 * Called explicitly rather than at import time so that importing this module
 * has no side effects.
 */
export function loadConfig(overrides: Partial<Config> = {}): Config {
  dotenv.config({ quiet: true });

  const config: Config = {
    chunkSize: readNumber("CHUNK_SIZE", defaults.chunkSize),
    chunkOverlap: readNumber("CHUNK_OVERLAP", defaults.chunkOverlap),
    topK: readNumber("TOP_K", defaults.topK),
    similarityThreshold: readNumber("SIMILARITY_THRESHOLD", defaults.similarityThreshold),
    embeddingModel: readString("EMBEDDING_MODEL", defaults.embeddingModel),
    anthropicModel: readString("ANTHROPIC_MODEL", defaults.anthropicModel),
    storePath: readString("STORE_PATH", defaults.storePath),
    ...overrides,
  };

  if (config.chunkOverlap >= config.chunkSize) {
    throw new Error(
      `CHUNK_OVERLAP (${config.chunkOverlap}) must be smaller than CHUNK_SIZE (${config.chunkSize})`,
    );
  }
  if (config.topK < 1) {
    throw new Error(`TOP_K must be at least 1, got ${config.topK}`);
  }

  return config;
}
