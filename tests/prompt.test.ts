import { describe, expect, it } from "vitest";

import { SYSTEM_PROMPT, buildPrompt, formatCitation } from "../src/prompt";
import type { Chunk } from "../src/types";

const chunks: Chunk[] = [
  {
    id: "ahven.md#chunk1",
    sourceFile: "ahven.md",
    text: "Ahven syö aktiivisimmin aamu- ja iltahämärässä.",
    offset: 100,
  },
  {
    id: "kuha.md#chunk0",
    sourceFile: "kuha.md",
    text: "Kuha suosii sameaa vettä.",
    offset: 0,
  },
];

describe("formatCitation", () => {
  it("uses exactly the format the spec pins", () => {
    expect(formatCitation(chunks[0]!)).toBe("[source: ahven.md#chunk1]");
  });
});

describe("SYSTEM_PROMPT", () => {
  it("states the three parts of the grounding rule", () => {
    expect(SYSTEM_PROMPT).toMatch(/only the context/i);
    expect(SYSTEM_PROMPT).toMatch(/do not know/i);
    expect(SYSTEM_PROMPT).toMatch(/cite/i);
  });

  it("shows the citation format so the model has a template to copy", () => {
    expect(SYSTEM_PROMPT).toContain("[source: file.md#chunk3]");
  });
});

describe("buildPrompt", () => {
  const question = "Milloin ahven syö aktiivisimmin?";
  const prompt = buildPrompt(question, chunks);

  it("puts the grounding rules in the system message", () => {
    expect(prompt.system).toBe(SYSTEM_PROMPT);
  });

  it("includes every chunk's text in the user message", () => {
    for (const chunk of chunks) {
      expect(prompt.user).toContain(chunk.text);
    }
  });

  it("labels each chunk with its citation so the model can copy it verbatim", () => {
    for (const chunk of chunks) {
      expect(prompt.user).toContain(`[source: ${chunk.id}]\n${chunk.text}`);
    }
  });

  it("preserves chunk order, so the best hit is read first", () => {
    expect(prompt.user.indexOf("ahven.md#chunk1")).toBeLessThan(
      prompt.user.indexOf("kuha.md#chunk0"),
    );
  });

  it("puts the question in the user message", () => {
    expect(prompt.user).toContain(question);
  });

  it("keeps the question out of the system message, where the rules live", () => {
    expect(prompt.system).not.toContain(question);
  });

  it("refuses to build a prompt with no context", () => {
    expect(() => buildPrompt(question, [])).toThrow(/refusal path/i);
  });
});
