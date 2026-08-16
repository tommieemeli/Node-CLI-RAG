import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadDocuments } from "../src/loader";

describe("loadDocuments", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ragdocs-"));
    await writeFile(join(dir, "beeta.md"), "# Beeta\n", "utf8");
    await writeFile(join(dir, "alfa.txt"), "Alfa\n", "utf8");
    await writeFile(join(dir, "notes.json"), "{}", "utf8");
    await writeFile(join(dir, "image.png"), "not really a png", "utf8");
    await mkdir(join(dir, "nested"));
    await writeFile(join(dir, "nested", "deep.md"), "# Deep\n", "utf8");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("reads .txt and .md files and skips every other extension", async () => {
    const docs = await loadDocuments(dir);
    expect(docs.map((d) => d.sourceFile)).toEqual(["alfa.txt", "beeta.md"]);
  });

  it("does not descend into subdirectories", async () => {
    const docs = await loadDocuments(dir);
    expect(docs.map((d) => d.sourceFile)).not.toContain("deep.md");
  });

  it("returns documents in name order, so ingest is deterministic", async () => {
    await writeFile(join(dir, "aaa.md"), "first", "utf8");
    const docs = await loadDocuments(dir);
    expect(docs.map((d) => d.sourceFile)).toEqual(["aaa.md", "alfa.txt", "beeta.md"]);
  });

  it("reads as UTF-8 so Finnish characters survive", async () => {
    await writeFile(join(dir, "suomi.md"), "Ahven syö hämärässä. Ääkköset: äöå", "utf8");
    const docs = await loadDocuments(dir);
    const suomi = docs.find((d) => d.sourceFile === "suomi.md");
    expect(suomi?.text).toContain("syö hämärässä");
    expect(suomi?.text).toContain("äöå");
  });

  it("uses the basename as sourceFile, since that is what appears in citations", async () => {
    const docs = await loadDocuments(dir);
    expect(docs[0]?.sourceFile).toBe("alfa.txt");
  });

  it("reports a missing directory with an actionable message", async () => {
    await expect(loadDocuments(join(dir, "absent"))).rejects.toThrow(/does it exist/i);
  });

  it("returns an empty list for a directory with no supported files", async () => {
    const empty = await mkdtemp(join(tmpdir(), "ragempty-"));
    try {
      expect(await loadDocuments(empty)).toEqual([]);
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });
});
