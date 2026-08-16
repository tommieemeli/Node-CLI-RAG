# rag-demo

Small Node.js/TypeScript RAG CLI. The full design is in `SPEC.md` — read it before
implementing anything, and update it when a decision changes.

## Agent skills

Project-level skills live in `.claude/skills/` and are checked into git, so anyone
cloning this repo gets the same workflow. Invoke them with `/<skill-name>`, e.g.
`/spec-driven-development`.

Workflow for this project:

- `/spec-driven-development` — before any new feature; keep `SPEC.md` as the source of truth
- `/planning-and-task-breakdown` — turn a spec section into ordered tasks
- `/test-driven-development` — the chunker, vector store and prompt assembly are all
  pure enough to test first (`vitest`)
- `/incremental-implementation` — land one layer at a time, not the whole pipeline at once
- `/code-review-and-quality` — before merging

See `.claude/skills/README.md` for the full list.
