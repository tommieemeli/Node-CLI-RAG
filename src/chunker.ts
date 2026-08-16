import type { Chunk } from "./types";

export interface ChunkOptions {
  size: number;
  overlap: number;
}

/**
 * Only accept a boundary in the back half of the window. Without this, a
 * paragraph break ten characters in would produce a ten-character chunk.
 */
const MIN_FILL_RATIO = 0.5;

/** Index just past the last sentence terminator in `text[from..to)`, or null. */
function lastSentenceBreak(text: string, from: number, to: number): number | null {
  const window = text.slice(from, to);
  const terminator = /[.!?…]["'”’)\]]?(\s)/g;

  let last: number | null = null;
  for (const match of window.matchAll(terminator)) {
    // Break after the terminator and its trailing whitespace.
    last = from + match.index + match[0].length;
  }
  return last;
}

/** Index just past the last whitespace run in `text[from..to)`, or null. */
function lastWordBreak(text: string, from: number, to: number): number | null {
  for (let i = to - 1; i > from; i--) {
    if (/\s/.test(text[i]!)) return i + 1;
  }
  return null;
}

/**
 * Where to end a chunk that starts at `from` and may run to `to`.
 * Prefers a paragraph break, then a sentence break, then a word break;
 * returns `to` for a hard split when the window contains none of them.
 */
function findBreak(text: string, from: number, to: number, size: number): number {
  const earliest = from + Math.floor(size * MIN_FILL_RATIO);

  const paragraph = text.lastIndexOf("\n\n", to);
  if (paragraph >= earliest && paragraph + 2 <= to) return paragraph + 2;

  const sentence = lastSentenceBreak(text, earliest, to);
  if (sentence !== null) return sentence;

  const word = lastWordBreak(text, earliest, to);
  if (word !== null) return word;

  return to;
}

/**
 * Split a document into overlapping chunks that respect natural boundaries.
 *
 * Chunk text is trimmed, and `offset` is adjusted so that
 * `source.slice(offset, offset + text.length) === text` always holds — that is
 * what lets a citation point back into the original document.
 */
export function chunk(text: string, sourceFile: string, opts: ChunkOptions): Chunk[] {
  if (opts.overlap >= opts.size) {
    throw new Error(`overlap (${opts.overlap}) must be smaller than size (${opts.size})`);
  }

  const chunks: Chunk[] = [];
  let start = 0;

  while (start < text.length) {
    const limit = Math.min(start + opts.size, text.length);
    const end = limit === text.length ? limit : findBreak(text, start, limit, opts.size);

    const slice = text.slice(start, end);
    const leading = slice.length - slice.trimStart().length;
    const trimmed = slice.trim();

    if (trimmed.length > 0) {
      chunks.push({
        id: `${sourceFile}#chunk${chunks.length}`,
        sourceFile,
        text: trimmed,
        offset: start + leading,
      });
    }

    if (end >= text.length) break;
    // Step back by `overlap`, but never far enough to revisit this start.
    start = Math.max(end - opts.overlap, start + 1);
  }

  return chunks;
}
