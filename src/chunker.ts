import type { Chunk } from "./types";

export interface ChunkOptions {
  size: number;
  overlap: number;
}

/**
 * Only accept a boundary in the back half of the window. Without this, a
 * sentence break ten characters in would produce a ten-character chunk.
 */
const MIN_FILL_RATIO = 0.5;

/** A Markdown ATX heading: `#` through `######` followed by whitespace. */
const HEADING = /^(#{1,6})\s+(.*)$/;

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
 * Prefers a sentence break, then a word break; returns `to` for a hard split
 * when the window contains neither. Paragraph breaks are not consulted here —
 * section boundaries are handled a level up, by `splitIntoSections`.
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
 * Pull an overlap start back to a word boundary.
 *
 * Without this the overlap begins mid-word — `"an asti jahtaamaan"` instead of
 * `"pintaan asti jahtaamaan"` — which puts a nonsense token at the head of
 * every chunk after the first.
 */
function snapToWordStart(text: string, index: number): number {
  let i = index;
  while (i > 0 && !/\s/.test(text[i - 1]!)) i--;
  return i;
}

interface Section {
  /** Offset of this section's first character in the source document. */
  offset: number;
  text: string;
  /** Heading trail, e.g. `Ahven > Syönti ja ajankohta`. Empty for a preamble. */
  path: string;
}

/**
 * Split a Markdown document at heading lines, tracking the heading trail.
 *
 * A section is the unit that must not be split across: mixing the tail of one
 * section with the head of the next dilutes the embedding badly enough to drop
 * the right chunk out of top-k entirely. Measured on this corpus, a cleanly
 * bounded section scored 0.661 against its own question where the mixed chunk
 * containing the same sentence scored 0.351.
 */
function splitIntoSections(text: string): Section[] {
  const sections: Section[] = [];
  const stack: string[] = [];

  let offset = 0;
  let bodyStart = 0;
  let path = "";

  const flush = (end: number) => {
    // Skip a heading that has no body of its own — a document title followed
    // straight by its first subsection. It carries nothing the children's
    // headingPath does not already carry, and would otherwise become a
    // six-character chunk that only adds noise to the store.
    if (text.slice(bodyStart, end).trim().length === 0) return;
    // From bodyStart, not start: the heading line itself is dropped because
    // `path` already carries it, and embedding it twice is wasted tokens.
    sections.push({ offset: bodyStart, text: text.slice(bodyStart, end), path });
  };

  for (const line of text.split("\n")) {
    const heading = HEADING.exec(line);
    if (heading) {
      flush(offset);
      const level = heading[1]!.length;
      stack.length = Math.min(stack.length, level - 1);
      stack[level - 1] = heading[2]!.trim();
      path = stack.filter(Boolean).join(" > ");
      bodyStart = offset + line.length + 1;
    }
    offset += line.length + 1; // +1 for the newline consumed by split
  }
  flush(text.length);

  return sections;
}

/**
 * Split a document into chunks that respect its heading structure.
 *
 * A section shorter than `size` becomes one chunk regardless of how short it
 * is; only oversized sections are sub-split, and overlap applies only to those
 * sub-splits — carrying text across a heading is what this design exists to
 * avoid.
 *
 * Chunk text is trimmed and `offset` adjusted so that
 * `source.slice(offset, offset + text.length) === text` always holds, which is
 * what lets a citation point back into the original document.
 */
export function chunk(text: string, sourceFile: string, opts: ChunkOptions): Chunk[] {
  if (opts.overlap >= opts.size) {
    throw new Error(`overlap (${opts.overlap}) must be smaller than size (${opts.size})`);
  }

  const chunks: Chunk[] = [];

  const push = (from: number, to: number, path: string) => {
    const slice = text.slice(from, to);
    const trimmed = slice.trim();
    if (trimmed.length === 0) return;

    chunks.push({
      id: `${sourceFile}#chunk${chunks.length}`,
      sourceFile,
      text: trimmed,
      offset: from + (slice.length - slice.trimStart().length),
      ...(path ? { headingPath: path } : {}),
    });
  };

  for (const section of splitIntoSections(text)) {
    const end = section.offset + section.text.length;
    let start = section.offset;

    while (start < end) {
      const limit = Math.min(start + opts.size, end);
      const stop = limit === end ? limit : findBreak(text, start, limit, opts.size);

      push(start, stop, section.path);

      if (stop >= end) break;
      start = Math.max(snapToWordStart(text, stop - opts.overlap), start + 1);
    }
  }

  return chunks;
}

/**
 * The text that actually gets embedded: the heading trail plus the body.
 *
 * Kept next to the chunker because this is the only place that knows the two
 * belong together. Retrieval and display use `chunk.text` unchanged.
 */
export function embeddableText(chunk: Chunk): string {
  return chunk.headingPath ? `${chunk.headingPath}\n${chunk.text}` : chunk.text;
}
