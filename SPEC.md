# RAG CLI — Spec

## Objective

Small Node.js/TypeScript CLI that answers questions over a handful of local
text files using retrieve-then-read RAG.

- **User:** a developer demoing how grounded retrieval + citation + refusal work.
- **Why:** show the whole RAG pipeline end-to-end in code small enough to read in
  one sitting, with each layer swappable for a production equivalent.
- **Corpus:** `docs/` — Finnish-language fishing notes (`ahven.md`, `kuha.md`,
  `viehevalinta.md`). The corpus language drives the embedding-model choice
  (see Stack).
- **Demoable in ~30 min.** Embeddings run locally; the only network dependency
  at answer time is the Anthropic API, and `MockProvider` removes even that.

## Tech Stack

- **Runtime:** Node.js 24 (ESM, `"type": "module"`), TypeScript 5, `tsx` for
  running TS directly — no build step in the demo path
- **CLI:** `commander`
- **Embeddings:** `@huggingface/transformers` v3 (the current package; the
  `@xenova/transformers` name is the deprecated v2 line), model
  `Xenova/paraphrase-multilingual-MiniLM-L12-v2` — 384 dims, handles Finnish.
  `all-MiniLM-L6-v2` is English-only and would retrieve poorly on this corpus.
- **Generation:** Anthropic SDK (`@anthropic-ai/sdk`), model `claude-opus-5`,
  behind an `LLMProvider` interface with a `MockProvider` fallback for
  offline/deterministic testing
- **Vector store:** in-memory array + cosine similarity, persisted to JSON
  (no external DB)
- **Testing:** `vitest`

**No `temperature`.** Current Claude models (Opus 5, Sonnet 5, Opus 4.7/4.8)
reject `temperature`/`top_p`/`top_k` with a 400. Determinism comes from the
prompt and from `output_config: { effort: "low" }`, not a sampling parameter.

## Commands

```
npm install              # install dependencies
npm run ingest           # rag ingest ./docs  → writes .rag/store.json
npm run ask -- "..."     # rag ask "question" → prints answer + citations
npm test                 # vitest run
npm run test:watch       # vitest
npm run typecheck        # tsc --noEmit
npm run lint             # tsc --noEmit (no separate linter in this project)
```

The CLI entry point is `src/cli.ts`, run via `tsx`. `npm link` to get a global
`rag` binary is out of scope for the demo.

## Project Structure

```
src/                 → application source
  cli.ts             → commander wiring, the only file that does I/O + orchestration
  config.ts          → all tunables, read from .env with defaults
  types.ts           → Chunk, ScoredChunk, LLMProvider, StoredVector
  loader.ts          → reads .txt/.md from a directory
  chunker.ts         → pure: text → Chunk[]
  embeddings.ts      → wraps the transformers pipeline
  vectorstore.ts     → upsert/search/save/load
  guardrails.ts      → pure: regex redaction
  prompt.ts          → pure: chunks + question → system/user messages
  generation.ts      → LLMProvider, ClaudeProvider, MockProvider
tests/               → vitest specs, one per src module
  fixtures/          → tiny docs for the end-to-end test
docs/                → the corpus being indexed
tasks/               → plan.md, todo.md (planning artifacts)
.rag/                → persisted store (gitignored)
```

## Code Style

Named exports, no default exports. Pure functions take options as a typed
object. Errors thrown with actionable messages; no silent fallbacks.

```ts
// src/chunker.ts
export interface ChunkOptions {
  size: number;
  overlap: number;
}

/** Split text into overlapping chunks, preferring paragraph then sentence boundaries. */
export function chunk(text: string, sourceFile: string, opts: ChunkOptions): Chunk[] {
  if (opts.overlap >= opts.size) {
    throw new Error(`overlap (${opts.overlap}) must be smaller than size (${opts.size})`);
  }
  // ...
}
```

- `camelCase` for values, `PascalCase` for types, `SCREAMING_SNAKE` for env keys
- Every module that isn't `cli.ts` must be importable without side effects
- Comments explain *why*, not *what*; no comment restating the next line

## Flow

1. `rag ingest ./docs` — load, chunk, embed, upsert into store, persist to
   `.rag/store.json` for reuse between runs
2. `rag ask "question"` — embed query, retrieve top-k chunks, redact, build
   prompt, call LLM, print answer + `[source: file.md#chunk3]` citations

## Chunking

- Size: ~500 chars, overlap ~50 chars
- Split on paragraph/sentence boundaries where possible, hard-split as fallback
- Each chunk keeps `{ id, sourceFile, text, offset }`
- `id` is `` `${sourceFile}#chunk${n}` `` — stable across runs, which is what
  makes upsert idempotent

## Retrieval

- Cosine similarity, top-k = 3 (configurable)
- If best score < `SIMILARITY_THRESHOLD` (default `0.32`) → skip generation,
  return "I don't know" directly (cheap refusal, no LLM call needed)

## Refusal / grounding rule (prompt-level)

"Only use the provided context. If the answer isn't in the context, say you
don't know. Always cite the source file for any claim."

## Testing Strategy

`vitest`, specs in `tests/`, named `<module>.test.ts`. No coverage gate — the
bar is that every pure function and every branch of the refusal logic is
covered.

| Level | What | File |
|---|---|---|
| Unit | chunk sizes, overlap, boundary preference, `id` stability | `chunker.test.ts` |
| Unit | cosine math, top-k ordering, idempotent upsert, save/load round-trip | `vectorstore.test.ts` |
| Unit | email/henkilötunnus redaction, non-match passthrough | `guardrails.test.ts` |
| Unit | prompt assembly, citation formatting | `prompt.test.ts` |
| Unit | `MockProvider` canned response; `ClaudeProvider` request shape | `generation.test.ts` |
| Integration | loader reads only `.txt`/`.md`, skips others | `loader.test.ts` |
| E2E | 2 fixture docs → ingest → ask → known answer + citation, `MockProvider` | `e2e.test.ts` |

Tests must not hit the Anthropic API. `embeddings.ts` is exercised once in the
E2E test with the real local model (first run downloads it, ~120 MB, cached).

## Boundaries

**Always:**
- Run `npm test` before each commit
- Keep `src/` modules side-effect-free on import
- Update this spec in the same commit as any decision that contradicts it

**Ask first:**
- Adding a dependency beyond those listed in Tech Stack
- Changing the embedding model or the persisted store format
- Any change to the refusal threshold or grounding rule

**Never:**
- Commit `.env`, API keys, or `.rag/store.json`
- Call the Anthropic API from a test
- Delete or skip a failing test to make the suite green

## Success Criteria

1. `npm install && npm run ingest` completes on a clean clone and writes
   `.rag/store.json` containing one vector per chunk of the three `docs/` files.
2. Re-running `npm run ingest` produces a byte-identical store (idempotent upsert).
3. `npm run ask -- "Milloin ahven syö aktiivisimmin?"` answers from `ahven.md`
   and prints a `[source: ahven.md#chunkN]` citation.
4. `npm run ask -- "Mikä on Suomen pääkaupunki?"` returns "I don't know" via the
   threshold path, with **no** Anthropic API call made.
5. `npm test` passes with zero network access and no `ANTHROPIC_API_KEY` set.
6. Every layer in Project Structure exists as its own file and is unit-tested.

## Resolved during implementation

- **Embedding model confirmed.** `Xenova/paraphrase-multilingual-MiniLM-L12-v2`
  loads and returns 384-dimensional L2-normalised vectors. The fallback
  (`Xenova/multilingual-e5-small`) was not needed.
- **Threshold calibrated, not guessed.** Measured against the real corpus over
  five answerable and four unanswerable questions:

  | | Score |
  |---|---|
  | Lowest-scoring answerable question | 0.399 |
  | Highest-scoring unanswerable question | 0.246 |
  | Margin | 0.153 |

  `SIMILARITY_THRESHOLD` is set to **0.32**, the midpoint, so a false refusal
  and a false pass have equal headroom. Erring low is the safer direction: a
  marginal chunk that slips through still meets the prompt-level grounding
  rule, which is the second line of defence.

## Open Questions

- The corpus is three documents. The margin above will narrow as the corpus
  grows and chunks start competing; re-run the calibration when it does.

## Out of scope (mention, don't build)

- Real vector DB (pgvector/Pinecone) — would swap in for prod
- Reranking, hybrid search
- Auth, multi-tenant isolation, streaming responses
- PII detection beyond simple regex (would use a proper NER/DLP service in prod)
- `npm link` / published binary
