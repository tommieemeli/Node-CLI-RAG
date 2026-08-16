import type { Chunk } from "./types";

export const REDACTION_PLACEHOLDER = "[REDACTED]";

/**
 * Finnish personal identity code (henkilötunnus): DDMMYY, a century marker,
 * a three-digit individual number, and a checksum character.
 * The `\b` anchors keep it from matching inside longer digit runs.
 */
const HENKILOTUNNUS = /\b\d{6}[-+ABCDEFUVWXY]\d{3}[0-9A-Y]\b/g;

const EMAIL = /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g;

/**
 * Replace obvious direct identifiers with a placeholder.
 *
 * Deliberately shallow: two regexes, no NER. It exists to show where the
 * redaction seam belongs in the pipeline — between retrieval and the prompt —
 * not to be a real DLP control. See SPEC → Out of scope.
 */
export function redact(text: string): string {
  return text.replace(EMAIL, REDACTION_PLACEHOLDER).replace(HENKILOTUNNUS, REDACTION_PLACEHOLDER);
}

/** Redact chunk text, leaving id, source and offset untouched so citations still resolve. */
export function redactChunks(chunks: Chunk[]): Chunk[] {
  return chunks.map((chunk) => ({ ...chunk, text: redact(chunk.text) }));
}
