import { describe, expect, it } from "vitest";

import { chunk } from "../src/chunker";

const opts = { size: 500, overlap: 50 };

/** N space-separated repetitions of `word`. */
function words(word: string, n: number): string {
  return Array.from({ length: n }, () => word).join(" ");
}

describe("chunk — guard rails", () => {
  it("throws when overlap is not smaller than size", () => {
    expect(() => chunk("text", "a.md", { size: 100, overlap: 100 })).toThrow(/overlap/i);
    expect(() => chunk("text", "a.md", { size: 100, overlap: 200 })).toThrow(/overlap/i);
  });

  it("returns nothing for empty or whitespace-only input", () => {
    expect(chunk("", "a.md", opts)).toEqual([]);
    expect(chunk("   \n\n  \t ", "a.md", opts)).toEqual([]);
  });
});

describe("chunk — ids and offsets", () => {
  it("emits a single trimmed chunk for text shorter than the window", () => {
    const chunks = chunk("  Lyhyt teksti.  ", "a.md", opts);
    expect(chunks).toEqual([
      { id: "a.md#chunk0", sourceFile: "a.md", text: "Lyhyt teksti.", offset: 2 },
    ]);
  });

  it("numbers ids sequentially from zero", () => {
    const chunks = chunk(words("alfa", 400), "a.md", opts);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.map((c) => c.id)).toEqual(
      chunks.map((_, i) => `a.md#chunk${i}`),
    );
  });

  it("produces identical output for identical input, so upsert stays idempotent", () => {
    const text = words("alfa", 400);
    expect(chunk(text, "a.md", opts)).toEqual(chunk(text, "a.md", opts));
  });

  it("records an offset that locates the chunk text in the source document", () => {
    const text = `${words("alfa", 60)}\n\n${words("beeta", 60)}`;
    for (const c of chunk(text, "a.md", opts)) {
      expect(text.slice(c.offset, c.offset + c.text.length)).toBe(c.text);
    }
  });
});

describe("chunk — sizing", () => {
  it("never exceeds the configured size", () => {
    const chunks = chunk(words("alfa", 400), "a.md", opts);
    for (const c of chunks) {
      expect(c.text.length).toBeLessThanOrEqual(opts.size);
    }
  });

  it("overlaps consecutive chunks in the source text", () => {
    const chunks = chunk(words("alfa", 400), "a.md", opts);
    expect(chunks.length).toBeGreaterThan(1);
    for (let i = 1; i < chunks.length; i++) {
      const previousEnd = chunks[i - 1]!.offset + chunks[i - 1]!.text.length;
      expect(chunks[i]!.offset).toBeLessThan(previousEnd);
    }
  });

  it("always makes forward progress rather than looping on a stubborn boundary", () => {
    const chunks = chunk(words("alfa", 400), "a.md", { size: 60, overlap: 55 });
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i]!.offset).toBeGreaterThan(chunks[i - 1]!.offset);
    }
  });
});

describe("chunk — boundary preference", () => {
  it("prefers a paragraph break over a sentence or word break", () => {
    const first = words("alfa", 60);
    const chunks = chunk(`${first}\n\n${words("beeta", 60)}`, "a.md", opts);
    expect(chunks[0]!.text).toBe(first);
    expect(chunks[0]!.text).not.toContain("beeta");
  });

  it("falls back to a sentence break when there is no paragraph break", () => {
    const text = Array.from({ length: 40 }, (_, i) => `Lause numero ${i}.`).join(" ");
    const chunks = chunk(text, "a.md", opts);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]!.text.endsWith(".")).toBe(true);
  });

  it("falls back to a word break when there is no sentence break", () => {
    const chunks = chunk(words("alfa", 400), "a.md", opts);
    expect(chunks[0]!.text.endsWith("alfa")).toBe(true);
  });

  it("hard-splits text that contains no boundary at all", () => {
    const chunks = chunk("x".repeat(1200), "a.md", opts);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]!.text).toBe("x".repeat(500));
  });
});
