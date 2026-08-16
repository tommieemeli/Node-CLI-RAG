import type { Chunk, Prompt } from "./types";

/** The grounding contract from SPEC → "Refusal / grounding rule". */
export const SYSTEM_PROMPT = `You answer questions about a small set of documents.

Rules:
- Use only the context provided in the user message. Do not use outside knowledge.
- If the context does not contain the answer, say you do not know. Do not guess.
- Cite a source for every claim, copying the id exactly as given, in the form [source: file.md#chunk3].
- Answer in the same language as the question.
- Be brief. Answer the question asked and stop.`;

/** The one citation format the whole project agrees on. */
export function formatCitation(chunk: Chunk): string {
  return `[source: ${chunk.id}]`;
}

/**
 * Build the system/user pair for a grounded answer.
 *
 * Each chunk is labelled with its citation above the text, so the model copies
 * a string it can see rather than reconstructing one from a filename.
 *
 * The question goes in the user message only. Interpolating it into the system
 * prompt would put untrusted input where the rules live.
 */
export function buildPrompt(question: string, chunks: Chunk[]): Prompt {
  if (chunks.length === 0) {
    throw new Error(
      "buildPrompt called with no context — the caller must handle the refusal path before prompting.",
    );
  }

  const context = chunks
    .map((chunk) => `${formatCitation(chunk)}\n${chunk.text}`)
    .join("\n\n");

  return {
    system: SYSTEM_PROMPT,
    user: `Context:\n\n${context}\n\nQuestion: ${question}`,
  };
}
