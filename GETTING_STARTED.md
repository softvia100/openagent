# Getting Started (Implementation)

This document is for whoever — human or AI coding agent — is about to start writing OpenAgent's actual code. It assumes you've read `README.md` for orientation but tells you exactly what to do next, rather than leaving you to figure out an entry point from `ARCHITECTURE.md`'s 1800 lines.

## Read in this order

1. `README.md` — 2 minutes, orientation.
2. `ARCHITECTURE.md` Section 1–2 — vision and design philosophy. Skim, don't study.
3. `ROADMAP.md` — confirms: nothing is built yet, Phase 1 is next.
4. `TASKS.md` — the actual ordered list of what to build first. **This is where you start working, not `ARCHITECTURE.md`.**
5. Come back to the relevant `ARCHITECTURE.md` section *as each task tells you to* — each task in `TASKS.md` links to the exact section with the full spec/types for that piece.

Do not try to implement the whole system from `ARCHITECTURE.md` in one pass. It is a complete spec, not a build order. `TASKS.md` is the build order.

## One rule that matters more than any other

**Build Phase 1 (the single-agent core loop) completely, and get it actually working against a real API call, before writing any orchestration code (Manager, Team, Micro Agent).** This is stated in `ARCHITECTURE.md` Section 2.1 and repeated in `ROADMAP.md` for a reason: every later layer (Manager, Team Lead, Micro Agent) is the same `Agent` class, just configured differently. If `Agent` is buggy, every layer built on top inherits that bug, multiplied by however many agents are running. There is no shortcut here — resist the urge to scaffold the Manager/Team structure early just because it's the "interesting" part. `TASKS.md` is ordered to enforce this; don't reorder it.

## Environment setup

```bash
git clone <repo-url>
cd openagent
npm install
```

You'll need an Anthropic API key to test anything beyond pure unit tests:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

Get one at console.anthropic.com if you don't have one. Phase 1 only requires this one provider — do not implement OpenAI/Google/other providers yet, regardless of what `PROVIDERS.md` describes as the target set. `TASKS.md` will tell you when that's the right phase.

## Running things during development

```bash
npm run dev -- "say hello"     # runs src/cli.tsx directly via tsx, no build step
npm run typecheck                # tsc --noEmit, run this constantly
npm test                          # once tests exist
```

There is no working `cli.tsx` yet at the start of Phase 1 — Task 1.6 in `TASKS.md` is what makes `npm run dev` produce any output at all. Until then, write small standalone test scripts under `/tmp` or a scratch file to manually verify each piece (e.g., a script that just calls the Anthropic provider directly and prints the response) — don't wait until everything is wired together to find out the Provider implementation is wrong.

## Definition of done for Phase 1 overall

You're done with Phase 1 when this works, for real, against the live Anthropic API:

```bash
openagent "what files are in the current directory, and what does package.json say this project is called?"
```

...and it correctly: calls `list_directory`, calls `read_file` on `package.json`, reasons over both results, and prints a correct final answer — having gone through a real permission-check pipeline for any tool that requires one, with the conversation loop correctly terminating once the model has no more tool calls to make. That one working example, end to end, is worth more than any amount of architecture review — it proves the loop, the tool execution, the provider translation, and the permission system are all actually wired together correctly.

Only once that works should Phase 2 (TUI) or Phase 4 (orchestration) begin, per `ROADMAP.md`'s ordering.

## When you're unsure what a section of ARCHITECTURE.md means

Each task in `TASKS.md` names the exact section(s) of `ARCHITECTURE.md` that define it, including the TypeScript interfaces to implement. If something there is genuinely ambiguous or seems to conflict with another section, that's worth flagging rather than guessing — note the ambiguity in your PR description or in a comment in the code, rather than silently picking an interpretation and moving on. Per `CONTRIBUTING.md`, a code/doc mismatch is treated as a bug in one of the two; don't let it become a silent third interpretation that exists only in the implementation.

## What "done" means for any individual task

Every task in `TASKS.md` has an explicit "Done when" line. Treat that literally — not "I wrote code that looks like it does this" but "I ran it and confirmed the specific behavior in the done-when line actually happens." For tasks involving real API calls, that means actually making the call, not just getting the code to compile.
