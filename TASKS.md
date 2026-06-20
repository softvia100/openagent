# Tasks: Phase 1 — The Core Agent Loop

This is the ordered, concrete build list for Phase 1 (per `ROADMAP.md`). Each task names exactly what file(s) to create, what they must do, which `ARCHITECTURE.md` section defines the full spec, and a literal "done when" check. Work through these **in order** — later tasks depend on earlier ones, and the ordering is deliberate (see `GETTING_STARTED.md`'s "one rule that matters more than any other").

Do not start Phase 2, 3, or 4 tasks (TUI, skills, orchestration) until every task below is done and the Phase 1 overall definition of done (in `GETTING_STARTED.md`) passes for real against the live API. There is no `TASKS.md` for later phases yet — write one (following this same format) once Phase 1 is complete and merged.

---

## Task 1.1 — Provider interface (types only, no implementation)

**File:** `src/providers/provider.ts`

Define these exactly as specified in `ARCHITECTURE.md` Section 5.1: `ModelMessage`, `ContentBlock` (the union type), `ToolDefinition`, `CompletionRequest`, `CompletionResponse`, `StreamEvent`, `Provider` interface, `ModelInfo`. Copy the shapes directly from Section 5.1 — they're already fully specified there, this task is "implement what's already designed," not "design something new."

**Done when:** the file compiles cleanly under `npm run typecheck`. No provider implementation exists yet — this task produces only the contract.

---

## Task 1.2 — Provider registry

**File:** `src/providers/registry.ts`

Implement `ProviderRegistry` per `ARCHITECTURE.md` Section 5.3: `register(provider)`, `get(id)` (throws a clear error naming the missing provider if not found — not a generic error), `list()`.

**Done when:** a unit test can register two fake providers (simple objects satisfying the `Provider` interface with stub methods), retrieve one by id, confirm `list()` returns both, and confirm `get()` on an unregistered id throws an error whose message names the specific id that was requested.

---

## Task 1.3 — Anthropic provider implementation

**File:** `src/providers/anthropic.ts`

Implement `Provider` using `@anthropic-ai/sdk`. This is the first real piece of working software in the project — take real care here, since per `ARCHITECTURE.md` Section 5.2 this is the reference implementation everything else is checked against.

Specifics:
- `listModels()` can return a small hard-coded list of known Claude model IDs for now (e.g., the current Opus/Sonnet/Haiku identifiers) — there's no need to call a models-list endpoint if the SDK/API doesn't cleanly support that; a hard-coded list with a comment noting it should be revisited if Anthropic ships a models-list endpoint is fine.
- `complete()` — translate `CompletionRequest` into the Anthropic SDK's `messages.create()` call. Pay specific attention to translating `ContentBlock`'s `tool_use`/`tool_result` union members into the shape Anthropic's API expects, and translating the response back into `CompletionResponse`, including correctly setting `stopReason`.
- `stream()` — use the SDK's streaming support (`messages.stream()` or equivalent) and yield `StreamEvent`s as text/tool-use deltas arrive. This must be real token-by-token streaming, not a wrapper that awaits the full response and yields it as one event (`ARCHITECTURE.md` Section 5.2 is explicit about this).
- `validateConfig()` — check that an API key is present (env var or stored credential, see Task 1.9) and return `{ valid: false, message: "..." }` with a specific, actionable message if not. Avoid making a real billed API call just to validate config if avoidable — checking for key presence is sufficient for now.

**Done when:** a standalone script (doesn't need to be committed, can be a scratch file) calls `anthropicProvider.complete()` with a simple text-only prompt and a real API key, and prints back real text from Claude. Then, separately, confirm a tool-definition + tool-use round trip works: send a request with one simple tool definition (e.g., a fake `get_weather` tool), confirm the response correctly comes back as a `tool_use` content block with the right `name` and `input`, then send a follow-up request including a `tool_result` block and confirm the conversation continues coherently.

---

## Task 1.4 — Tool interface and ToolExecutor (no real tools yet)

**Files:** `src/core/tools/types.ts`, `src/core/tool-executor.ts`

Define `Tool`, `ToolExecutionContext`, `ToolResult`, `PermissionRequirement` exactly per `ARCHITECTURE.md` Section 7.1. Implement `ToolExecutor.execute()` per Section 23.1's pipeline: look up the tool, check `requiresPermission`, and for now — since there's no UI yet — implement the permission check as a simple synchronous terminal prompt (`readline`-based: print what's being asked, read y/n from stdin) rather than the eventual TUI-integrated prompt. This is a deliberate, temporary simplification; Task 1.4 should note in a code comment that this permission UI is a Phase 1 stand-in to be replaced when the real TUI (Phase 2) exists.

**Done when:** a unit test using a fake `Tool` (one with `requiresPermission` returning `"none"`, one returning `"ask"`, one returning `"deny"`) confirms: the `"none"` tool executes without any prompt, the `"deny"` tool never executes and returns an error result, and the `"ask"` tool — when stdin is mocked to answer "y" — executes, and when mocked to answer "n" — does not execute and returns a result indicating user denial.

---

## Task 1.5 — Core tools

**Files:** `src/core/tools/read-file.ts`, `write-file.ts`, `edit-file.ts`, `list-directory.ts`, `glob.ts`, `grep.ts`, `bash.ts`

Implement each per `ARCHITECTURE.md` Section 7.2's table and Section 23.4's sandboxing requirement (every filesystem tool must reject paths outside `ctx.workingDirectory`, including via `../` traversal, before doing anything else). Permission levels per the Section 7.2 table: `read_file`/`list_directory`/`glob`/`grep` → `"none"`; `write_file` → `"ask"` if the target file already exists, `"none"` if it doesn't; `edit_file` → always `"ask"`; `bash` → always `"ask"` (and per Section 23.3, `bash` specifically should never be given a `"none"` path under any input — don't add one even if it seems convenient for testing).

Keep each tool in its own file, one tool per file, matching the repo layout in `ARCHITECTURE.md` Section 22.

**Done when:** for each tool, a unit test confirms: normal operation works correctly, the permission level returned matches the table above for relevant inputs, and a path-traversal attempt (e.g., `read_file` with `path: "../../etc/passwd"`) is rejected before any actual filesystem access occurs — verify this with a test double or by confirming the function returns an error without needing the file to actually exist at that path.

---

## Task 1.6 — The Agent class (the most important file in the repo)

**File:** `src/core/agent.ts`

Implement exactly per `ARCHITECTURE.md` Section 6.1: `AgentConfig`, `AgentTurnResult`, `Agent` class with `run()` implementing the loop described there — send to provider, check for tool calls, execute via `ToolExecutor`, feed results back, repeat until `stopReason !== "tool_use"` or `maxTurns` is hit (throwing `AgentTurnLimitExceededError` per Section 24.1's table).

Also implement a minimal `AgentEventBus` (referenced in Section 6.1/6.2) — for Phase 1, this can just be a simple `EventEmitter`-based class with an `emit(event)` method; the TUI will subscribe to it in Phase 2, but for now a console-logging subscriber is enough to manually verify events are firing.

Skip `buildSystemPrompt()`'s skill-injection logic for now (`composeSystemPrompt` doesn't need to exist yet — just use `this.config.systemPrompt` directly) since skills are Phase 3. Leave a clear `// TODO(Phase 3): inject skills here, see ARCHITECTURE.md Section 8.4` comment at that point in the code so it's not forgotten and not silently designed differently later.

**Done when:** an integration test using `MockProvider` (Task 1.7) confirms: a scripted multi-turn tool-calling sequence executes correctly (the agent calls a tool, gets a result, calls another tool, gets a result, then produces final text), the loop correctly terminates on `stopReason: "end_turn"`, and a scripted infinite-tool-calling sequence correctly throws `AgentTurnLimitExceededError` once `maxTurns` is reached rather than looping forever.

---

## Task 1.7 — MockProvider for testing

**File:** `test/mocks/mock-provider.ts` (or wherever the test setup convention in the repo ends up living)

Implement a `Provider` that returns pre-scripted `CompletionResponse`s from a queue you set up in each test, rather than calling any real API. Per `ARCHITECTURE.md` Section 29.2, this should be capable of returning a sequence of different responses across multiple calls (so a test can script "first call returns a tool_use, second call returns end_turn with text").

**Done when:** Task 1.6's tests pass using this mock, with zero real API calls made during the test run (confirm by running tests with no `ANTHROPIC_API_KEY` set at all — they should still pass).

---

## Task 1.8 — Minimal config loading

**Files:** `src/config/schema.ts`, `src/config/defaults.ts`, `src/config/load.ts`

Implement only the subset of `ARCHITECTURE.md` Section 18.3 needed for Phase 1: `defaultModel: ModelAssignment` and nothing else yet (no `teams`, `approvals`, `verifier`, `skills`, `autonomy`, `ui` config — those belong to later phases and adding them now is scope creep that isn't tested by anything yet). Use `zod` for schema validation per Section 18.5. Load order: built-in default → `~/.openagent/config.json` if present → `<project>/.openagent/config.json` if present → environment variables — but for Phase 1 it's acceptable to implement just the project-config-or-default path and leave global config and env var layering as a follow-up task, noted explicitly in the PR description rather than silently skipped.

**Done when:** a unit test confirms loading with no config file present returns the built-in default model assignment, and loading with a project `.openagent/config.json` present that specifies a different model returns that overridden value.

---

## Task 1.9 — Credentials

**File:** `src/config/credentials.ts`

Per `ARCHITECTURE.md` Section 18.2: for Phase 1, implement just the environment-variable path (`ANTHROPIC_API_KEY` read directly) — skip OS keychain integration for now, that's a reasonable Phase 5/6 enhancement once there's more than one provider to manage credentials for. Leave a `// TODO` noting keychain storage is deferred, with a reference to Section 18.2.

**Done when:** `anthropicProvider.validateConfig()` (Task 1.3) correctly reports invalid with a clear message when `ANTHROPIC_API_KEY` is unset, and valid when it's set to a non-empty string (don't validate the key is actually correct by making a real call — presence is enough for this check, per Task 1.3's note about avoiding unnecessary billed calls).

---

## Task 1.10 — Minimal CLI entry point

**File:** `src/cli.tsx`

This is intentionally the simplest possible thing that exercises the full stack built so far — plain stdin/stdout, no Ink/TUI yet (that's Phase 2, despite the `.tsx` extension being ready for it). Read a prompt from `process.argv`, construct an `Agent` configured with the Anthropic provider, the core tools from Task 1.5, and the loaded config's default model, run it, print the final text to stdout. Print tool calls as they happen to stderr or stdout with a simple `[tool: read_file]` style prefix, just enough to see what's happening — real rendering is Phase 2's job.

**Done when:** `npm run dev -- "what files are in the current directory, and what does package.json say this project is called?"` produces a correct final answer, having visibly made real tool calls along the way, against the live Anthropic API. This is the same check as the Phase 1 overall definition of done in `GETTING_STARTED.md` — Task 1.10 being done **is** Phase 1 being done.

---

## After Task 1.10

Stop. Do not start building the Manager, Team, or Micro Agent abstractions yet, even though `ARCHITECTURE.md` Sections 9–11 are fully specified and might feel like the "next obvious thing." Per `ROADMAP.md`, Phase 2 (TUI) and Phase 3 (Skills) come next, in either order depending on contributor interest — open an issue or check the roadmap for current priority before continuing, and write a new `TASKS.md`-style breakdown for whichever phase is next, following this same format (file, spec reference, done-when check) so the same clarity carries forward.
