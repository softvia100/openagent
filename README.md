# OpenAgent

**A multi-model, multi-agent coding assistant for your terminal.**

OpenAgent is an open-source CLI in the same space as Claude Code, OpenCode, and OpenAI Codex — it lives in your terminal, reads and writes your codebase, runs commands, and helps you build software through natural language. What makes it different is how it's structured underneath: instead of one agent in a loop, OpenAgent has a **Manager** that reads your request, produces a plan, and assembles **Teams** of **Micro Agents** to execute it — each team can run on a different model provider, and any agent at any level can be given a **skill** (using the same open `SKILL.md` standard shared with Claude Code, Cursor, OpenAI Codex, and Google Antigravity).

> **Project status: pre-MVP.** This repository currently contains the full architecture and design documentation, plus initial scaffolding. No functional release exists yet. See [`ROADMAP.md`](./ROADMAP.md) for exactly what's built versus planned — treat everything below as the spec the code is being written against, not a description of a finished product.
>
> **About to start implementing?** Go straight to [`GETTING_STARTED.md`](./GETTING_STARTED.md) and [`TASKS.md`](./TASKS.md) — don't try to build from `ARCHITECTURE.md` directly, it's a spec, not a build order.

## Why this exists

Single-agent coding assistants are great at "fix this function" and mediocre at "build this app," because one model has to hold the entire task — planning, frontend, backend, tests, review — in one context, one persona, one set of instructions, from start to finish. OpenAgent's bet is that decomposing substantial work into Teams with their own Team Lead and scoped context produces more reliable, more reviewable results — the same way a real engineering org doesn't have one person do everything, and checks work at defined points rather than only at the very end.

## Why OpenAgent specifically

- **Multi-model by design, not as an afterthought.** Run everything on one model, or give your Backend Team, Frontend Team, and the Manager each a different provider/model — both are equally first-class configurations.
- **Plan before it builds.** Substantial requests get a real `plan.md` you review and approve before any team starts working, and you approve again after every team finishes its phase. Nothing happens you haven't seen.
- **A Manager that assembles the right teams for the job.** Planning and Verification always run; everything in between — Frontend, Backend, Database, Infra, or something the plan names that isn't a built-in at all — is decided per request, not hard-coded.
- **Skills you probably already have.** OpenAgent reads the same `SKILL.md` format used across the broader agent-tooling ecosystem. Drop in a skill folder from Claude Code or a community skill repo and it just works, scoped to whichever team or agent you want.
- **Talk to a specific team directly.** `@backend-team can you also add a DELETE route` routes straight to that team, without going back through the full planning cycle.

## How it works, briefly

```
your prompt
   → Manager (decides: trivial fix, or does this need real planning?)
      → Planning Team produces plan.md → you approve it
         → each team in the plan runs (Team Lead decomposes work,
           Micro Agents execute it, in parallel where possible)
            → you approve each team's result
               → Verifier Team checks everything against the plan
                  → Manager reports back to you
```

The full version of this, including a complete worked example tracing one real request through every layer of the system, is in [`ARCHITECTURE.md`](./ARCHITECTURE.md) Section 3 and Appendix A.

## Documentation

If you're new to the codebase, **start with [`GLOSSARY.md`](./GLOSSARY.md)** for fast definitions, then read **[`ARCHITECTURE.md`](./ARCHITECTURE.md)** end to end — it's the single source of truth for how every part of the system is designed and why, including the Manager, Teams, Micro Agents, the provider layer, the skill system, the TUI, configuration, security, and testing strategy.

| Document | Covers |
|---|---|
| [`GLOSSARY.md`](./GLOSSARY.md) | Every core term, defined briefly, with pointers into `ARCHITECTURE.md` for full detail. Read first. |
| [`GETTING_STARTED.md`](./GETTING_STARTED.md) | **Start here if you're about to write code.** Setup, run commands, and the one rule that matters most before touching anything else. |
| [`TASKS.md`](./TASKS.md) | The concrete, ordered Phase 1 build list — exact files, exact specs, exact "done when" checks. This is the actual entry point for implementation work, not `ARCHITECTURE.md` directly. |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | The complete technical specification — every subsystem, every interface, the full design rationale, plus a full worked example and FAQ. |
| [`SKILLS.md`](./SKILLS.md) | How to write, attach, and share skills, and how OpenAgent's skill support relates to the broader cross-tool ecosystem. |
| [`PROVIDERS.md`](./PROVIDERS.md) | Setup instructions for each supported model provider, and guidance on choosing models per role. |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | How to get set up, where things live, and what's expected of a pull request. |
| [`SECURITY.md`](./SECURITY.md) | The permissions/sandboxing model, threat model, and how to report a vulnerability. |
| [`ROADMAP.md`](./ROADMAP.md) | What's actually built today versus designed-but-not-yet-built. |

## Installation

```bash
npm install -g openagent
```

*(Not yet published — see [`ROADMAP.md`](./ROADMAP.md). This is the intended installation path once a release ships, matching the convention used by comparable tools in this space.)*

## Quick start (target usage, once available)

```bash
cd your-project
openagent init                  # scaffolds .openagent/config.json
openagent auth login anthropic   # or any other supported provider
openagent "build a REST API for a todo app with authentication"
```

You'll see the Manager classify the request, spawn a Planning Team, and present you with a `plan.md` to approve before anything else happens.

## A note on the multi-agent design

If you're wondering why a coding CLI needs a Manager/Team/Micro-Agent hierarchy instead of just one agent in a loop, that's answered directly in `ARCHITECTURE.md` Section 2 (the core design philosophy) and Section 4.1 (specifically, why the hierarchy is exactly three levels deep and not more or less). The short version: a single agent works fine for small, well-scoped tasks, but for genuinely multi-domain work, explicit decomposition with real checkpoints produces more reliable, more reviewable results than asking one long-running agent to hold the whole thing in its head at once.

## License

MIT — see [`LICENSE`](./LICENSE).

## Contributing

Contributions are very welcome, especially right now while the project is still establishing its foundation — see [`CONTRIBUTING.md`](./CONTRIBUTING.md) for how to get set up and [`ROADMAP.md`](./ROADMAP.md) for what's highest-leverage to work on first. Per the roadmap's own guidance: the core single-agent loop (Phase 1) is the thing to get right before anything else, since every later layer is built on top of it.
