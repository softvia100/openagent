# Contributing to OpenAgent

Thanks for considering contributing. This document covers how to get set up, how the project is organized, and what's expected of a pull request. Read `ARCHITECTURE.md` first if you haven't — it's the actual spec for how this system is supposed to work, and most contribution questions are already answered there.

## Getting set up

```bash
git clone https://github.com/<org>/openagent.git
cd openagent
npm install
npm run dev -- "say hello"   # runs the CLI from source via tsx, no build step needed
```

You'll need at least one provider's API key configured to actually exercise the agent loop end to end (see `PROVIDERS.md`); plenty of unit/integration tests run against a `MockProvider` and don't need real credentials at all (`ARCHITECTURE.md` Section 29.2).

```bash
npm run typecheck     # tsc --noEmit
npm test               # full test suite
npm run build           # compiles to dist/
```

## Where things live

See `ARCHITECTURE.md` Section 22 for the full repository layout with explanations. The short version: `src/core` is the shared Agent loop and tools, `src/providers` is the model API adapters, `src/skills` is the skill loader/matcher, `src/orchestration` is the Manager/Team/Micro-Agent layer, `src/ui` is the Ink TUI, `src/config` is configuration loading/validation.

## Good first contributions

- A new tool (`ARCHITECTURE.md` Section 27) — self-contained, testable in isolation, doesn't require deep familiarity with the orchestration layer.
- A new provider (Section 26) — same property: self-contained, the interface is specifically designed so this doesn't require touching anything else.
- A skill for the examples directory, or an improvement to `SKILLS.md`'s authoring guidance.
- Bug reports with a minimal repro, even without a fix attached — genuinely useful, especially for orchestration-layer issues that are easy to describe but take real familiarity with the codebase to fix.
- Documentation fixes/clarifications, including to `ARCHITECTURE.md` itself if you find something that's unclear or has drifted from the actual code.

Check the issue tracker for a `good first issue` label before starting something larger, and feel free to comment on an issue to say you're picking it up so effort doesn't get duplicated.

## Before opening a pull request

- Run `npm run typecheck` and `npm test` locally — CI runs the same checks, but catching issues before pushing saves a review cycle.
- If you touched `src/core/agent.ts`, `src/core/tool-executor.ts`, anything under `src/orchestration/`, or `src/providers/provider.ts` (the interface itself), your PR needs accompanying tests — these are the files where a subtle bug doesn't just affect one feature, it affects every Agent, every Team, and every Provider built on top of them (`ARCHITECTURE.md` Section 29.3).
- If your change affects behavior described in `ARCHITECTURE.md`, update the relevant section in the same PR. A code change that makes the architecture doc inaccurate is, by this project's own stated principle, a bug in itself (see the closing note of `ARCHITECTURE.md`).
- Keep PRs scoped to one concern. A PR that adds a new provider and also refactors the tool executor is two PRs that happen to be in one diff — split it, it'll review faster and be easier to revert if something's wrong with just one half.

## Pull request description expectations

- What does this change, and why — link the issue it addresses if there is one.
- What did you test, and how (which test suite, or manual steps if it's a TUI/UX change that's hard to cover with automated tests).
- Anything you're explicitly unsure about or want a second opinion on — flagging this directly tends to get better, faster review than leaving a reviewer to guess where you have doubts.

## Code style

- TypeScript, strict mode, as configured in `tsconfig.json` — don't loosen strictness to make something compile; fix the actual type issue.
- Prefer the existing patterns in a file/module over introducing a new pattern for the same kind of problem, even if you have a personal preference for a different one. Consistency across the codebase matters more than any one file being individually "ideal."
- Comments should explain *why*, not *what* — the code already says what it does; a comment repeating that adds noise. Comments explaining a non-obvious design decision (especially one with a rationale documented in `ARCHITECTURE.md`) are valuable; consider linking the relevant section.

## Reporting bugs

Open an issue with: what you expected, what actually happened, and the smallest reproduction you can manage (ideally a specific prompt + config that reproduces it, or a minimal failing test). For anything involving unexpected tool execution, destructive file changes, or anything that bypassed an approval gate it shouldn't have, please also see `SECURITY.md` — issues with real security implications should go through that process rather than a public issue first.

## Reporting design disagreements

If you think part of `ARCHITECTURE.md` describes the wrong approach — not a bug in matching the doc, but the doc's actual design being wrong — open an issue making the case, ideally referencing the specific section and the principle in Section 2 it seems to be in tension with (or that justifies the change). Architectural changes of real substance should be discussed before a PR is written, not after, since rewriting a PR after disagreement on the underlying approach wastes everyone's time more than discussing it up front.

## Code of conduct

Be the kind of contributor you'd want reviewing your own PRs: direct about disagreements, generous in assuming good faith, and willing to be wrong in public when someone shows you a better approach. This project doesn't currently have a separately maintained `CODE_OF_CONDUCT.md`; if the community grows to a point where one is genuinely needed beyond this paragraph, that's a good problem to have and worth opening an issue about.
