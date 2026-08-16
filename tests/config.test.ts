import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { defaults, loadConfig } from "../src/config";

const KEYS = [
  "CHUNK_SIZE",
  "CHUNK_OVERLAP",
  "TOP_K",
  "SIMILARITY_THRESHOLD",
  "EMBEDDING_MODEL",
  "ANTHROPIC_MODEL",
  "STORE_PATH",
] as const;

describe("loadConfig", () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
    for (const key of KEYS) delete process.env[key];
  });

  afterEach(() => {
    for (const key of KEYS) {
      const value = saved[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("falls back to defaults when nothing is set", () => {
    expect(loadConfig()).toEqual(defaults);
  });

  it("reads numbers and strings from the environment", () => {
    process.env.CHUNK_SIZE = "800";
    process.env.TOP_K = "5";
    process.env.EMBEDDING_MODEL = "Xenova/multilingual-e5-small";

    const config = loadConfig();
    expect(config.chunkSize).toBe(800);
    expect(config.topK).toBe(5);
    expect(config.embeddingModel).toBe("Xenova/multilingual-e5-small");
  });

  it("treats a blank value as unset rather than as zero or empty", () => {
    process.env.TOP_K = "   ";
    process.env.STORE_PATH = "";

    const config = loadConfig();
    expect(config.topK).toBe(defaults.topK);
    expect(config.storePath).toBe(defaults.storePath);
  });

  it("lets explicit overrides win over the environment", () => {
    process.env.TOP_K = "5";
    expect(loadConfig({ topK: 9 }).topK).toBe(9);
  });

  it("rejects a non-numeric value instead of silently using NaN", () => {
    process.env.TOP_K = "kolme";
    expect(() => loadConfig()).toThrow(/TOP_K must be a number/);
  });

  it("rejects an overlap that is not smaller than the chunk size", () => {
    expect(() => loadConfig({ chunkSize: 100, chunkOverlap: 100 })).toThrow(/CHUNK_OVERLAP/);
  });

  it("rejects a top-k below one, which would retrieve nothing", () => {
    expect(() => loadConfig({ topK: 0 })).toThrow(/TOP_K must be at least 1/);
  });
});
