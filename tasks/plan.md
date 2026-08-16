# Implementation Plan — RAG CLI

Derived from `SPEC.md`. Fourteen steps, each one commit. Every step is
independently verifiable and touches at most five files.

## Dependency graph

```
S1 scaffolding
      │
      ├──────────────┬──────────────┬──────────────┐
      ▼              ▼              ▼              ▼
S2 config      S4 chunker     S5 loader     S7 guardrails      (parallel-safe)
   +types           │              │              │
      │             │              │              │
      ▼             │              │              │
S3 vectorstore ◄────┘              │              │
      │                            │              │
      ▼                            │              │
S6 embeddings ─────────────────────┘              │
      │                                           │
      ▼                                           │
S8 prompt ◄───────────────────────────────────────┘
      │
      ▼
S9 generation
      │
      ▼
S10 cli skeleton ──► S11 ingest ──► S12 ask ──► S13 e2e ──► S14 README
```

**Build order rule:** pure functions before I/O, I/O before wiring. Steps 4, 5,
and 7 have no dependency on each other and can be done in any order (or in
parallel by separate agents) once step 2 lands.

## Phases

### Phase A — Foundation (S1–S3)

Get a repo that installs, typechecks, and runs one green test. Nothing here
touches the model or the corpus, so failures are unambiguous.

| Step | What | Why here |
|---|---|---|
| S1 | `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, dir skeleton | Everything else needs a working `npm test` |
| S2 | `src/types.ts`, `src/config.ts` | The shared vocabulary every later module imports |
| S3 | `src/vectorstore.ts` + tests | Pure math + a JSON round-trip; no external deps at all |

**Checkpoint A:** `npm test` green, `npm run typecheck` clean, vectorstore
proven idempotent.

### Phase B — Pure pipeline stages (S4–S8)

Each of these is a pure function with a unit test written first. None of them
require the network, the model, or an API key.

| Step | What | Risk |
|---|---|---|
| S4 | `src/chunker.ts` + tests | Boundary-preference logic is the fiddliest code in the project — TDD it |
| S5 | `src/loader.ts` + tests | Low. Watch for encoding: corpus is UTF-8 Finnish with ä/ö |
| S6 | `src/embeddings.ts` | **Highest risk step.** First model download; repo id may be wrong |
| S7 | `src/guardrails.ts` + tests | Finnish henkilötunnus format (`DDMMYY[+-A]NNNC`) differs from a US SSN regex |
| S8 | `src/prompt.ts` + tests | Low. Pin the citation format here so S12 has nothing to invent |

**Checkpoint B:** every pure stage unit-tested; `embeddings.ts` proven by
embedding one sentence and asserting a 384-length vector.

### Phase C — Generation (S9)

| Step | What |
|---|---|
| S9 | `src/generation.ts` — `LLMProvider`, `MockProvider`, `ClaudeProvider` + tests |

`ClaudeProvider` uses `claude-opus-5`, `max_tokens: 1024`,
`output_config: { effort: "low" }`, and **no** `temperature` (see SPEC → Stack).
Its test asserts the request shape against a stubbed client — it never calls the
API.

**Checkpoint C:** `MockProvider` answers a canned question; `ClaudeProvider`
constructs a valid request with no sampling parameters.

### Phase D — Wiring (S10–S12)

| Step | What |
|---|---|
| S10 | `src/cli.ts` skeleton — commander, two subcommands, both stubbed |
| S11 | `ingest` wired end-to-end against the real `docs/` |
| S12 | `ask` wired, including the below-threshold refusal short-circuit |

S12 is where `SIMILARITY_THRESHOLD` gets calibrated: run one answerable and one
unanswerable question, record both scores, pick a threshold between them, and
write the observed numbers into the spec's Open Questions section.

**Checkpoint D:** all six Success Criteria in `SPEC.md` demonstrably pass.

### Phase E — Proof and docs (S13–S14)

| Step | What |
|---|---|
| S13 | `tests/e2e.test.ts` + `tests/fixtures/` — full pipeline, `MockProvider` |
| S14 | `README.md` — install, run, and the swap-for-production notes |

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Embedding model repo id wrong or ONNX weights missing | S6 is its own commit and its own verification. Fallback `Xenova/multilingual-e5-small` is named in the spec. Model name lives in `config.ts` so the swap is one line. |
| English-only model retrieves badly on Finnish | Already corrected in the spec. S12 calibration would expose a regression: an answerable question scoring below an unanswerable one. |
| First model download is slow / offline CI | Only S6 and S13 touch the real model. All other tests are model-free, so the suite stays fast. |
| `temperature` reflex reintroduced during coding | Spec calls it out; S9's test asserts the request has no sampling params. |
| Threshold guessed wrong → refuses everything or nothing | S12 calibrates against real scores rather than shipping the guess. |

## Commit convention

One commit per step, present tense, scope-prefixed:

```
feat(chunker): split text on paragraph boundaries with overlap
test(vectorstore): cover cosine ordering and idempotent upsert
docs(spec): complete commands, boundaries, and success criteria
```

Each commit must leave `npm test` green.
