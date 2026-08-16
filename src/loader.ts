import { readFile, readdir } from "node:fs/promises";
import { extname, join } from "node:path";

import type { LoadedDocument } from "./types";

const SUPPORTED_EXTENSIONS = new Set([".txt", ".md"]);

/**
 * Read every `.txt` and `.md` file in `dir`, in name order.
 *
 * Non-recursive and extension-filtered on purpose: the corpus is a flat folder
 * of prose, and silently indexing a stray `.json` or `node_modules` would make
 * retrieval results hard to explain.
 */
export async function loadDocuments(dir: string): Promise<LoadedDocument[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    throw new Error(`Cannot read documents directory ${dir} — does it exist?`);
  }

  const names = entries
    .filter((entry) => entry.isFile() && SUPPORTED_EXTENSIONS.has(extname(entry.name).toLowerCase()))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  return Promise.all(
    names.map(async (sourceFile) => ({
      sourceFile,
      text: await readFile(join(dir, sourceFile), "utf8"),
    })),
  );
}
