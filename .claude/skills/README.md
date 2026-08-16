# Project skills

Each subdirectory is one agent skill: a `SKILL.md` with YAML frontmatter
(`name`, `description`) plus the instructions Claude follows when the skill is
invoked. Claude Code discovers them automatically from `.claude/skills/`.

Use one with `/<name>`, for example `/spec-driven-development`.

| Skill | Use when |
|---|---|
| `spec-driven-development` | Starting a feature with no spec, or requirements are vague |
| `planning-and-task-breakdown` | Turning a spec into ordered, implementable tasks |
| `incremental-implementation` | A change touches more than one file |
| `test-driven-development` | Implementing logic, fixing a bug, changing behavior |
| `debugging-and-error-recovery` | Tests fail or behavior doesn't match expectations |
| `code-review-and-quality` | Before merging any change |
| `code-simplification` | Refactoring for clarity without changing behavior |
| `api-and-interface-design` | Designing module boundaries or public interfaces |
| `security-and-hardening` | Handling untrusted input, secrets, external services |
| `documentation-and-adrs` | Recording an architectural decision |
| `git-workflow-and-versioning` | Committing, branching, releasing |
| `source-driven-development` | Grounding implementation in official library docs |
| `observability-and-instrumentation` | Adding logging, metrics, tracing |
| `performance-optimization` | Profiling and fixing bottlenecks |
| `ci-cd-and-automation` | Setting up build/test/deploy pipelines |
| `deprecation-and-migration` | Removing or migrating off old code |
| `shipping-and-launch` | Preparing a production deploy |
| `context-engineering` | Configuring rules files and context for the project |
| `using-agent-skills` | Meta-skill: deciding which skill applies |

## Adding a skill

Create `.claude/skills/<name>/SKILL.md`:

```markdown
---
name: my-skill
description: One line on what it does and when to use it. This is what Claude matches against.
---

# My Skill

Instructions...
```

The `description` is the only part loaded up front, so make it say *when* to
reach for the skill, not just what it is.

## Scope

- `.claude/skills/` — this repo only, committed, shared with the team
- `~/.claude/skills/` — personal, available in every project, not committed

Skills here shadow personal skills with the same name.
