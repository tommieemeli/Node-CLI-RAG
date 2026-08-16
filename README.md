# rag-demo

A small retrieve-then-read RAG CLI over a folder of local documents. It answers
questions with citations, and refuses when the corpus does not cover the
question — twice, once before the model call and once in the prompt.

Embeddings run locally, so the only network dependency at answer time is the
Anthropic API. The test suite needs neither.

## Install

```bash
npm install
cp .env.example .env      # set ANTHROPIC_API_KEY for `ask`
```

Node 24+. The first `ingest` downloads the embedding model (~120 MB) and caches
it under `node_modules/`.

## Use

```bash
npm run ingest                              # index ./docs into .rag/store.json
npm run ask -- "Milloin ahven syö aktiivisimmin?"
npm test                                    # no API key or network needed
npm run typecheck
```

Ingesting the bundled corpus:

```
$ npm run ingest
Embedding with Xenova/paraphrase-multilingual-MiniLM-L12-v2 …
Loaded 3 documents → 11 chunks
Wrote 11 vectors (384 dimensions) to .rag/store.json
```

A question the corpus does not cover is refused before any model call, so this
one works without an API key:

```
$ npm run ask -- "Mikä on Suomen pääkaupunki?"
I don't know — nothing in the corpus is close enough to this question
(best score 0.105, threshold 0.32).
```

A question it does cover prints the model's answer, which carries inline
`[source: file.md#chunkN]` citations, followed by a line showing which chunks
were retrieved and at what score.

## How it works

```
ingest:  loader → chunker → embeddings → vectorstore → .rag/store.json
ask:     question → embeddings → vectorstore.search
                                      │
                          score < threshold? ──yes──→ "I don't know"  (no model call)
                                      │no
                            guardrails → prompt → generation → answer + citations
```

Each stage is one file in `src/`, is unit-tested, and can be read on its own.
`src/pipeline.ts` is the only place they are composed; `src/cli.ts` only parses
arguments and prints.

## Two refusal paths

The cheap one is retrieval-level: if the best cosine score is below
`SIMILARITY_THRESHOLD`, the CLI answers "I don't know" without spending a model
call. The threshold is calibrated against the corpus, not guessed — the
lowest-scoring answerable question measured 0.399 and the highest-scoring
unanswerable one 0.246, so it sits at the midpoint, 0.32.

The second is prompt-level: the system prompt tells the model to use only the
provided context and to say it does not know otherwise. That backstops a
marginal chunk that clears the threshold but does not actually contain the
answer.

## Retrieval quality

Measured over seven questions against `docs/`: top-1 picks the right document
6/7 times, top-3 contains it 7/7. The miss is the expected failure mode for a
small embedding model over documents with near-identical structure. Passing
three chunks to the model rather than one is what absorbs it — which is why
`TOP_K` is 3 and not 1.

## What you would swap for production

| Here | In production | Why |
|---|---|---|
| In-memory array + JSON file | pgvector, Pinecone, Qdrant | Survives restarts, scales past RAM, supports filtered search |
| Cosine over top-k | Hybrid search (BM25 + dense) then a reranker | Fixes exactly the top-1 miss above |
| Two redaction regexes | A real NER/DLP service | Regexes catch formats, not people |
| Local MiniLM embeddings | A hosted embedding endpoint | Better quality, no cold-start download, versioned |
| Whole answer at once | Streaming responses | The wait is visible at 1024 tokens |
| Single-user CLI | Auth and per-tenant index isolation | One shared store leaks across tenants |

## Configuration

Every key is optional; see `.env.example` and `src/config.ts` for defaults.
`CHUNK_SIZE`, `CHUNK_OVERLAP`, `TOP_K`, `SIMILARITY_THRESHOLD`,
`EMBEDDING_MODEL`, `ANTHROPIC_MODEL`, `STORE_PATH`.

Note that there is no temperature setting. Current Claude models reject
`temperature`, `top_p` and `top_k` with a 400; determinism comes from the
grounding rules in the system prompt and from `output_config.effort`.

## Known issues

`npm audit` reports four high-severity advisories, all transitive under
`@huggingface/transformers` (`onnxruntime-node` → `adm-zip`, and `sharp`) with
no fix currently published. Neither reachable path is exercised here: the
`adm-zip` issue needs a crafted model archive, and `sharp` is image processing
this project never invokes. Worth re-checking before any deployment that
accepts untrusted model sources.
