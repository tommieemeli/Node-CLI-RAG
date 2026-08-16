# Task List — RAG CLI

One task per commit. Ordered by dependency, not importance. See `plan.md` for
the phase structure and `SPEC.md` for the contract each task implements.

---

## Phase A — Foundation

- [ ] **S1: Scaffold the project**
  - Acceptance: `npm install` succeeds; `npm test` runs vitest and reports 0
    tests (not an error); `npm run typecheck` is clean; `.rag/` and `.env` are
    gitignored
  - Verify: `npm install && npm run typecheck && npm test`
  - Files: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`
  - Commit: `chore: scaffold TypeScript + vitest project`

- [ ] **S2: Shared types and config**
  - Acceptance: `Chunk`, `ScoredChunk`, `StoredVector`, `LLMProvider` exported
    from `types.ts`; `config.ts` reads `CHUNK_SIZE`, `CHUNK_OVERLAP`, `TOP_K`,
    `SIMILARITY_THRESHOLD`, `EMBEDDING_MODEL`, `ANTHROPIC_MODEL`, `STORE_PATH`
    from `.env` with the spec's defaults; importing either has no side effects
  - Verify: `npm run typecheck`; a scratch import prints defaults with no `.env`
  - Files: `src/types.ts`, `src/config.ts`, `.env.example`
  - Commit: `feat(config): add shared types and env-backed configuration`

- [ ] **S3: Vector store**
  - Acceptance: `upsert` keyed by chunk id replaces rather than appends;
    `search` returns top-k by cosine, descending; `save`/`load` round-trip to
    JSON without precision loss that changes ordering
  - Verify: `npm test -- vectorstore`
  - Files: `src/vectorstore.ts`, `tests/vectorstore.test.ts`
  - Commit: `feat(vectorstore): in-memory cosine store with JSON persistence`

---

## Phase B — Pure pipeline stages

- [ ] **S4: Chunker**
  - Acceptance: respects `size`/`overlap`; prefers paragraph then sentence
    boundaries; hard-splits when no boundary exists inside the window; throws
    when `overlap >= size`; ids are `file.md#chunk0`, `#chunk1`, … and stable
    across runs
  - Verify: `npm test -- chunker`
  - Files: `src/chunker.ts`, `tests/chunker.test.ts`
  - Commit: `feat(chunker): split text on boundaries with configurable overlap`

- [ ] **S5: Loader**
  - Acceptance: returns `{ path, text }` for every `.txt`/`.md` in a directory,
    skips other extensions and subdirectories, reads as UTF-8 (ä/ö intact),
    throws a clear error if the directory is missing
  - Verify: `npm test -- loader`; manual run over `docs/` yields 3 files
  - Files: `src/loader.ts`, `tests/loader.test.ts`
  - Commit: `feat(loader): read .txt and .md documents from a directory`

- [ ] **S6: Embeddings** ⚠️ highest-risk step
  - Acceptance: `embed(text): Promise<number[]>` returns a 384-length vector;
    the pipeline is created once and reused across calls; the model id comes
    from `config.ts`
  - Verify: script embedding one Finnish sentence prints `384`. If the repo id
    404s, switch to `Xenova/multilingual-e5-small` and record it in the spec.
  - Files: `src/embeddings.ts`
  - Commit: `feat(embeddings): wrap local transformers pipeline`

- [ ] **S7: Guardrails**
  - Acceptance: redacts emails and Finnish henkilötunnus
    (`DDMMYY[+-A]NNNC`) to `[REDACTED]`; leaves ordinary text and dates
    untouched; pure — same input, same output
  - Verify: `npm test -- guardrails`
  - Files: `src/guardrails.ts`, `tests/guardrails.test.ts`
  - Commit: `feat(guardrails): redact emails and personal identity codes`

- [ ] **S8: Prompt assembly**
  - Acceptance: builds the system prompt from the spec's grounding rule; renders
    each chunk with its id so the model can cite it; citation format is exactly
    `[source: file.md#chunk3]`; question is not interpolated into the system
    prompt
  - Verify: `npm test -- prompt`
  - Files: `src/prompt.ts`, `tests/prompt.test.ts`
  - Commit: `feat(prompt): assemble grounded system and user messages`

---

## Phase C — Generation

- [ ] **S9: LLM providers**
  - Acceptance: `LLMProvider` has one method, `complete(messages): Promise<string>`;
    `MockProvider` returns a canned answer and records what it received;
    `ClaudeProvider` sends `model: "claude-opus-5"`, `max_tokens: 1024`,
    `output_config: { effort: "low" }`, and **no** `temperature`/`top_p`/`top_k`;
    a missing `ANTHROPIC_API_KEY` fails with an actionable message
  - Verify: `npm test -- generation` — asserts request shape against a stub; no
    network call
  - Files: `src/generation.ts`, `tests/generation.test.ts`
  - Commit: `feat(generation): add LLMProvider with Claude and mock backends`

---

## Phase D — Wiring

- [ ] **S10: CLI skeleton**
  - Acceptance: `rag ingest <dir>` and `rag ask <question>` are registered with
    commander, `--help` documents both, both currently exit non-zero with
    "not implemented"
  - Verify: `npm run ask -- --help`
  - Files: `src/cli.ts`, `package.json` (scripts)
  - Commit: `feat(cli): register ingest and ask subcommands`

- [ ] **S11: Wire `ingest`**
  - Acceptance: loads → chunks → embeds → upserts → persists to `.rag/store.json`;
    prints file and chunk counts; re-running produces a byte-identical store
  - Verify: `npm run ingest`, then re-run and `git diff`-style compare the two
    store files (Success Criteria 1 and 2)
  - Files: `src/cli.ts`
  - Commit: `feat(cli): wire the ingest pipeline end to end`

- [ ] **S12: Wire `ask` + calibrate the threshold**
  - Acceptance: loads the store, embeds the question, retrieves top-k, redacts,
    prompts, prints answer + citations; a top score below
    `SIMILARITY_THRESHOLD` short-circuits to "I don't know" **without**
    constructing a provider or calling the API
  - Verify: Success Criteria 3 and 4 — the answerable Finnish question cites
    `ahven.md`; "Mikä on Suomen pääkaupunki?" refuses with no API call. Record
    both observed scores and the chosen threshold in `SPEC.md` → Open Questions.
  - Files: `src/cli.ts`, `src/config.ts`, `SPEC.md`
  - Commit: `feat(cli): wire ask with threshold-based refusal`

---

## Phase E — Proof and docs

- [ ] **S13: End-to-end test**
  - Acceptance: two tiny fixture docs → ingest → ask → asserts the known answer
    and its citation, using `MockProvider`; a second case asserts the refusal
    path; runs with no `ANTHROPIC_API_KEY` set
  - Verify: `ANTHROPIC_API_KEY= npm test` (Success Criterion 5)
  - Files: `tests/e2e.test.ts`, `tests/fixtures/*.md`
  - Commit: `test(e2e): cover ingest-to-answer and the refusal path`

- [ ] **S14: README**
  - Acceptance: install, ingest, ask, and test commands copy-pasteable; a short
    "what you'd swap for production" table mapping each layer to its real-world
    equivalent (from SPEC → Out of scope)
  - Verify: follow the README on a clean clone; all commands work as written
  - Files: `README.md`
  - Commit: `docs: add README with usage and production-swap notes`
