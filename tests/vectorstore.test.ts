import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Chunk } from "../src/types";
import { VectorStore, cosineSimilarity } from "../src/vectorstore";

function chunkFor(id: string, text = "text"): Chunk {
  const [sourceFile] = id.split("#");
  return { id, sourceFile: sourceFile ?? id, text, offset: 0 };
}

describe("cosineSimilarity", () => {
  it("is 1 for identical vectors", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
  });

  it("is 1 for parallel vectors of different magnitude", () => {
    expect(cosineSimilarity([1, 0], [7, 0])).toBeCloseTo(1);
  });

  it("is 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("is -1 for opposite vectors", () => {
    expect(cosineSimilarity([1, 1], [-1, -1])).toBeCloseTo(-1);
  });

  it("returns 0 rather than NaN when a vector is all zeros", () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });

  it("throws on a dimension mismatch instead of silently truncating", () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow(/dimension/i);
  });
});

describe("VectorStore.upsert", () => {
  it("is idempotent: the same id twice stores one entry", () => {
    const store = new VectorStore();
    store.upsert("a.md#chunk0", [1, 0], chunkFor("a.md#chunk0"));
    store.upsert("a.md#chunk0", [1, 0], chunkFor("a.md#chunk0"));
    expect(store.size).toBe(1);
  });

  it("replaces the previous entry for an id rather than appending", () => {
    const store = new VectorStore();
    store.upsert("a.md#chunk0", [1, 0], chunkFor("a.md#chunk0", "old"));
    store.upsert("a.md#chunk0", [0, 1], chunkFor("a.md#chunk0", "new"));

    const [only] = store.toJSON();
    expect(store.size).toBe(1);
    expect(only?.vector).toEqual([0, 1]);
    expect(only?.metadata.text).toBe("new");
  });
});

describe("VectorStore.search", () => {
  const store = new VectorStore();
  store.upsert("a.md#chunk0", [1, 0], chunkFor("a.md#chunk0"));
  store.upsert("b.md#chunk0", [0.7, 0.7], chunkFor("b.md#chunk0"));
  store.upsert("c.md#chunk0", [0, 1], chunkFor("c.md#chunk0"));

  it("returns hits ordered by descending score", () => {
    const hits = store.search([1, 0], 3);
    expect(hits.map((h) => h.chunk.id)).toEqual([
      "a.md#chunk0",
      "b.md#chunk0",
      "c.md#chunk0",
    ]);
    expect(hits[0]!.score).toBeGreaterThan(hits[1]!.score);
  });

  it("returns at most k hits", () => {
    expect(store.search([1, 0], 2)).toHaveLength(2);
  });

  it("returns everything when k exceeds the store size", () => {
    expect(store.search([1, 0], 99)).toHaveLength(3);
  });

  it("returns nothing for an empty store", () => {
    expect(new VectorStore().search([1, 0], 3)).toEqual([]);
  });
});

describe("VectorStore persistence", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ragstore-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("round-trips ids, vectors and metadata through JSON", async () => {
    const path = join(dir, "nested", "store.json");
    const store = new VectorStore();
    store.upsert("a.md#chunk0", [0.5, -0.25], chunkFor("a.md#chunk0", "hello"));
    await store.save(path);

    const loaded = await VectorStore.load(path);
    expect(loaded.size).toBe(1);
    expect(loaded.toJSON()).toEqual(store.toJSON());
  });

  it("serialises deterministically regardless of insertion order", async () => {
    const forward = new VectorStore();
    forward.upsert("a.md#chunk0", [1, 0], chunkFor("a.md#chunk0"));
    forward.upsert("b.md#chunk0", [0, 1], chunkFor("b.md#chunk0"));

    const reverse = new VectorStore();
    reverse.upsert("b.md#chunk0", [0, 1], chunkFor("b.md#chunk0"));
    reverse.upsert("a.md#chunk0", [1, 0], chunkFor("a.md#chunk0"));

    const forwardPath = join(dir, "forward.json");
    const reversePath = join(dir, "reverse.json");
    await forward.save(forwardPath);
    await reverse.save(reversePath);

    expect(await readFile(forwardPath, "utf8")).toBe(await readFile(reversePath, "utf8"));
  });

  it("reports a missing store file with an actionable message", async () => {
    await expect(VectorStore.load(join(dir, "absent.json"))).rejects.toThrow(/ingest/i);
  });
});
