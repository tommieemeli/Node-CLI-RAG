# RAG CLI — Spec

## Goal
Small Node.js/TypeScript CLI that answers questions over a handful of local
text files using retrieve-then-read RAG. Built to be demoable in ~30 min,
runnable fully offline (no external API needed for embeddings).

## Stack
- **Runtime:** Node.js + TypeScript
- **CLI:** `commander`
- **Embeddings:** `@xenova/transformers` (local model, e.g. `Xenova/all-MiniLM-L6-v2`)
- **Generation:** Anthropic SDK (Claude) behind a provider interface, with a
  `MockProvider` fallback for offline/deterministic testing
- **Vector store:** in-memory array + cosine similarity (no external DB)
- **Testing:** `vitest`

## Layers & where they live

| Layer | File | Notes |
|---|---|---|
| Config | `config.ts` | chunk size/overlap, top-k, model names, via `.env` |
| Loader | `loader.ts` | reads `.txt`/`.md` files from `docs/` |
| Chunking | `chunker.ts` | pure function: recursive char split, size + overlap, keeps source + offset metadata |
| Embeddings | `embeddings.ts` | wraps xenova pipeline, `embed(text): number[]` |
| Vector store | `vectorstore.ts` | `upsert(id, vector, metadata)`, `search(query, k)`; upsert keyed by chunk id → idempotent |
| Guardrails | `guardrails.ts` | regex redaction (emails, personal IDs) run on chunks before they reach the prompt |
| Generation | `generation.ts` | `LLMProvider` interface + `ClaudeProvider` + `MockProvider`, low temperature |
| Prompting | `prompt.ts` | system prompt: answer only from context, cite source file + chunk id, say "I don't know" if context insufficient |
| Orchestration | `cli.ts` | wires loader → chunker → embeddings → vectorstore → guardrails → prompt → generation |

## Flow
1. `rag ingest ./docs` — load, chunk, embed, upsert into store (persisted to a JSON file for reuse between runs)
2. `rag ask "question"` — embed query, retrieve top-k chunks, redact, build prompt, call LLM, print answer + `[source: file.md#chunk3]` citations

## Chunking
- Size: ~500 chars, overlap ~50 chars
- Split on paragraph/sentence boundaries where possible, hard-split as fallback
- Each chunk keeps `{ id, sourceFile, text, offset }`

## Retrieval
- Cosine similarity, top-k = 3 (configurable)
- If best score < threshold → skip generation, return "I don't know" directly (cheap refusal, no LLM call needed)

## Refusal / grounding rule (prompt-level)
"Only use the provided context. If the answer isn't in the context, say you don't know. Always cite the source file for any claim."

## Testing
- `chunker.test.ts` — pure function, fixed input → expected chunks
- `vectorstore.test.ts` — cosine sim math, idempotent upsert
- `generation.test.ts` — `MockProvider` returns canned response, verifies prompt assembly and citation formatting
- One end-to-end test with 2 tiny fixture docs and a known Q&A pair

## Out of scope (mention, don't build)
- Real vector DB (pgvector/Pinecone) — would swap in for prod
- Reranking, hybrid search
- Auth, multi-tenant isolation, streaming responses
- PII detection beyond simple regex (would use a proper NER/DLP service in prod)
