# Roadmap

`ARCHITECTURE.md` describes OpenAgent's target design — the system as it's meant to work once complete. This document is the honest, current breakdown of what actually exists in code today versus what's designed but not yet built. Keep this updated as things ship; a roadmap that's stale is worse than no roadmap, because it actively misleads contributors about where to focus.

## Status legend

- ✅ Done — implemented and tested
- 🚧 In progress — actively being worked on
- 📋 Planned — designed (see relevant `ARCHITECTURE.md` section), not yet started
- 💭 Idea — directionally agreed, not yet fully designed

## Current state (overall)

OpenAgent is **pre-MVP**. The repository currently contains the documentation set (`ARCHITECTURE.md` and the supporting docs) and initial project scaffolding (`package.json`, `tsconfig.json`, folder structure). No functional code has shipped yet. This roadmap exists to make that completely unambiguous to anyone evaluating or considering contributing to the project, and to give a clear, ordered path from here to a working v1.0.

## Phase 0 — Scaffolding

| Item | Status |
|---|---|
| Repository structure, `package.json`, `tsconfig.json` | ✅ Done |
| Documentation set (`ARCHITECTURE.md` + supporting docs) | ✅ Done |
| CI pipeline (typecheck, test, build on PR) | 📋 Planned |
| License (MIT) | ✅ Done |

## Phase 1 — Core agent loop (the foundation everything else depends on)

Per `ARCHITECTURE.md` Section 2.1, nothing else should be built before this works and is well-tested.

**A concrete, ordered, file-by-file task breakdown for this entire phase exists in [`TASKS.md`](./TASKS.md) — start there, not from this table.** The table below is a status summary; `TASKS.md` is the actual build order with exact "done when" checks.

| Item | Status | Architecture reference |
|---|---|---|
| `Provider` interface definition | 📋 Planned | Section 5.1 |
| Anthropic provider implementation | 📋 Planned | Section 5.4 |
| `MockProvider` for testing | 📋 Planned | Section 29.2 |
| `Agent` class — the core loop | 📋 Planned | Section 6.1 |
| `ToolExecutor` + permission pipeline | 📋 Planned | Section 23.1 |
| Core tools: `read_file`, `write_file`, `edit_file`, `list_directory`, `glob`, `grep`, `bash` | 📋 Planned | Section 7.2 |
| Basic config loading (`defaultModel` only, no per-team config yet) | 📋 Planned | Section 18 (subset) |
| Minimal CLI: single-agent chat loop, no TUI yet, plain stdout | 📋 Planned | — |

**Milestone for end of Phase 1:** `openagent "fix this bug"` works as a single-agent CLI tool against Anthropic, with real tool-calling, real permission prompts, no orchestration layer yet. This is intentionally "Claude Code, but worse and unbranded" — and that's the right milestone, because it proves the foundation before any orchestration complexity gets added on top.

## Phase 2 — Terminal UI

| Item | Status | Architecture reference |
|---|---|---|
| Ink app shell, basic layout | 📋 Planned | Section 19.2 |
| Streaming text rendering | 📋 Planned | Section 19.4 |
| Permission prompt UI | 📋 Planned | Section 23.2 |
| Input box with basic history | 📋 Planned | Section 19.3 |

## Phase 3 — Skills

| Item | Status | Architecture reference |
|---|---|---|
| `SKILL.md` parser (frontmatter + body) | 📋 Planned | Section 8.1 |
| Project + global skill discovery | 📋 Planned | Section 8.2 |
| Progressive loading (`load_skill` tool) | 📋 Planned | Section 8.4 |
| Cross-tool path compatibility (`.claude/skills/`, etc.) | 💭 Idea | Section 8.2 |
| `openagent skill list` | 📋 Planned | Section 20.2 |
| `openagent skill audit` (static script scan) | 💭 Idea | Section 8.5 |

## Phase 4 — Orchestration: Manager, Teams, Micro Agents

This is the largest phase and the project's core differentiator.

| Item | Status | Architecture reference |
|---|---|---|
| Manager state machine | 📋 Planned | Section 9.4 |
| Trivial vs. substantial classification | 📋 Planned | Section 3.3 |
| Team / TeamInstance data model | 📋 Planned | Section 10.1 |
| Team Lead decomposition → subtask DAG | 📋 Planned | Section 10.4 |
| Micro Agent spawn/execute/report cycle | 📋 Planned | Section 11 |
| Concurrent Micro Agent execution | 📋 Planned | Section 10.4 |
| Approval gate data model + enforcement | 📋 Planned | Section 14 |
| Planning Team + `plan.md` generation | 📋 Planned | Section 12 |
| `plan.md` structural validator | 📋 Planned | Section 12.3 |
| Verifier Team + verification report | 📋 Planned | Section 13 |
| Verification → re-route-to-team loop | 📋 Planned | Section 13.3 |
| Dynamic team type synthesis | 📋 Planned | Section 15 |
| `@mention` routing | 📋 Planned | Section 16 |
| Session persistence + resume | 📋 Planned | Section 17 |

**Milestone for end of Phase 4:** the full lifecycle in `ARCHITECTURE.md` Section 3.1 and Appendix A works end to end against a real, non-trivial request.

## Phase 5 — Multi-provider

| Item | Status | Architecture reference |
|---|---|---|
| OpenAI provider | 📋 Planned | `PROVIDERS.md` |
| Google (Gemini) provider | 📋 Planned | `PROVIDERS.md` |
| OpenRouter provider | 💭 Idea | `PROVIDERS.md` |
| Ollama provider | 💭 Idea | `PROVIDERS.md` |
| Azure OpenAI provider | 💭 Idea | `PROVIDERS.md` |
| Per-team independent model configuration, end to end | 📋 Planned | Section 5.5, 10.5 |

## Phase 6 — Polish toward v1.0

| Item | Status | Architecture reference |
|---|---|---|
| Cost/token tracking UI | 📋 Planned | Section 25.2 |
| Configurable approval strictness (`onFailureOnly`, `never`) | 📋 Planned | Section 14.4 |
| Non-interactive/CI mode (`--non-interactive --approve-all`) | 📋 Planned | Section 20.3 |
| Full keyboard interaction set | 📋 Planned | Section 19.5 |
| `openagent init` scaffolding command | 📋 Planned | Section 20.2, 21 |
| End-to-end test suite against real APIs (scheduled CI) | 📋 Planned | Section 29.1 |
| First tagged release | 📋 Planned | — |

## What "v1.0, all providers working" means concretely

Referenced from `ARCHITECTURE.md`'s framing of itself as a target spec: v1.0 is the point at which every provider in the table in `PROVIDERS.md` is implemented and tested, the full orchestration lifecycle in Phase 4 works reliably on real, varied requests (not just the one worked example in the architecture doc), and the TUI is polished enough that a new user's first session feels coherent rather than like an early prototype. There's no fixed calendar date attached to this — it's a quality bar, not a deadline, and shipping something that doesn't meet it under time pressure would undermine the entire premise of the project.

## How to help move this forward

Pick anything marked 📋 Planned in Phase 1 first — per `ARCHITECTURE.md` Section 2.1, nothing later should be worked on until the core loop is solid, so contributions there are the highest-leverage right now regardless of what feels most exciting to build. Open an issue or comment on an existing one before starting substantial orchestration-layer work (Phase 4) specifically, since that's the area most likely to need design discussion before code, per `CONTRIBUTING.md`'s guidance on architectural disagreements.
