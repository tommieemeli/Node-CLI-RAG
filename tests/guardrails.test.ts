import { describe, expect, it } from "vitest";

import { REDACTION_PLACEHOLDER, redact, redactChunks } from "../src/guardrails";
import type { Chunk } from "../src/types";

describe("redact — emails", () => {
  it("replaces an email address", () => {
    expect(redact("Ota yhteyttä: matti.meikalainen@example.com kiitos")).toBe(
      `Ota yhteyttä: ${REDACTION_PLACEHOLDER} kiitos`,
    );
  });

  it("replaces every email, not just the first", () => {
    const out = redact("a@example.com ja b@example.fi");
    expect(out).toBe(`${REDACTION_PLACEHOLDER} ja ${REDACTION_PLACEHOLDER}`);
  });

  it("handles plus addressing and subdomains", () => {
    expect(redact("kalastus+uutiset@mail.example.co.uk")).toBe(REDACTION_PLACEHOLDER);
  });
});

describe("redact — henkilötunnus", () => {
  it.each(["131052-308T", "010594+123A", "290877A123B"])("replaces %s", (hetu) => {
    expect(redact(`Tunnus ${hetu} lopussa`)).toBe(`Tunnus ${REDACTION_PLACEHOLDER} lopussa`);
  });

  it("leaves ordinary dates alone", () => {
    const text = "Ahven syö 15.3.2024 aamulla ja 1.1.2025 illalla";
    expect(redact(text)).toBe(text);
  });

  it("leaves the corpus's depth and temperature ranges alone", () => {
    const text = "Kevät ja syksy: matalat lahdet, 1-4 m; kesä 3-8 m; noin 12-20 °C";
    expect(redact(text)).toBe(text);
  });

  it("does not match inside a longer digit run", () => {
    const text = "Viite 1234567-1234567 ei ole henkilötunnus";
    expect(redact(text)).toBe(text);
  });
});

describe("redact — passthrough and purity", () => {
  it("leaves text with nothing to redact untouched", () => {
    const text = "Ahven on parvikala, joka liikkuu rakenteiden läheisyydessä.";
    expect(redact(text)).toBe(text);
  });

  it("is pure: the same input always gives the same output", () => {
    const text = "a@example.com ja 131052-308T";
    expect(redact(text)).toBe(redact(text));
  });

  it("handles an empty string", () => {
    expect(redact("")).toBe("");
  });
});

describe("redactChunks", () => {
  const chunks: Chunk[] = [
    { id: "a.md#chunk0", sourceFile: "a.md", text: "Kysy a@example.com", offset: 12 },
    { id: "a.md#chunk1", sourceFile: "a.md", text: "Ei mitään arkaluontoista", offset: 40 },
  ];

  it("redacts chunk text", () => {
    expect(redactChunks(chunks)[0]!.text).toBe(`Kysy ${REDACTION_PLACEHOLDER}`);
  });

  it("preserves id, source and offset so citations still resolve", () => {
    const [first] = redactChunks(chunks);
    expect(first!.id).toBe("a.md#chunk0");
    expect(first!.sourceFile).toBe("a.md");
    expect(first!.offset).toBe(12);
  });

  it("does not mutate the input chunks", () => {
    redactChunks(chunks);
    expect(chunks[0]!.text).toBe("Kysy a@example.com");
  });
});
