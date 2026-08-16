import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type Config, loadConfig } from "../src/config";
import { MockProvider } from "../src/generation";
import { ask, ingest } from "../src/pipeline";

const FIXTURES = fileURLToPath(new URL("./fixtures", import.meta.url));

const ANSWER = "Saukko syö pääasiassa kalaa. [source: saukko.md#chunk0]";

/**
 * Full pipeline over two fixture documents, using the real embedding model and
 * a mock provider. Nothing here touches the Anthropic API.
 */
describe("end to end", () => {
  let dir: string;
  let config: Config;

  beforeAll(async () => {
    delete process.env.ANTHROPIC_API_KEY;
    dir = await mkdtemp(join(tmpdir(), "rag-e2e-"));
    config = loadConfig({ storePath: join(dir, "store.json") });
    await ingest(FIXTURES, config);
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("indexes both fixture documents", async () => {
    const result = await ingest(FIXTURES, config);
    expect(result.documents).toBe(2);
    expect(result.chunks).toBeGreaterThanOrEqual(2);
    expect(result.dimensions).toBe(384);
  });

  it("answers a question the corpus covers, from the right document", async () => {
    const provider = new MockProvider(ANSWER);
    const result = await ask("Mitä saukko syö?", config, () => provider);

    expect(result.refused).toBe(false);
    expect(result).toHaveProperty("answer", ANSWER);
    expect(result.hits[0]?.chunk.sourceFile).toBe("saukko.md");
  });

  it("hands the model the retrieved context and the question", async () => {
    const provider = new MockProvider(ANSWER);
    await ask("Mitä saukko syö?", config, () => provider);

    const [prompt] = provider.received;
    expect(prompt?.user).toContain("Mitä saukko syö?");
    expect(prompt?.user).toContain("kalaa");
    expect(prompt?.user).toContain("[source: saukko.md#chunk0]");
    expect(prompt?.system).toMatch(/only the context/i);
  });

  it("routes a question to the document that covers it", async () => {
    const provider = new MockProvider(ANSWER);
    const result = await ask("Milloin vaihteistoöljy vaihdetaan?", config, () => provider);

    expect(result.hits[0]?.chunk.sourceFile).toBe("venemoottori.md");
  });

  it("refuses a question the corpus does not cover, without reaching the model", async () => {
    let providerBuilt = false;
    const result = await ask("Kuinka korjaan polkupyörän renkaan?", config, () => {
      providerBuilt = true;
      return new MockProvider(ANSWER);
    });

    expect(result.refused).toBe(true);
    expect(providerBuilt).toBe(false);
    expect(result.hits[0]?.score ?? 0).toBeLessThan(config.similarityThreshold);
  });

  it("runs without an Anthropic API key", () => {
    expect(process.env.ANTHROPIC_API_KEY).toBeUndefined();
  });

  describe("question redaction", () => {
    it("keeps an email in the question away from the model", async () => {
      const provider = new MockProvider(ANSWER);
      const result = await ask(
        "Mitä saukko syö, kysyy matti.meikalainen@example.com?",
        config,
        () => provider,
      );

      expect(provider.received[0]?.user).not.toContain("matti.meikalainen@example.com");
      expect(provider.received[0]?.user).toContain("[REDACTED]");
      expect(result.questionRedacted).toBe(true);
    });

    it("keeps a henkilötunnus in the question away from the model", async () => {
      const provider = new MockProvider(ANSWER);
      await ask("Saukko ja tunnus 131052-308T, mitä se syö?", config, () => provider);

      expect(provider.received[0]?.user).not.toContain("131052-308T");
    });

    it("redacts before retrieval, so the store is searched with the same text", async () => {
      const provider = new MockProvider(ANSWER);
      const result = await ask("Mitä saukko syö, a@example.com?", config, () => provider);

      // Retrieval still lands on the right document with the address removed.
      expect(result.hits[0]?.chunk.sourceFile).toBe("saukko.md");
    });

    it("reports nothing redacted for an ordinary question", async () => {
      const provider = new MockProvider(ANSWER);
      const result = await ask("Mitä saukko syö?", config, () => provider);

      expect(result.questionRedacted).toBe(false);
    });

    it("flags redaction even when the question is then refused", async () => {
      const result = await ask(
        "Kuinka korjaan polkupyörän renkaan, a@example.com?",
        config,
        () => new MockProvider(ANSWER),
      );

      expect(result.refused).toBe(true);
      expect(result.questionRedacted).toBe(true);
    });
  });
});
