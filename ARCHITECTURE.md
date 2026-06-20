# OpenAgent — Architecture

> The complete technical specification for OpenAgent: a multi-model, multi-agent coding assistant CLI. This document is the single source of truth for how the system is designed, why it is designed that way, and how every subsystem fits together. A contributor who reads this file end to end should be able to start writing code in any part of the system without needing to ask "how does this work?" in an issue or Discord thread.

**Status of this document:** This is the architectural specification for OpenAgent's target design. Some of what is described here is implemented, some is in progress, and some is planned. See `ROADMAP.md` for an honest, current breakdown of what exists today versus what is designed-but-not-built. This file describes the *system as it is meant to work*, which is the contract all implementation work should converge toward.

---

## Table of Contents

1. [Vision and Goals](#1-vision-and-goals)
2. [Design Philosophy](#2-design-philosophy)
3. [High-Level Architecture](#3-high-level-architecture)
4. [Core Concepts and Vocabulary](#4-core-concepts-and-vocabulary)
5. [The Model Provider Layer](#5-the-model-provider-layer)
6. [The Agent Core (Single-Agent Loop)](#6-the-agent-core-single-agent-loop)
7. [Tools](#7-tools)
8. [The Skill System](#8-the-skill-system)
9. [The Manager](#9-the-manager)
10. [Teams](#10-teams)
11. [Micro Agents](#11-micro-agents)
12. [The Planning Team and plan.md](#12-the-planning-team-and-planmd)
13. [The Verifier Team](#13-the-verifier-team)
14. [Human-in-the-Loop: Approval Gates](#14-human-in-the-loop-approval-gates)
15. [Dynamic Team Creation](#15-dynamic-team-creation)
16. [Mentions: Talking Directly to a Team](#16-mentions-talking-directly-to-a-team)
17. [Session State and Persistence](#17-session-state-and-persistence)
18. [Configuration](#18-configuration)
19. [The Terminal UI (TUI)](#19-the-terminal-ui-tui)
20. [CLI Entry Points and Commands](#20-cli-entry-points-and-commands)
21. [File System Layout (Project-Side)](#21-file-system-layout-project-side)
22. [Repository Layout (Source Code)](#22-repository-layout-source-code)
23. [Security and Permissions Model](#23-security-and-permissions-model)
24. [Error Handling and Resilience](#24-error-handling-and-resilience)
25. [Observability, Logging, and Cost Tracking](#25-observability-logging-and-cost-tracking)
26. [Extensibility: Writing a New Provider](#26-extensibility-writing-a-new-provider)
27. [Extensibility: Writing a New Tool](#27-extensibility-writing-a-new-tool)
28. [Extensibility: Writing a New Skill](#28-extensibility-writing-a-new-skill)
29. [Testing Strategy](#29-testing-strategy)
30. [Glossary](#30-glossary)

---

## 1. Vision and Goals

OpenAgent is an open-source, terminal-based AI coding assistant. It occupies the same category as Claude Code, OpenCode, and OpenAI Codex CLI: a tool that lives in your terminal, reads and writes your codebase, runs commands, and helps you build software through natural language. What distinguishes OpenAgent from those tools is its internal structure:

- **Multi-model by design.** Every other major coding CLI is built around a single model provider, with other providers bolted on later. OpenAgent is built provider-agnostic from its first line of code: any agent in the system — the Manager, a Team Lead, a Micro Agent — can be configured to use a different model. You can run the entire system on Claude Opus, or run the Manager on Claude while your Backend Team runs on GPT and your Frontend Team runs on a local model. The choice is yours, per-agent, per-team, or globally.

- **Hierarchical multi-agent orchestration.** Most coding CLIs are a single agent with a tool loop. OpenAgent is that too, at its core — but it adds an orchestration layer on top: a **Manager** agent that reads your request, produces a plan, and assembles **Teams** of **Micro Agents** to execute that plan, each team scoped to a domain of work (frontend, backend, infrastructure, etc.), with **Planning** and **Verification** as permanent, default phases around whatever domain-specific teams the task requires.

- **Skill-compatible with the broader agent ecosystem.** OpenAgent adopts the open Agent Skills standard (the same `SKILL.md` format used by Claude Code, Cursor, OpenAI Codex, OpenCode, and Google Antigravity). Any skill written for any of those tools works in OpenAgent without modification, and any skill written for OpenAgent works in them. Skills are attachable to any agent in the hierarchy — the Manager, a specific Team Lead, or a specific Micro Agent — independent of which model that agent is using.

- **Transparent and controllable by default.** The system does not run autonomously and silently. After Planning, you get a `plan.md` you can read, edit, and approve before any code is written. After each Team finishes its phase, you approve before the next team starts. The system is built to be powerful *and* trustworthy — it should never feel like it ran away from you.

- **A pleasant, fast, professional terminal experience.** Functionally correct is not enough. The TUI should feel as considered as Claude Code's or OpenCode's: responsive, legible, low-friction, with sensible defaults and an interface that rewards both first-time users and power users who want to live in the keyboard.

### 1.1 What success looks like

OpenAgent succeeds if a developer can:

1. Install it with one `npm install -g openagent` command.
2. Run `openagent` in any project directory and get a working chat/agent interface in their terminal within seconds.
3. Plug in an API key for any supported provider and have it just work.
4. Type a real request ("build a REST API for a todo app with auth") and watch the system produce a sensible plan, ask for approval, then execute it competently across however many teams the task actually requires.
5. Drop in a skill folder they downloaded from a community skill repository (or one they wrote for Claude Code) and have OpenAgent pick it up with no changes.
6. Trust the system enough to use it on a real, non-toy codebase — because it asks before doing anything destructive, it's clear about what it's about to do, and it never silently fails.

### 1.2 Non-goals

To keep the project coherent, OpenAgent explicitly does **not** try to be:

- A general-purpose agent framework (like LangChain or AutoGen). OpenAgent is a coding assistant CLI with a specific orchestration model, not a toolkit for building arbitrary agent systems.
- An IDE or editor plugin (at least not in its initial scope). It is a terminal-first tool. Editor integrations are a plausible future extension, not a v1 goal.
- A hosted/cloud product. OpenAgent runs locally, using the user's own API keys. There is no OpenAgent backend service that conversations pass through.
- A replacement for human code review. The Verifier Team improves the odds the output is correct; it does not make human review of significant changes optional.

---

## 2. Design Philosophy

These are the principles that should guide every design and implementation decision in this codebase. When in doubt about how to build something, come back to this section.

### 2.1 The core loop is sacred

Underneath all the orchestration, teams, and managers, there is one fundamental unit: an agent that holds a conversation, can call tools, and loops until its task is done. Every "Manager," "Team Lead," and "Micro Agent" in this system is, mechanically, an instance of that same core loop, configured differently (different system prompt, different tools, different model, different skills). This is deliberate. If the core loop is correct, robust, and well-tested, the orchestration layer is "just" composition on top of something solid. If the core loop is shaky, no amount of orchestration cleverness fixes that — it just multiplies the bugs across every team and micro agent in a run. Get the single-agent case right first, always.

### 2.2 Composition over special-casing

The Manager is not a fundamentally different kind of object from a Team Lead, which is not fundamentally different from a Micro Agent. They are all `Agent` instances, composed into a hierarchy by an `Orchestrator`. Resist the urge to give the Manager special hard-coded behavior that couldn't, in principle, also apply to a Team Lead. This keeps the codebase small relative to what it accomplishes, and makes the system easier to extend — a new layer of hierarchy (e.g., sub-teams) should be addable without rewriting existing layers.

### 2.3 Providers are an implementation detail behind one interface

No part of the orchestration layer, the tool system, or the skill system should ever import a provider-specific SDK directly or branch on "if provider is Anthropic do X, if OpenAI do Y." All of that complexity is absorbed by the Provider Layer (Section 5) so that the rest of the system only ever talks to the small, stable `Provider` interface. Adding a new provider should mean writing one new file, not touching ten existing ones.

### 2.4 Default to safety, let power users opt out

Destructive or irreversible actions (overwriting files, running arbitrary shell commands, deleting things, git operations that rewrite history) are gated by permission prompts by default. Users who want a faster, more autonomous experience can configure that explicitly (see Section 23), but the out-of-the-box experience should never surprise a new user by doing something they didn't expect.

### 2.5 Skills are knowledge, not architecture

A skill should never be required for the system to function. Skills are a mechanism for *injecting domain expertise* into an agent that already works without it. The core agent loop, the tool system, and the orchestration layer must all work correctly with zero skills installed. Skills make agents better at specific things; they are not a substitute for the system having sound defaults.

### 2.6 Plans are real artifacts, not theater

`plan.md` is not a UX flourish to make the system look thoughtful. It is the actual contract for what is about to happen. The Manager must derive its team-spawning decisions from the plan, Team Leads must derive their subtask breakdowns from the plan's relevant section, and the Verifier Team must check the final result against the plan. If the plan and the execution diverge silently, that is a bug.

### 2.7 Fail loud, fail early, never fail silently

An agent that can't complete a tool call, hits a rate limit, or gets a malformed response from a provider should surface that clearly — to the orchestrator, and ultimately to the user — rather than quietly giving up, retrying forever, or producing a plausible-looking but wrong result. Section 24 covers this in detail.

### 2.8 The TUI is a first-class citizen, not an afterthought

A correct backend with a clunky terminal interface will not get adopted, no matter how good the orchestration model is underneath. Responsiveness, clear visual hierarchy between Manager/Team/Micro-Agent output, and sensible keyboard-driven interaction are treated as core requirements, not polish to add "later."

---

## 3. High-Level Architecture

### 3.1 The full lifecycle of a request

This is the canonical flow for a non-trivial request (e.g., "build a REST API for a todo app with authentication"). Simpler requests (e.g., "fix this typo in README.md") may skip most of this and be handled by the Manager directly using its own tools, without spawning any teams at all — see Section 3.3.

```
┌─────────────────────────────────────────────────────────────────────┐
│ 1. USER submits a prompt via the TUI                                  │
└───────────────────────────────┬───────────────────────────────────────┘
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 2. MANAGER receives the prompt                                        │
│    - Loads project context (config, existing plan.md if resuming,     │
│      relevant skills for itself)                                      │
│    - Decides: is this trivial (handle directly) or substantial        │
│      (route to Planning Team)?                                        │
└───────────────────────────────┬───────────────────────────────────────┘
                                  ▼  (substantial path)
┌─────────────────────────────────────────────────────────────────────┐
│ 3. PLANNING TEAM activates (always the first team, always default)    │
│    - Team Lead analyzes the request and the existing codebase         │
│    - Produces plan.md: a structured breakdown of what teams are       │
│      needed, in what order, and what each will do                     │
└───────────────────────────────┬───────────────────────────────────────┘
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 4. APPROVAL GATE — plan.md is presented to the user in the TUI        │
│    User may: approve / request changes / reject                       │
│    (See Section 14. This gate is mandatory and cannot be skipped      │
│    for the planning phase, even with autonomy settings raised.)       │
└───────────────────────────────┬───────────────────────────────────────┘
                                  ▼ (approved)
┌─────────────────────────────────────────────────────────────────────┐
│ 5. MANAGER reads plan.md, determines the next TEAM to spawn           │
│    (e.g., Backend Team, Frontend Team, Infra Team — built-in or       │
│    dynamically defined, see Section 15)                               │
└───────────────────────────────┬───────────────────────────────────────┘
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 6. TEAM activates                                                      │
│    - Team Lead receives its slice of plan.md as scoped context        │
│    - Team Lead decomposes its task into concrete subtasks             │
│    - Team Lead spawns MICRO AGENTS, one (or more) per subtask          │
│    - Micro Agents execute using their tools (and skills, if any)      │
│    - Micro Agents report results back to the Team Lead                │
│    - Team Lead integrates results, resolves conflicts, reports a      │
│      single summary back to the Manager                               │
└───────────────────────────────┬───────────────────────────────────────┘
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 7. APPROVAL GATE — team's result is presented to the user             │
│    User may: approve / request changes / reject                       │
└───────────────────────────────┬───────────────────────────────────────┘
                                  ▼ (approved — repeat 5–7 for each
                                     remaining team in the plan)
┌─────────────────────────────────────────────────────────────────────┐
│ 8. VERIFIER TEAM activates (always the last team, always default)     │
│    - Checks the cumulative result against plan.md                     │
│    - Runs tests/builds/lints if applicable                            │
│    - Reports pass/fail with specifics; failures can route back to     │
│      the relevant team for another pass                               │
└───────────────────────────────┬───────────────────────────────────────┘
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 9. MANAGER reports final completion summary to the user                │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 The component diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                                  TUI                                   │
│   (Ink/React) — renders conversation, plan, approval prompts,          │
│   per-team/per-agent activity panes, diffs, cost/usage indicators      │
└───────────────────────────────┬──────────────────────────────────────┘
                                  │ events / commands
                                  ▼
┌──────────────────────────────────────────────────────────────────────┐
│                              ORCHESTRATOR                              │
│  Owns session state. Routes user input. Hosts the Manager. Enforces    │
│  approval gates. Emits events the TUI subscribes to.                   │
└───────┬───────────────────────────────────────────────────┬──────────┘
        │                                                     │
        ▼                                                     ▼
┌───────────────────┐                              ┌─────────────────────┐
│      MANAGER       │  spawns & coordinates →      │        TEAMS         │
│  (an Agent)         │ ─────────────────────────►  │  (Planning, Verifier, │
│  - reads plan.md    │                              │   Frontend, Backend,  │
│  - decides next team│ ◄───────────────────────────│   dynamic teams...)   │
│  - gates approvals  │     reports results          │  each = Team Lead +   │
└─────────┬───────────┘                              │  N Micro Agents       │
          │                                           └──────────┬───────────┘
          │ uses                                                  │ spawns
          ▼                                                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          AGENT CORE (shared)                          │
│  The single-agent loop used by every Manager, Team Lead, and          │
│  Micro Agent. Holds conversation state, calls a Provider, executes    │
│  Tool calls, loops until done.                                        │
└──────┬───────────────────┬───────────────────┬────────────────────────┘
       │                    │                    │
       ▼                    ▼                    ▼
┌─────────────┐    ┌─────────────────┐   ┌──────────────────┐
│  PROVIDER     │    │      TOOLS       │   │     SKILLS        │
│  LAYER        │    │  read/write/edit │   │  SKILL.md loader,  │
│  Anthropic,   │    │  bash/glob/grep  │   │  per-agent skill   │
│  OpenAI, etc. │    │  /web/etc.        │   │  attachment        │
└─────────────┘    └─────────────────┘   └──────────────────┘
```

### 3.3 Trivial vs. substantial requests

Not every request needs the full Planning → Team(s) → Verifier pipeline. The Manager makes a lightweight classification when it receives a prompt:

- **Trivial / direct requests** — small, well-scoped, low-risk asks ("rename this variable," "what does this function do," "add a comment here"). The Manager handles these itself using its own tool access, without spawning a Planning Team or any other team. This keeps the system fast and unannoying for small asks — nobody wants a full plan.md and approval gate to fix a typo.
- **Substantial requests** — anything that plausibly touches multiple files, multiple concerns (frontend + backend, for example), or carries meaningful risk of being wrong in a way that matters. These go through the full pipeline described in 3.1.

The classification itself is a judgment call made by the Manager's underlying model, guided by its system prompt (see `src/orchestration/manager.ts` and the prompt template in `src/orchestration/prompts/manager.md`). The threshold is intentionally a tunable, not a hard-coded rule — see Section 18 for the `autonomy` and `planningThreshold` configuration options that let users adjust how eager the Manager is to invoke the full pipeline.

---

## 4. Core Concepts and Vocabulary

Precise terminology matters in a system with this many moving parts. Every term below is used consistently throughout this document and throughout the codebase — variable names, type names, and file names should match this vocabulary.

**Agent** — The fundamental unit of the system. An agent holds a conversation with a model provider, has a system prompt, has zero or more tools available to it, has zero or more skills attached, and runs a loop: send conversation to provider → receive response → if response contains tool calls, execute them and feed results back → repeat until the provider responds with no further tool calls (i.e., it considers the task complete) or a turn/token/time budget is exhausted. The Manager, every Team Lead, and every Micro Agent are all, mechanically, Agents. What differs between them is configuration: system prompt, tool access, model, and skills.

**Provider** — An adapter to a specific model API (Anthropic, OpenAI, a local model server, etc.) that implements the shared `Provider` interface (Section 5). Providers translate the system's internal message/tool format into whatever shape that vendor's API expects, and translate responses back.

**Model** — A specific model identifier, scoped to a Provider (e.g., `claude-opus-4-8` under the Anthropic provider). Each Agent is configured with exactly one Model at a time, but different Agents in the same run can use different Models, even from different Providers.

**Tool** — A capability an Agent can invoke: reading a file, writing a file, running a shell command, searching the filesystem, fetching a URL, etc. Tools are provider-agnostic; they are defined once and exposed to whichever provider format an Agent's configured Provider requires.

**Skill** — A packaged unit of domain knowledge and/or executable scripts, defined by a `SKILL.md` file (optionally with `scripts/`, `examples/`, `resources/` subdirectories), following the open Agent Skills standard shared with Claude Code, Cursor, OpenAI Codex, OpenCode, and Google Antigravity. Skills are discovered, matched to relevant tasks by their description, and loaded into an Agent's context on demand. See Section 8 and `SKILLS.md`.

**Orchestrator** — The top-level controller that owns the overall session: holds the Manager instance, owns session state (Section 17), enforces approval gates (Section 14), and is the bridge between the TUI and the Manager/Team/Micro-Agent hierarchy. There is exactly one Orchestrator per running session.

**Manager** — A specific, singleton Agent role (exactly one per session) responsible for: interpreting the user's request, deciding whether to invoke the full team pipeline or handle the request directly, owning and updating `plan.md`, deciding which Team to spawn next, enforcing approval gates between phases, and reporting final results to the user. The Manager is *not* a different class from Agent — it is an Agent configured with the Manager system prompt and orchestration-specific tools (e.g., "spawn team," "mark plan step complete").

**Team** — A task-scoped grouping consisting of exactly one Team Lead and zero or more Micro Agents, instantiated by the Manager to accomplish one phase of the plan (e.g., "Backend Team," "Planning Team," "Verifier Team"). A Team exists only for the duration of its phase; once it reports its result to the Manager and that result is approved, the Team's instance is torn down (though its output and a summary of its work persist in session state).

**Team Lead** — The Agent at the head of a Team. Receives the Team's slice of the overall task (derived from `plan.md`), is responsible for decomposing that slice into concrete subtasks, deciding whether those subtasks need their own Micro Agents or can be handled by the Team Lead directly, dispatching to Micro Agents, integrating and reconciling their outputs, and reporting one coherent result back to the Manager.

**Micro Agent** — The Agent that does the actual leaf-level work inside a Team: implementing a specific function, writing a specific file, fixing a specific test, etc. A Micro Agent is spawned by a Team Lead for one subtask, executes using whatever tools and skills it's been given, reports its result back to the Team Lead, and is then torn down. Micro Agents do not spawn further agents — the hierarchy is exactly three levels deep (Manager → Team Lead → Micro Agent) by design; see Section 4.1 for why.

**plan.md** — The structured planning artifact produced by the Planning Team, owned by the Manager, and treated as the single source of truth for "what is going to happen and in what order" for the duration of a session. See Section 12 for its required structure.

**Planning Team** — A default, always-first Team (cannot be skipped, disabled, or reordered) responsible for analyzing the request and producing `plan.md`.

**Verifier Team** — A default, always-last Team (cannot be skipped, disabled, or reordered, though its strictness is configurable) responsible for checking the cumulative result of all prior teams against `plan.md`, running any applicable tests/builds/lints, and reporting pass/fail.

**Approval Gate** — A mandatory pause point where the Orchestrator stops and waits for explicit user input (approve / request changes / reject) before proceeding. Gates occur after the Planning Team produces `plan.md`, and after every subsequent Team completes its phase. See Section 14.

**Mention** (`@team-name`) — A way for the user to address a specific, already-active or previously-active Team directly in the chat, bypassing the Manager's routing for that one message. See Section 16.

**Session** — One continuous run of OpenAgent against a project, from the first prompt to the point the user exits or the task pipeline completes. A session has exactly one Manager, a sequence of Teams that have run or are running, the current state of `plan.md`, and a transcript. Sessions can be persisted and resumed (Section 17).

### 4.1 Why exactly three levels of hierarchy

It is tempting to make the hierarchy arbitrarily deep (Teams containing Sub-Teams containing Micro Agents containing Nano Agents...). OpenAgent deliberately caps it at three levels — Manager, Team Lead, Micro Agent — for concrete reasons:

- **Context cost compounds with depth.** Every additional layer means another round of "summarize my work for the level above me," which is lossy and expensive. Three levels is enough to get real parallelism and domain separation without paying for five rounds of summarization.
- **Debuggability.** A human trying to understand why something went wrong should be able to trace: Manager said do X → Team Lead said do X.1, X.2, X.3 → Micro Agent did X.1. A deeper hierarchy makes that trace exponentially harder to hold in your head.
- **It maps cleanly to how software teams actually work.** A manager assigns a workstream to a lead; the lead breaks it into tickets; an engineer does a ticket. This is a familiar, legible mental model for the people using the tool, which matters for trust and adoption (see Section 1's "Silicon Valley company" framing — the org chart should feel intuitive to anyone who has worked at a software company).

If a future use case genuinely requires deeper nesting, that should be a deliberate, justified architecture change with its own design doc — not a casual recursive generalization.

---

## 5. The Model Provider Layer

The Provider Layer is the single most important abstraction in OpenAgent, because it's what makes "multi-model" true rather than aspirational. Every Agent talks to its Provider through one stable interface; nothing else in the system is allowed to know that Anthropic's API shape differs from OpenAI's, or that a local model server has different streaming semantics.

### 5.1 The `Provider` interface

```typescript
// src/providers/provider.ts

export interface ModelMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: ContentBlock[];
}

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; toolUseId: string; content: string; isError?: boolean }
  | { type: "image"; mimeType: string; data: string }; // base64

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>; // JSON Schema
}

export interface CompletionRequest {
  model: string;
  systemPrompt: string;
  messages: ModelMessage[];
  tools: ToolDefinition[];
  maxTokens: number;
  temperature?: number;
  stopSequences?: string[];
}

export interface CompletionResponse {
  content: ContentBlock[];
  stopReason: "end_turn" | "tool_use" | "max_tokens" | "stop_sequence" | "error";
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  raw?: unknown; // original provider response, for debugging only — never depended on elsewhere
}

export interface StreamEvent {
  type: "text_delta" | "tool_use_start" | "tool_use_delta" | "tool_use_end" | "message_stop";
  data: unknown;
}

export interface Provider {
  /** Stable identifier, e.g. "anthropic", "openai", "ollama" */
  readonly id: string;

  /** Human-readable name shown in the TUI/config, e.g. "Anthropic" */
  readonly displayName: string;

  /** List of model identifiers this provider can serve, for config validation and UI pickers */
  listModels(): Promise<ModelInfo[]>;

  /** Non-streaming completion call */
  complete(request: CompletionRequest): Promise<CompletionResponse>;

  /** Streaming completion call — required for responsive TUI output */
  stream(request: CompletionRequest): AsyncIterable<StreamEvent>;

  /** Validate that credentials/config are present and usable, without making a billed call if avoidable */
  validateConfig(): Promise<{ valid: boolean; message?: string }>;
}

export interface ModelInfo {
  id: string;
  displayName: string;
  contextWindow: number;
  maxOutputTokens: number;
  supportsImages: boolean;
  supportsTools: boolean; // should always be true for any model usable in OpenAgent
  costPerMillionInputTokens?: number;
  costPerMillionOutputTokens?: number;
}
```

### 5.2 Why this shape

- **`ContentBlock` is a union, not a flat string.** Tool calls, tool results, text, and images all need to interleave within a single message in modern provider APIs. Modeling this as a union from day one avoids a painful refactor later when image input or multi-block messages are added.
- **`stream` is not optional.** A coding CLI that doesn't stream feels broken — users need to see the agent "thinking" in real time, especially during long tool-calling sequences. Every provider implementation must implement real streaming, not a fake wrapper that buffers the whole response and emits it as one chunk.
- **`raw` exists only for debugging.** Nothing in the orchestration, tool, or skill layers may read `response.raw`. It exists so that when something goes wrong, a developer can inspect exactly what the underlying API returned, without that escape hatch becoming a dependency anywhere in real logic.
- **`validateConfig` exists for fast failure.** When a user runs `openagent` for the first time with a missing or invalid API key, they should get a clear, immediate error — not a cryptic failure three tool calls into a Team's work.

### 5.3 The Provider Registry

```typescript
// src/providers/registry.ts

export class ProviderRegistry {
  private providers = new Map<string, Provider>();

  register(provider: Provider): void;
  get(id: string): Provider; // throws a clear, actionable error if not found/registered
  list(): Provider[];
}
```

The registry is populated at startup based on the user's configuration (Section 18) — only providers the user has configured credentials for are registered, so the system never attempts to call a provider with no credentials. Each built-in provider module self-registers via a known entry point (`src/providers/index.ts`), and third-party/community providers can register themselves the same way once the plugin mechanism (Section 26) lands.

### 5.4 Built-in providers (target set)

| Provider ID | Notes |
|---|---|
| `anthropic` | First provider implemented; reference implementation for all others. Supports Claude Opus, Sonnet, Haiku model families. |
| `openai` | GPT model family, including reasoning models. Tool-calling shape differs from Anthropic's — this is the proving ground for the abstraction. |
| `google` | Gemini model family. |
| `openrouter` | Meta-provider giving access to many hosted models through one API; useful default for users who want choice without juggling many keys. |
| `ollama` | Local model serving. Validates that the abstraction holds even when there's no hosted billing/usage metadata. |
| `azure-openai` | Enterprise users frequently need this distinct from vanilla OpenAI due to deployment-based routing. |

Only `anthropic` is implemented in the current codebase; see `ROADMAP.md`. The table above is the target set for a "all providers working" v1.0 release, not a claim about current state.

### 5.5 Per-agent model assignment

Every Agent (Manager, every Team Lead, every Micro Agent) is configured with a `ModelAssignment`:

```typescript
export interface ModelAssignment {
  providerId: string;
  modelId: string;
}
```

Configuration resolution order (highest precedence first):

1. Explicit per-agent override in `.openagent/config.json` (e.g., `teams.backend.model`).
2. Explicit per-role default in config (e.g., `defaults.teamLead.model`, `defaults.microAgent.model`).
3. The global `defaultModel` setting.
4. A hard-coded fallback (the Anthropic reference model), only used if the user has configured no model anywhere — this should be rare and is mainly a safety net for a broken config.

This is what makes "use Claude Opus 4.8 for everything" and "use an independent model per team" both first-class, equally-supported configurations rather than one being the "normal" path and the other being a hack. See Section 18.4 for the full config schema.

---

## 6. The Agent Core (Single-Agent Loop)

This is the most important code in the entire repository. Per the philosophy in Section 2.1, every higher-level concept (Manager, Team Lead, Micro Agent) is this loop, configured differently. If you are a new contributor and want to understand OpenAgent quickly, read `src/core/agent.ts` before anything else.

### 6.1 The `Agent` class

```typescript
// src/core/agent.ts

export interface AgentConfig {
  id: string;
  role: "manager" | "team-lead" | "micro-agent";
  systemPrompt: string;
  model: ModelAssignment;
  tools: Tool[];
  skills: Skill[];
  maxTurns?: number;        // default 50 — a safety bound, not a target
  maxTokensPerTurn?: number; // passed through to CompletionRequest.maxTokens
}

export interface AgentTurnResult {
  finalText: string;
  toolCallsExecuted: ToolCallRecord[];
  usage: { inputTokens: number; outputTokens: number };
  stopReason: CompletionResponse["stopReason"];
}

export class Agent {
  constructor(
    private config: AgentConfig,
    private provider: Provider,
    private toolExecutor: ToolExecutor,
    private eventBus: AgentEventBus,
  ) {}

  /**
   * Runs the full agentic loop for one user/task input until the model
   * stops requesting tools, or a turn/budget limit is hit.
   */
  async run(input: string, conversationHistory: ModelMessage[]): Promise<AgentTurnResult> {
    const messages: ModelMessage[] = [
      ...conversationHistory,
      { role: "user", content: [{ type: "text", text: input }] },
    ];

    const toolCallsExecuted: ToolCallRecord[] = [];
    let turns = 0;
    let totalUsage = { inputTokens: 0, outputTokens: 0 };

    while (turns < (this.config.maxTurns ?? 50)) {
      turns++;

      const response = await this.provider.complete({
        model: this.config.model.modelId,
        systemPrompt: this.buildSystemPrompt(),
        messages,
        tools: this.config.tools.map(t => t.definition),
        maxTokens: this.config.maxTokensPerTurn ?? 4096,
      });

      totalUsage.inputTokens += response.usage.inputTokens;
      totalUsage.outputTokens += response.usage.outputTokens;

      this.eventBus.emit({ type: "agent_response", agentId: this.config.id, response });

      messages.push({ role: "assistant", content: response.content });

      const toolUses = response.content.filter(
        (b): b is Extract<ContentBlock, { type: "tool_use" }> => b.type === "tool_use"
      );

      if (toolUses.length === 0 || response.stopReason !== "tool_use") {
        const finalText = response.content
          .filter((b): b is { type: "text"; text: string } => b.type === "text")
          .map(b => b.text)
          .join("\n");
        return { finalText, toolCallsExecuted, usage: totalUsage, stopReason: response.stopReason };
      }

      // Execute each requested tool call, in the order requested.
      const toolResults: ContentBlock[] = [];
      for (const call of toolUses) {
        const record = await this.toolExecutor.execute(call, this.config);
        toolCallsExecuted.push(record);
        toolResults.push({
          type: "tool_result",
          toolUseId: call.id,
          content: record.resultText,
          isError: record.isError,
        });
      }

      messages.push({ role: "tool", content: toolResults });
    }

    throw new AgentTurnLimitExceededError(this.config.id, turns);
  }

  private buildSystemPrompt(): string {
    // Concatenates: base system prompt + any attached skills' content
    // that have been deemed relevant (see Section 8.4 for the matching
    // algorithm). Skills are injected here, not hard-coded into the
    // base prompt, so the same Agent class works whether 0 or N skills
    // are attached.
    return composeSystemPrompt(this.config.systemPrompt, this.config.skills);
  }
}
```

### 6.2 Why the loop is structured this way

- **The loop lives inside `Agent`, not inside the orchestration layer.** A Team Lead calling `Agent.run()` and a standalone single-agent CLI session calling `Agent.run()` go through identical code. This is the literal embodiment of Section 2.1 — there is no orchestration-specific tool-calling logic anywhere.
- **Tool execution is delegated to a `ToolExecutor`, not inlined.** This keeps permission checks, logging, and sandboxing (Section 23) in one place, callable from any Agent regardless of its role.
- **The loop is turn-bounded, not just token-bounded.** A model that gets stuck in a tool-call loop (e.g., repeatedly reading the same file) should hit `maxTurns` and surface a clear error rather than silently burning the user's API budget. This is a deliberate safety valve per Section 2.7.
- **`AgentEventBus`** is how the TUI gets live updates. The `Agent` class never talks to the TUI directly — it emits events, and the TUI (or any other consumer, like a logger) subscribes. This keeps `Agent` usable in non-interactive contexts (tests, a future headless/CI mode) without modification.

### 6.3 Conversation history scoping

Each Agent instance owns its own conversation history; histories are **not** shared by reference between, say, a Team Lead and its Micro Agents. What gets passed *down* the hierarchy is a deliberately constructed subset of context (the relevant slice of `plan.md`, the specific subtask description, any directly relevant prior output) — never the full conversation transcript of the level above. What gets passed *up* is the `AgentTurnResult.finalText` summary, not the full message history of the level below.

This is a deliberate design choice to keep context windows from exploding as the hierarchy gets deep, and it mirrors how human teams actually communicate — a manager doesn't read an engineer's entire Slack history, they read a status update.

### 6.4 Turn limits and budgets in practice

| Role | Default `maxTurns` | Rationale |
|---|---|---|
| Manager | 100 | Spans the whole session; needs headroom to coordinate many teams over a long-running task. |
| Team Lead | 50 | Bounded to one phase of work. |
| Micro Agent | 25 | Bounded to one subtask; if a Micro Agent needs more than 25 turns to, say, write one function and its test, the subtask was probably scoped too broadly by the Team Lead — that's a signal to the Team Lead's decomposition logic, not a reason to raise the limit blindly. |

These are defaults, configurable per-role and per-agent in `.openagent/config.json` (Section 18).

---

## 7. Tools

### 7.1 The `Tool` interface

```typescript
// src/core/tools/types.ts

export interface Tool {
  definition: ToolDefinition; // name, description, JSON Schema — sent to the Provider
  /**
   * Executes the tool given validated input. Implementations should
   * be pure with respect to the rest of the system except for their
   * documented side effect (file write, shell exec, etc.) — no tool
   * should reach into orchestration state directly.
   */
  execute(input: Record<string, unknown>, ctx: ToolExecutionContext): Promise<ToolResult>;
  /** Whether this tool's execution requires a permission check before running. See Section 23. */
  requiresPermission: (input: Record<string, unknown>) => PermissionRequirement;
}

export interface ToolExecutionContext {
  agentId: string;
  agentRole: AgentConfig["role"];
  workingDirectory: string;
  sessionId: string;
}

export interface ToolResult {
  resultText: string;
  isError: boolean;
  metadata?: Record<string, unknown>; // e.g., diff for an edit, for TUI rendering
}

export type PermissionRequirement =
  | { level: "none" }
  | { level: "ask"; reason: string }
  | { level: "deny"; reason: string };
```

### 7.2 Built-in tool set (v1.0 target)

| Tool name | Purpose | Default permission level |
|---|---|---|
| `read_file` | Read a file's contents, optionally a line range | none |
| `write_file` | Create a new file or fully overwrite an existing one | ask (if file exists), none (if new) |
| `edit_file` | Targeted find-and-replace style edit within an existing file | ask |
| `list_directory` | List files/folders, respecting `.gitignore` | none |
| `glob` | Find files matching a pattern | none |
| `grep` | Search file contents by pattern/regex | none |
| `bash` | Execute a shell command in the project's working directory | ask, always (no auto-approve tier — see Section 23.3) |
| `web_fetch` | Fetch the contents of a URL | none |
| `web_search` | Run a web search query | none |
| `git_status` / `git_diff` | Inspect repository state | none |
| `git_commit` | Create a commit | ask |

Every tool is provider-agnostic by construction — its `definition.inputSchema` is plain JSON Schema, and the Provider Layer (Section 5) is responsible for translating that into whatever shape the underlying model API wants (Anthropic's tool-use format, OpenAI's function-calling format, etc.). No tool implementation should ever import a provider SDK.

### 7.3 Tool scoping per agent role

Not every Agent gets every tool. The default scoping:

- **Manager**: read-only filesystem tools (`read_file`, `list_directory`, `glob`, `grep`, `git_status`, `git_diff`), plus orchestration-specific pseudo-tools (`spawn_team`, `update_plan`, `request_approval`) that exist only for the Manager role and are not part of the general tool catalog above.
- **Team Lead**: same read tools as Manager, plus team-internal coordination pseudo-tools (`spawn_micro_agent`, `integrate_result`), generally *not* given direct write/bash access — the philosophy is that the Team Lead plans and delegates, Micro Agents execute (per your stated design: "Team lead plans + delegates, micro agents execute individual subtasks"). A Team Lead can be configured to also have direct write access for small teams where spawning a Micro Agent for every tiny change would be wasteful — this is a config option, not a hard rule, because in practice some tasks are too small to be worth full delegation.
- **Micro Agent**: the full read/write/bash/web tool set relevant to its subtask. This is where actual code gets written.

This scoping is configurable (Section 18) but these are the sane, secure-by-default starting values.

### 7.4 Tool result truncation

Tool results (especially `read_file` on large files, or `bash` output from verbose commands) are truncated before being added back into an Agent's conversation history, with a clear `[... N lines truncated ...]` marker, to avoid context window blowups from a single tool call. The truncation limit is configurable but defaults to roughly 2,000 lines / ~8,000 tokens per tool result. Agents are instructed (via the tool's `description`) to use range parameters (e.g., `read_file` with `start_line`/`end_line`) rather than relying on truncation when they know they need a specific section of a large file.

---

## 8. The Skill System

OpenAgent adopts the **Agent Skills standard** as-is, rather than inventing a competing format. This standard originated with Claude/Claude Code and is now shared across Cursor, OpenAI Codex, OpenCode, and Google Antigravity — meaning any skill written for any of those tools works unmodified in OpenAgent, and any skill written for OpenAgent works unmodified in them. This is a deliberate adoption decision, not a coincidence: inventing a new, incompatible skill format would cut OpenAgent off from a large and growing ecosystem of community-authored skills (including public repositories with 1,000+ ready-made skills) for no real benefit. See `SKILLS.md` for the full spec and authoring guide; this section covers how the skill system integrates with OpenAgent's architecture specifically.

### 8.1 Anatomy of a skill

A skill is a directory containing a required `SKILL.md` and optional supporting assets:

```
my-skill/
├── SKILL.md          # required — YAML frontmatter + markdown instructions
├── scripts/           # optional — executable helpers the agent can invoke
├── examples/          # optional — reference implementations / few-shot examples
└── resources/         # optional — templates, static assets
```

`SKILL.md` itself:

```markdown
---
name: api-error-handling
description: "Standardizes error responses across REST API endpoints using this project's error envelope format. Use when implementing or reviewing API route handlers."
---

# API Error Handling

When implementing an API route handler, all error responses must use this shape:
...
```

The `description` field is the single most important piece of the file — it is what an Agent reads (cheaply, before deciding to load anything else) to decide whether this skill is relevant to the current task. Skill authoring guidance (writing a good `description`, the Quick Reference / Reference Pattern / Tool Use Pattern conventions) lives in `SKILLS.md`, not duplicated here.

### 8.2 Skill scopes

Two scopes, matching the convention used across the broader skill ecosystem:

| Scope | Location | Use case |
|---|---|---|
| Project | `<project-root>/.agent/skills/<skill-name>/` | Team-shared, version-controlled with the repo. Use for project-specific conventions, internal API patterns, deployment procedures specific to this codebase. |
| Global / user | `~/.openagent/skills/<skill-name>/` | Personal toolbox, available across all projects. Use for skills the user wants regardless of which codebase they're in. |

If a project skill and a global skill share the same `name`, the project skill takes precedence — this matches the convention used by Antigravity and others, so skills behave the same way regardless of which compatible tool a user is running.

OpenAgent also reads `.claude/skills/`, `.cursor/skills/` (where the format matches), and other known compatible paths in a configurable search list, specifically so a project that already has skills set up for another tool doesn't need to duplicate them for OpenAgent. This is configurable in `.openagent/config.json` under `skills.additionalSearchPaths`.

### 8.3 Per-agent skill attachment

This is the part specific to OpenAgent's multi-agent structure: skills are not just "on" or "off" globally, they can be scoped to a level of the hierarchy:

```typescript
// src/skills/types.ts

export interface SkillAttachment {
  skillName: string;
  scope:
    | { level: "global" }                      // available to every agent in every session
    | { level: "manager" }                       // available only to the Manager
    | { level: "team"; teamType: string }         // available to a specific team's Lead + its Micro Agents
    | { level: "agent"; agentId: string };        // available to one specific agent instance
}
```

Practically, this means a user can, for example, attach a `react-component-conventions` skill only to the Frontend Team, and a `database-migration-safety` skill only to the Backend Team, without either team's agents being burdened with irrelevant skill metadata in their context. This directly answers the multi-model, multi-skill design you described: skills compose with per-agent model assignment independently — a Team can run on any model *and* have any skill attached, the two axes don't interact.

### 8.4 Discovery and loading (progressive disclosure)

Skills are **not** fully loaded into every Agent's context at all times — this is the "progressive disclosure" principle the broader Agent Skills ecosystem is built around, and OpenAgent follows it for the same reason everyone else does: loading the full text of every installed skill up front wastes context and risks irrelevant skills triggering on unrelated tasks.

The loading sequence for a given Agent instance:

1. **At Agent construction**, the orchestration layer resolves which skills are *attached* to this agent (per Section 8.3's scoping rules) and reads only their `name` + `description` (cheap — this is metadata only, not the full file).
2. **This metadata list is included in the Agent's system prompt** as a short, structured "available skills" section — enough for the model to recognize relevance, not enough to bloat context.
3. **When the Agent's model judges a skill relevant** to the current task (a model-driven decision, the same way Claude Code or Antigravity does it — there's no separate classifier), it requests the skill's full content via a dedicated `load_skill` tool call.
4. **The `load_skill` tool execution** reads the full `SKILL.md` (and the agent may subsequently read files under `scripts/`, `examples/`, `resources/` using its normal file tools) and returns that content as a tool result, which becomes part of the conversation from that point on.

This means `load_skill` is itself implemented as a `Tool` (Section 7.1) — it is not special-cased outside the tool system, consistent with Section 2.2's composition-over-special-casing principle.

### 8.5 Skill security

Per the broader ecosystem's own guidance, skills can include scripts that execute and make network calls, which means an untrusted skill is a real attack surface (this matches publicly documented concerns from the Antigravity/Agent Skills community about exactly this risk). OpenAgent's stance:

- Skills sourced from the project's own repo (`.agent/skills/`) are trusted by default, on the theory that if an attacker can write to the project repo, they already have more direct ways to cause harm.
- Skills installed globally from third-party sources are **not** auto-trusted to execute scripts; running a skill's `scripts/` content requires the same permission-check path as the `bash` tool (Section 23), so a malicious skill can't silently `curl | bash` something without the user seeing a permission prompt naming exactly what's about to run.
- A future `openagent skill audit <skill-name>` command (tracked in `ROADMAP.md`) is planned to statically scan a skill's scripts for known-risky patterns (arbitrary network calls, `eval`, pipe-to-shell) before a user installs it from a community source, mirroring tooling that already exists in the broader skills ecosystem.

---

## 9. The Manager

### 9.1 Responsibilities

The Manager is a singleton Agent (Section 4) with these specific responsibilities, implemented in `src/orchestration/manager.ts`:

1. **Intake.** Receive the user's prompt, classify it as trivial or substantial (Section 3.3).
2. **Plan ownership.** For substantial requests, spawn the Planning Team, receive its `plan.md` output, present it for approval, and persist the approved version as the session's authoritative plan.
3. **Team sequencing.** Read `plan.md` to determine the next team to spawn, in the order the plan specifies. The Manager does not invent the sequence itself for the dynamic teams — that's the Planning Team's job — but it is responsible for actually instantiating each Team in turn and feeding it the right scoped context.
4. **Approval gating.** After every team (including Planning and Verifier) completes its phase, the Manager is responsible for pausing and surfacing that team's result for user approval (Section 14) before proceeding.
5. **Conflict and revision handling.** If the user requests changes at an approval gate, the Manager is responsible for routing that feedback back to the relevant team (re-activating it with the feedback as additional context) rather than treating "changes requested" as a dead end.
6. **Final reporting.** Once the Verifier Team passes (or the user accepts a result despite Verifier concerns — see Section 13.3), the Manager produces a final summary of everything that was done, in plain language, for the user.
7. **Mention routing.** When the user `@mentions` a specific team mid-session (Section 16), the Manager is the component that resolves that mention to the right team instance and routes the message there instead of through normal sequencing.

### 9.2 Manager system prompt structure

The Manager's system prompt (`src/orchestration/prompts/manager.md`) is structured, at a high level, as:

```
1. Role definition: "You are the Manager..."
2. The list of default teams (Planning, Verifier) and their fixed position
   in the sequence (Planning always first, Verifier always last).
3. Instructions for classifying trivial vs. substantial requests.
4. Instructions for reading plan.md and determining team sequencing.
5. The orchestration pseudo-tools available to it (spawn_team, update_plan,
   request_approval) with usage guidance.
6. Constraints: never skip Planning or Verifier; never proceed past an
   approval gate without explicit user approval; never fabricate a team's
   result if that team hasn't actually run.
7. [Injected] Any skills scoped to "manager" level (Section 8.3).
```

### 9.3 The Manager's own tools

The Manager has a narrow, specific toolset — it is explicitly *not* meant to be doing the implementation work itself for substantial requests (that's what Teams and Micro Agents are for):

- Read-only filesystem tools, so it can inspect the codebase enough to classify requests and sanity-check team outputs.
- `spawn_team(teamType, scopedContext)` — instantiates a Team, passing it the relevant slice of `plan.md` and any other necessary context.
- `update_plan(changes)` — used during the planning approval loop if the user requests edits to `plan.md` before approving it.
- `request_approval(summary, diffRefs)` — triggers the Approval Gate UI flow (Section 14) and suspends the Manager's loop until the Orchestrator resumes it with the user's decision.

For trivial requests (Section 3.3), the Manager additionally has access to the standard write/edit tools (Section 7.2), since it's expected to just do the small task itself rather than spinning up a whole Team for a one-line fix.

### 9.4 Manager state machine

```
        ┌───────────┐
        │   IDLE     │◄──────────────────────────────┐
        └─────┬─────┘                                  │
              │ user prompt received                    │
              ▼                                         │
        ┌───────────────┐                               │
        │ CLASSIFYING     │                               │
        └───┬─────────┬───┘                               │
   trivial  │         │ substantial                       │
            ▼         ▼                                    │
   ┌─────────────┐ ┌───────────────────┐                  │
   │ HANDLING_    │ │ PLANNING            │                  │
   │ DIRECTLY     │ │ (Planning Team       │                  │
   │              │ │  active)             │                  │
   └─────┬───────┘ └─────────┬───────────┘                  │
         │                    ▼                              │
         │           ┌─────────────────────┐                │
         │           │ AWAITING_PLAN_       │                │
         │           │ APPROVAL              │                │
         │           └─────────┬─────────────┘                │
         │            approved │ changes requested              │
         │                     ▼          (loop back to PLANNING)│
         │           ┌─────────────────────┐                    │
         │           │ EXECUTING_TEAM        │◄──────────────┐   │
         │           │ (current team active)  │                │   │
         │           └─────────┬─────────────┘                │   │
         │                     ▼                                │   │
         │           ┌─────────────────────┐                    │   │
         │           │ AWAITING_TEAM_        │                    │   │
         │           │ APPROVAL              │ changes requested  │   │
         │           └──────┬──────┬─────────┘────────────────────┘   │
         │           approved│      │ more teams remain                │
         │                   │      └──────────────► EXECUTING_TEAM (next)
         │                   ▼ all teams done
         │           ┌─────────────────────┐
         │           │ VERIFYING             │
         │           │ (Verifier Team active) │
         │           └─────────┬─────────────┘
         │                     ▼
         │           ┌─────────────────────┐
         └──────────►│ REPORTING             │
                      └─────────┬─────────────┘
                                 │
                                 └─────────────────► IDLE
```

This state machine is implemented explicitly (not left implicit in control flow) in `src/orchestration/manager-state.ts`, both because it makes the Manager's behavior auditable/testable, and because the TUI needs to know the current state to render the right UI (a plan-approval prompt looks different from a team-result-approval prompt, which looks different from a "Manager is thinking" indicator).

---

## 10. Teams

### 10.1 Team definition

```typescript
// src/orchestration/team.ts

export interface TeamDefinition {
  type: string;               // e.g. "frontend", "backend", "planning", "verifier", or a dynamic name
  displayName: string;        // shown in the TUI, e.g. "Frontend Team"
  isDefault: boolean;         // true only for planning and verifier
  systemPromptTemplate: string; // base system prompt for this team's Lead
  defaultModel?: ModelAssignment; // falls back to global defaults if unset
  defaultSkills?: SkillAttachment[];
}

export interface TeamInstance {
  id: string;                  // unique per spawn, e.g. "backend-1"
  definition: TeamDefinition;
  lead: Agent;
  microAgents: Map<string, Agent>; // populated as the Lead spawns them
  status: "active" | "awaiting_approval" | "completed" | "revising";
  scopedPlanContext: string;    // the slice of plan.md relevant to this team
  result?: TeamResult;
}

export interface TeamResult {
  summary: string;
  filesChanged: string[];
  toolCallsExecuted: ToolCallRecord[];
  microAgentReports: { microAgentId: string; subtask: string; summary: string }[];
}
```

### 10.2 Built-in team types

| Team type | Default? | Typical model use | Notes |
|---|---|---|---|
| `planning` | Yes, always first | Often the same model as the Manager, since it requires strong reasoning over the whole request | Produces `plan.md`. See Section 12. |
| `verifier` | Yes, always last | Benefits from a strong model, since judging correctness is at least as hard as producing it | Checks cumulative output against the plan. See Section 13. |
| `frontend` | No, dynamic | — | Activated when the plan calls for UI/client-side work. |
| `backend` | No, dynamic | — | Activated when the plan calls for server-side/API work. |
| `infra` | No, dynamic | — | Activated for deployment, CI/CD, infrastructure-as-code tasks. |
| `database` | No, dynamic | — | Activated for schema design, migrations. |
| *(arbitrary)* | No, dynamic | — | The Planning Team can define a new team type on the fly if the request needs something not covered by the built-ins (Section 15). |

Only `planning` and `verifier` are hard-coded as always-present; everything else is determined per-session by the plan.

### 10.3 The lifecycle of a Team instance

1. **Spawn.** The Manager calls `spawnTeam(teamType, scopedContext)`. The Orchestrator looks up the `TeamDefinition` (built-in or dynamically defined in the current plan), resolves its model assignment and skill attachments (Sections 5.5, 8.3), and constructs the Team Lead as an `Agent`.
2. **Decompose.** The Team Lead's first action is always to break `scopedPlanContext` into a concrete subtask list. This is itself just the Team Lead's `Agent.run()` loop producing a structured output (a list of subtasks with enough detail for a Micro Agent to execute each independently).
3. **Delegate.** For each subtask, the Team Lead calls its `spawn_micro_agent(subtask, requiredTools, requiredSkills)` pseudo-tool. Subtasks that are independent of each other are spawned and run concurrently (Section 10.4); subtasks with dependencies (e.g., "write the API route" depends on "define the data model") are sequenced by the Team Lead.
4. **Integrate.** As Micro Agents report back, the Team Lead reviews their output, resolves any conflicts (e.g., two Micro Agents touched overlapping code in incompatible ways), and may re-dispatch a Micro Agent with corrective feedback if something is wrong.
5. **Report.** The Team Lead produces a `TeamResult` and returns it to the Manager. The Team instance's status moves to `awaiting_approval`.
6. **Approve or revise.** Per Section 14, the user approves or requests changes. If changes are requested, status moves to `revising`, the Team Lead is re-activated with the feedback, and the cycle returns to step 3 or 4 as appropriate. If approved, status moves to `completed` and the Team instance is torn down (its `TeamResult` persists in session state; the live `Agent` instances do not).

### 10.4 Concurrency within a team

Micro Agents working on genuinely independent subtasks (different files, no shared interfaces being defined concurrently) run **concurrently**, not sequentially — this is one of the main performance/value propositions of the whole architecture, and a Team Lead that just runs Micro Agents one at a time is failing to use the model correctly. The Team Lead is responsible for this judgment call as part of its decomposition step (step 2 above): it must identify which subtasks are safe to parallelize and which have ordering dependencies, and structure its `spawn_micro_agent` calls accordingly.

Concrete mechanism: the Team Lead's decomposition output includes a dependency graph (a simple DAG: subtask → subtasks it depends on). The orchestration layer (`src/orchestration/team-executor.ts`) walks this DAG, spawning all subtasks with no unmet dependencies immediately and in parallel via `Promise.all`-style concurrency, then spawning newly-unblocked subtasks as their dependencies complete.

### 10.5 Team-level configuration

Per the multi-model design goal, every built-in or dynamic team type can be configured independently in `.openagent/config.json`:

```json
{
  "teams": {
    "backend": {
      "model": { "providerId": "anthropic", "modelId": "claude-opus-4-8" },
      "skills": ["database-migration-safety", "rest-api-conventions"]
    },
    "frontend": {
      "model": { "providerId": "openai", "modelId": "gpt-5" },
      "skills": ["react-component-conventions"]
    }
  }
}
```

If a team is not explicitly configured, it inherits the global `defaultModel` (Section 5.5) and has no extra skills beyond anything attached at the global scope.

---

## 11. Micro Agents

### 11.1 Definition and scope

A Micro Agent is deliberately the smallest, most disposable unit in the hierarchy. It is spawned for exactly one subtask, with exactly the context it needs to complete that subtask (the subtask description, any directly relevant file contents the Team Lead identified, relevant skills), and is torn down the moment it reports back. There is no Micro Agent that persists across subtasks — even if the "next" subtask is conceptually similar, a fresh Micro Agent is spawned for it. This is intentional: it keeps each Micro Agent's context small and focused (cheaper, faster, less prone to drift) and makes failures easy to isolate (a failed subtask is the failure of one disposable Micro Agent, not a corrupted long-lived one).

```typescript
// src/orchestration/micro-agent.ts

export interface MicroAgentSpawnRequest {
  subtask: string;             // concrete, specific description of the work
  relevantContext: string[];   // file paths or content snippets the Team Lead deemed relevant
  requiredTools: string[];     // subset of the full tool catalog needed for this subtask
  requiredSkills?: string[];   // skill names, resolved against project/global skill dirs
  dependsOn?: string[];        // other subtask IDs that must complete first (used by Team Lead's DAG)
}

export interface MicroAgentReport {
  subtaskId: string;
  summary: string;
  filesChanged: string[];
  success: boolean;
  blockers?: string;           // populated if the Micro Agent could not complete the subtask
}
```

### 11.2 What makes a good subtask (guidance for Team Lead prompting)

The Team Lead's decomposition quality is the single biggest factor in whether the Team produces good output, so its system prompt includes explicit guidance on subtask sizing:

- A subtask should be completable by a Micro Agent in well under its `maxTurns` budget (Section 6.4) — if a Team Lead's decomposition regularly produces subtasks that need close to 25 turns, the decomposition is too coarse.
- A subtask should have a clear, checkable definition of done ("implement the `POST /todos` route with validation and the error envelope from the skill" is good; "work on the backend" is not).
- A subtask should specify file boundaries where possible, to reduce the odds of two concurrent Micro Agents stepping on each other (Section 10.4).

### 11.3 Micro Agent failure handling

If a Micro Agent reports `success: false` with a `blockers` explanation, the Team Lead must not silently drop that subtask from its final report. It has three options, and its system prompt requires it to explicitly choose one:

1. **Retry** with adjusted context (e.g., the blocker was "couldn't find the existing auth middleware" — the Team Lead supplies the correct file path and re-spawns).
2. **Re-decompose** — the subtask was wrong-sized or wrongly scoped; break it into two new subtasks.
3. **Escalate** — surface the blocker in the `TeamResult` going up to the Manager, so it's visible at the approval gate rather than silently missing from the result. This is the required fallback if retry/re-decompose isn't working, consistent with Section 2.7 (fail loud, never silently).

---

## 12. The Planning Team and plan.md

### 12.1 Why planning is non-negotiable

Per your original design intent, the Planning Team is always the first team to run for any substantial request, with no config option to disable it. This is deliberate: `plan.md` is the contract the rest of the system holds itself to (Section 2.6). Skipping planning doesn't just remove a nice-to-have artifact, it removes the thing every other team's scoping and the Verifier's correctness check are built around. A user who wants speed over process should be steering the Manager toward classifying their request as "trivial" (Section 3.3), not bypassing planning for substantial multi-team work.

### 12.2 What the Planning Team actually does

The Planning Team has exactly one Team Lead and, atypically for a Team, usually **no Micro Agents** — planning is a single coherent reasoning task, not naturally parallelizable the way implementation work is. (The architecture doesn't forbid the Planning Lead from spawning a Micro Agent for, e.g., "go research how this specific existing module works" as a sub-investigation, but it's the exception, not the norm.)

The Planning Lead's process:

1. Read the user's full request.
2. Inspect the existing codebase as needed (read-only tools) to understand current structure, conventions, and constraints.
3. Determine which domains of work this request touches (frontend, backend, infra, database, or something not covered by the built-ins — see Section 15).
4. For each domain, determine: what team handles it, what that team needs to accomplish, what it depends on (e.g., backend API shape needs to be decided before frontend can integrate against it), and roughly how to sequence teams given those dependencies.
5. Produce `plan.md` in the required structure (12.3).

### 12.3 Required structure of plan.md

This structure is enforced (the Planning Team's system prompt specifies it exactly, and a validator in `src/orchestration/plan-validator.ts` checks the produced file against it before it's presented for approval):

```markdown
# Plan: <short title derived from the request>

## Summary
<2-4 sentences: what is being built/changed and why>

## Teams and Sequence

1. **Planning** (this team) — produces this document.
2. **<Team Name>** — <one-paragraph description of what this team will do>
   - Depends on: <none, or list of earlier teams>
   - Key deliverables: <bullet list>
3. **<Team Name>** — ...
   ...
N. **Verifier** — validates the above against this plan.

## Assumptions
<Anything the plan assumes that wasn't explicitly stated by the user,
flagged so the user can correct it before work starts.>

## Open Questions
<Anything genuinely ambiguous that the Planning Team could not resolve
on its own. If this section is non-empty, the Manager should prefer
surfacing these to the user as part of the approval gate, rather than
guessing.>

## Out of Scope
<Explicitly what this plan does NOT cover, to set expectations.>
```

Real example, for "build a REST API for a todo app with authentication":

```markdown
# Plan: Todo API with Authentication

## Summary
Build a REST API for managing todos, with user accounts and JWT-based
authentication gating access to each user's own todos.

## Teams and Sequence

1. **Planning** (this team) — produces this document.
2. **Database Team** — designs the schema for users and todos, sets up
   migrations.
   - Depends on: none
   - Key deliverables: `users` and `todos` tables, migration files,
     a seed script for local development.
3. **Backend Team** — implements the API routes, auth middleware, and
   business logic.
   - Depends on: Database Team (needs the schema finalized)
   - Key deliverables: `/auth/register`, `/auth/login`, `/todos` CRUD
     routes, JWT issuance and verification middleware.
4. **Verifier** — runs the test suite, checks routes against this plan,
   confirms auth properly gates todo access.

## Assumptions
- JWT-based auth, not session-based, since none was specified.
- No frontend is in scope for this request.

## Open Questions
- Should todos support sharing between users, or are they strictly
  per-owner? Plan assumes strictly per-owner.

## Out of Scope
- Any UI/frontend.
- Password reset / email verification flows.
```

Note there's no separate Frontend team here — the Planning Team only spawns the teams the request actually needs. This is the dynamic team selection in action (Section 15): Database and Backend were both *not* hard-coded, the Planning Team determined they were the right two teams for this specific request.

### 12.4 Revisions to the plan

If the user requests changes at the approval gate (Section 14), that feedback is routed back to the Planning Team (re-activated, not a fresh instance — it retains its own context from the first pass) along with the user's specific feedback. The Planning Team produces a revised `plan.md`, and the approval gate re-presents it. This loop can repeat as many times as needed; there's no limit on plan revisions, only on execution turns within a single Planning Team activation (Section 6.4).

### 12.5 plan.md as a living document during execution

Once approved, `plan.md` is not frozen and forgotten — the Manager updates it (via the `update_plan` tool, Section 9.3) to mark teams as completed and to record any significant deviations a Team Lead reports during execution (e.g., "Backend Team discovered the existing ORM doesn't support the planned migration approach and used X instead — noted here for Verifier's awareness"). The version of `plan.md` that the Verifier Team checks against is this living, annotated version — not a frozen snapshot — so verification reflects reality, not just the original intent.

---

## 13. The Verifier Team

### 13.1 Why verification is non-negotiable, like planning

Symmetric to Section 12.1: the Verifier Team always runs last, with no config option to fully disable it (though its strictness is configurable, Section 13.4). The whole multi-team architecture is only trustworthy if there's a final check that the cumulative output actually satisfies the plan — otherwise "the Backend Team said it's done" is just an unverified claim.

### 13.2 What the Verifier Team actually does

1. Reads the final, annotated `plan.md`.
2. Reads the cumulative diff/change set produced across all teams in this session.
3. For each plan deliverable, checks whether it appears to have been satisfied (this is itself a Micro-Agent-parallelizable task in larger plans — the Verifier Lead can spawn one Micro Agent per deliverable to check it, similar to how implementation Micro Agents work).
4. Runs any applicable automated checks it can discover in the project: test suite (`npm test`, `pytest`, etc., auto-detected from project files), linter, type-checker, build command. The Verifier Team does not invent new tests for functionality the plan didn't call for; it runs what the project already has and reports results.
5. Produces a verification report:

```markdown
# Verification Report

## Plan deliverables checked

- [x] `users` and `todos` tables with migrations — found in `migrations/`, schema matches plan.
- [x] `/auth/register`, `/auth/login` — implemented, tested manually via curl, both return expected shapes.
- [x] `/todos` CRUD routes — implemented.
- [ ] JWT verification middleware properly gates per-user access — **FAILED**: `/todos/:id` does not check that the requesting user owns the todo; any authenticated user can fetch any todo by ID.

## Automated checks

- `npm test`: 14/16 passing. 2 failures in `todos.test.ts`, both related to the ownership-check gap above.
- `npm run lint`: clean.
- `npm run build`: clean.

## Verdict: FAIL — 1 deliverable not met, 2 tests failing.

## Recommended next step
Route back to Backend Team with: "Add an ownership check in the
`/todos/:id` handlers; see `todos.test.ts` for the two failing cases
that specify the expected behavior."
```

### 13.3 What happens on FAIL vs PASS

- **PASS**: the Manager proceeds to final reporting (Section 9.1, step 6).
- **FAIL**: the Manager's default behavior is to route the Verifier's recommended next step back to the relevant team (re-activating it, same mechanism as Section 12.4's plan revision loop) for another pass, then re-run the Verifier Team once that team reports completion again. This can loop. To avoid an infinite loop on a request that's fundamentally stuck, there's a configurable `maxVerificationCycles` (default 3) after which the Manager stops auto-looping and instead surfaces the failure directly to the user with the Verifier's report, letting the human decide whether to keep iterating, intervene manually, or accept the result with known issues.
- The user can, at any approval gate, explicitly choose to accept a result despite Verifier concerns (e.g., "this is fine for now, ship it") — the system does not force endless iteration against the user's actual judgment. This is recorded in session state as an explicit override, not silently treated as a pass, so the distinction between "verified" and "user overrode verification" stays visible in history/logs.

### 13.4 Verifier strictness configuration

```json
{
  "verifier": {
    "strictness": "standard",
    "maxVerificationCycles": 3,
    "runAutomatedChecks": true
  }
}
```

`strictness` options: `"lenient"` (checks deliverables are present, doesn't dig deeply into edge cases), `"standard"` (default; the behavior described above), `"strict"` (additionally has the Verifier Lead spawn Micro Agents specifically tasked with trying to find edge cases / adversarial inputs against new functionality, not just checking the happy path matches the plan).

---

## 14. Human-in-the-Loop: Approval Gates

### 14.1 Where gates occur

Per your explicit requirement, gates are a **hard stop after every team** — this is the default and, unlike Planning/Verifier being mandatory phases, this particular strictness level *is* user-configurable (Section 14.4), but the out-of-the-box behavior is maximally conservative:

- After the Planning Team produces `plan.md` — gate.
- After every subsequent team (Database, Backend, Frontend, any dynamic team) completes its phase — gate.
- After the Verifier Team's report — gate (the user reviews the verdict and decides whether to accept, even on PASS, since "accept" is also where the Manager learns to proceed to final reporting).

### 14.2 What the user sees at a gate

The TUI (Section 19) renders, at minimum:

- A clear heading naming which phase just completed.
- The relevant artifact: `plan.md` rendered as formatted markdown for the planning gate; a summary + diff view of changed files for a team-result gate; the verification report for the verifier gate.
- Three actions, always available: **Approve**, **Request Changes** (opens a text input for feedback, routed per Sections 12.4/13.3), **Reject** (stops the session's current task entirely; does not delete work already done, but no further teams are spawned).

### 14.3 Gate data model

```typescript
// src/orchestration/approval.ts

export interface ApprovalGate {
  id: string;
  phase: "plan" | "team-result" | "verification";
  relatedTeamId?: string; // absent for the plan gate
  artifact: PlanArtifact | TeamResultArtifact | VerificationArtifact;
  createdAt: string;
  resolution?: {
    decision: "approved" | "changes-requested" | "rejected";
    feedback?: string;
    resolvedAt: string;
  };
}
```

Every `ApprovalGate`, resolved or pending, is persisted as part of session state (Section 17) — this gives a full audit trail of every decision point in a run, which matters both for trust and for debugging "why did the system do X" after the fact.

### 14.4 Configuring gate strictness

While gates are on by default after every team, users who want a faster, more autonomous loop can configure this explicitly:

```json
{
  "approvals": {
    "afterPlanning": "always",
    "afterEachTeam": "always",
    "afterVerification": "always"
  }
}
```

Valid values per key: `"always"` (default), `"onFailureOnly"` (only gate if the team reported a blocker or the Verifier failed — auto-proceed on clean success), `"never"` (fully autonomous for that phase — use with real caution, and the CLI prints a one-time warning the first time a session runs with any gate set to `"never"`). `afterPlanning` cannot be set to `"never"` — you can lower friction on execution gates, but you cannot make the system start executing a multi-team plan the user never saw, since that undermines the entire premise of plan.md as a real contract (Section 2.6).

---

## 15. Dynamic Team Creation

### 15.1 How a new team type comes into existence

Per your design ("if needed for orders like build website he create frontend team and the backend team"), only Planning and Verifier are fixed; everything else is decided by the Planning Team for that specific request, on every run. There is no global registry the user has to pre-populate with "allowed" team types — the Planning Team can name a team anything appropriate (`"Database Team"`, `"Mobile Team"`, `"DevOps Team"`, `"Payments Integration Team"`) as long as it follows the required plan.md structure (Section 12.3).

```typescript
// A dynamically-defined team, as produced by the Planning Team's output
// parsing (src/orchestration/plan-parser.ts), conforms to the same
// TeamDefinition shape as built-ins (Section 10.1) — there is no
// separate "DynamicTeamDefinition" type. The only difference is that
// its systemPromptTemplate is synthesized from the plan.md deliverables
// for that team, rather than being a hand-written, curated prompt file
// like Planning's or Verifier's.

function synthesizeTeamDefinition(
  teamName: string,
  planSection: PlanTeamSection,
): TeamDefinition {
  return {
    type: slugify(teamName),
    displayName: teamName,
    isDefault: false,
    systemPromptTemplate: renderDynamicTeamPrompt(planSection),
    // model/skills resolved later via normal config precedence (5.5, 8.3)
  };
}
```

### 15.2 Guardrails on dynamic team creation

Unconstrained dynamic team creation risks the Planning Team inventing an excessive number of tiny, overlapping teams (e.g., separately spawning "Validation Team," "Error Handling Team," and "API Team" for what should be one Backend Team's work). The Planning Team's system prompt includes explicit guidance against this:

- Prefer fewer, broader teams over many narrow ones; a team should correspond to a genuine domain of expertise or codebase area (frontend vs. backend vs. infra vs. database), not a granular implementation step (those belong inside a Team Lead's subtask decomposition, not as separate Teams).
- A reasonable plan for a typical feature request has 2-4 non-default teams; if the Planning Team finds itself producing more than that, it should reconsider whether some of those teams are really subtasks of a broader team.
- This is guidance enforced through prompting and through the plan validator's soft warnings (it flags, but does not hard-block, plans with an unusually high team count), not a hard-coded numeric cap — different requests genuinely warrant different team counts, and a hard cap would be exactly the kind of brittle special-casing Section 2.2 argues against.

### 15.3 Reusing team definitions across a session

If, mid-session, the user's feedback at an approval gate implies new work that maps to a team type already used earlier in this same plan (e.g., more backend changes after the Backend Team already ran once), the Manager reactivates that existing `TeamDefinition` (same model/skill config) rather than the Planning Team synthesizing a near-duplicate. This reuse logic lives in `src/orchestration/manager.ts`'s team-resolution step, checked before falling through to "ask Planning Team to define a new team type."

---

## 16. Mentions: Talking Directly to a Team

### 16.1 The `@team-name` syntax

At any point — including mid-execution, or after a session has otherwise completed — the user can type a message starting with `@<team-name>` (e.g., `@backend-team can you also add a DELETE /todos/:id route`) to address a specific team directly, bypassing the Manager's normal classification/sequencing logic for that one message.

### 16.2 Resolution behavior

The Manager (which remains the router even for mentions — there's no separate "mention handler" component, consistent with Section 2.2) resolves `@team-name`:

1. If a team with a matching `type` or `displayName` (fuzzy-matched, case-insensitive) has run earlier in this session, that exact team instance's context (its prior `TeamResult`, its model/skill configuration) is reactivated, and the new message is given to its Team Lead as additional input.
2. If no such team has run yet but the name matches a known built-in or a team type mentioned in the current `plan.md`, a fresh instance is spawned with that configuration.
3. If the name doesn't resolve to anything recognizable, the Manager asks the user for clarification rather than guessing — listing the currently known team names as options, similar to how ambiguous CLI subcommands typically suggest the closest valid options.

### 16.3 Why this still goes through an approval gate

A mention does not bypass Section 14's approval gates — the team it routes to still reports a `TeamResult` that gets gated before being considered final. Mentions are a routing shortcut, not a trust shortcut; the whole point of the gate system is that no team's output becomes "real" without the user seeing it first, and mentions don't get a special exemption from that rule.

---

## 17. Session State and Persistence

### 17.1 What a session is, concretely

```typescript
// src/core/session.ts

export interface Session {
  id: string;
  projectRoot: string;
  createdAt: string;
  updatedAt: string;
  managerState: ManagerStateSnapshot;     // Section 9.4's state machine, serialized
  plan: PlanArtifact | null;
  teams: TeamSummary[];                    // completed/active teams, NOT live Agent instances
  approvalGates: ApprovalGate[];            // Section 14.3, full history
  transcript: TranscriptEntry[];            // user-visible chat history
  costTracking: SessionUsage;               // Section 25
}

export interface TeamSummary {
  id: string;
  type: string;
  displayName: string;
  status: TeamInstance["status"];
  result?: TeamResult;
  modelUsed: ModelAssignment;
  skillsUsed: string[];
}
```

Crucially, what's persisted is **data**, not live objects — a `Session` on disk never contains a serialized `Agent` or an open connection to a `Provider`. On resume (17.3), the Orchestrator reconstructs whatever live `Agent` instances are needed for the session's current state (e.g., if resuming mid-approval-gate, no Agent needs to be live yet; if resuming mid-team-execution, the relevant Team Lead and any in-flight Micro Agents are reconstructed from the team's stored scoped context).

### 17.2 Storage location and format

Sessions are stored per-project at `.openagent/sessions/<session-id>.json`. This directory is added to a project's `.gitignore` by default when OpenAgent first initializes a project (Section 21), since session files contain conversation transcripts that may include sensitive context the user wouldn't want committed — though a user can deliberately choose to commit a specific session file (e.g., to share a particularly good run as a reference) since nothing prevents it; the gitignore default is a safety net, not a hard restriction.

### 17.3 Resuming a session

```bash
openagent resume                 # resumes the most recent session for this project
openagent resume <session-id>    # resumes a specific session
openagent sessions                # lists sessions for this project with status/summary
```

On resume, the Orchestrator loads the `Session` object, reconstructs the Manager's state machine to exactly where it left off, and — critically — if the session was paused at an approval gate, immediately re-presents that gate rather than silently proceeding. Resuming a session must never cause work to happen that the user hasn't approved, even if significant time has passed since the session was paused.

### 17.4 What is NOT persisted

- Raw provider API responses (`CompletionResponse.raw`) — these are debug-only and not session state (Section 5.2).
- Live streaming connections, obviously.
- API keys/credentials — these live only in user-level config (Section 18.2) or environment variables, never inside a session file, so that a session file is safe to share or commit without leaking secrets.

---

## 18. Configuration

### 18.1 Configuration layering

OpenAgent reads configuration from multiple layers, merged with later layers overriding earlier ones:

1. **Built-in defaults** (`src/config/defaults.ts`) — sane out-of-the-box values for everything in this document.
2. **Global user config** — `~/.openagent/config.json`. Personal defaults that apply across all projects (e.g., a preferred default provider/model, global skill paths).
3. **Project config** — `<project-root>/.openagent/config.json`. Project-specific overrides, intended to be committed to the project's repo so a team shares the same OpenAgent behavior on this codebase.
4. **Environment variables** — `OPENAGENT_*` prefixed, for CI/non-interactive contexts and for credentials specifically (Section 18.2).
5. **CLI flags** — highest precedence, for one-off overrides (`openagent --model gpt-5 "fix this bug"`).

### 18.2 Credentials

API keys are never stored in `config.json` files in plaintext as a matter of policy (to keep project config safely committable). Instead:

- `openagent auth login <provider>` walks the user through obtaining/entering a key and stores it in the OS keychain where available (via a library like `keytar`), falling back to a restricted-permission file at `~/.openagent/credentials` (mode `600`) on systems without keychain support.
- Environment variables (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, etc. — the same variable names those providers' own SDKs conventionally expect) are also honored directly, which matters for CI and for users who already manage secrets that way.

### 18.3 Top-level config schema

```typescript
// src/config/schema.ts (illustrative — actual schema uses zod for runtime validation)

export interface OpenAgentConfig {
  defaultModel: ModelAssignment;
  defaults: {
    manager?: Partial<ModelAssignment>;
    teamLead?: Partial<ModelAssignment>;
    microAgent?: Partial<ModelAssignment>;
  };
  teams: Record<string, TeamConfig>;          // Section 10.5
  approvals: ApprovalConfig;                    // Section 14.4
  verifier: VerifierConfig;                     // Section 13.4
  skills: {
    additionalSearchPaths: string[];            // Section 8.2
  };
  autonomy: {
    planningThreshold: "low" | "medium" | "high"; // Section 3.3 — how readily the Manager invokes the full pipeline vs. handling directly
  };
  ui: UiConfig;                                  // Section 19.6
  telemetry: { enabled: boolean };               // Section 25.4 — opt-in, off by default
}
```

### 18.4 Example project config

```json
{
  "defaultModel": { "providerId": "anthropic", "modelId": "claude-opus-4-8" },
  "teams": {
    "frontend": {
      "model": { "providerId": "openai", "modelId": "gpt-5" },
      "skills": ["react-component-conventions"]
    }
  },
  "approvals": {
    "afterPlanning": "always",
    "afterEachTeam": "always",
    "afterVerification": "always"
  },
  "verifier": { "strictness": "standard", "maxVerificationCycles": 3 },
  "autonomy": { "planningThreshold": "medium" }
}
```

This is the literal embodiment of your "single model for everything OR independent model per team" requirement: omit `teams` entirely and everything uses `defaultModel`; populate specific team overrides and those teams diverge, with no code path treating either configuration as more "supported" than the other.

### 18.5 Config validation and errors

All config is validated against a `zod` schema at load time (`src/config/load.ts`). Invalid config (e.g., a `providerId` that isn't registered, Section 5.3) produces a specific, actionable error pointing at the offending key — never a generic "invalid config" message and never a silent fallback to defaults for a value the user explicitly (if mistakenly) set.

---

## 19. The Terminal UI (TUI)

### 19.1 Why Ink

OpenAgent's TUI is built with [Ink](https://github.com/vadimdemedes/ink), which renders React components to the terminal. This is the same general approach used by other tools in this space, and it's the right call for OpenAgent specifically because the orchestration model has genuinely complex, nested UI state to render (multiple teams, multiple agents, approval gates, streaming text) — a component model with real state management is a much better fit than hand-rolled ANSI escape sequence juggling.

### 19.2 Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ OpenAgent · my-project · claude-opus-4-8 (manager default)         │  ← status bar
├─────────────────────────────────────────────────────────────────┤
│                                                                       │
│  > build a REST API for a todo app with authentication               │  ← user message
│                                                                       │
│  ● Manager                                                            │
│    This is substantial enough to plan first. Spawning Planning Team…  │
│                                                                       │
│  ┌─ Planning Team ───────────────────────────────────────────────┐  │
│  │ Analyzing request and existing codebase...                      │  │
│  │ ✓ plan.md drafted                                                 │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  ┌─ Approval needed: Plan ──────────────────────────────────────┐   │
│  │ [rendered plan.md content]                                      │   │
│  │                                                                   │   │
│  │  [a] Approve   [c] Request changes   [r] Reject                  │   │
│  └───────────────────────────────────────────────────────────────┘   │
│                                                                       │
├─────────────────────────────────────────────────────────────────┤
│ > _                                                                   │  ← input box
└─────────────────────────────────────────────────────────────────┘
```

When teams are actively executing concurrently with their Micro Agents also running concurrently, the TUI uses collapsible sub-panes per team, each showing a live-updating one-line status per Micro Agent (e.g., `⠋ micro-agent-3: implementing POST /todos route`), expandable to full output on demand — important so that a multi-team, multi-micro-agent run doesn't become an unreadable wall of interleaved text.

### 19.3 Component structure

```
src/ui/
├── App.tsx                  # root component, owns top-level layout
├── StatusBar.tsx
├── Transcript.tsx           # scrollable message history
├── TeamPane.tsx             # one collapsible pane per active/recent team
├── MicroAgentLine.tsx       # one live status line per micro agent
├── ApprovalPrompt.tsx       # renders ApprovalGate artifacts + captures decision
├── PlanRenderer.tsx         # markdown-to-terminal rendering for plan.md
├── DiffView.tsx             # renders file diffs for team-result gates
├── InputBox.tsx             # the bottom input, handles @mention autocomplete
└── hooks/
    ├── useAgentEvents.ts     # subscribes to AgentEventBus, drives live updates
    └── useSession.ts          # session state access for the UI layer
```

### 19.4 Streaming and responsiveness

Every visible text-producing surface (Manager's own responses, a Team Lead's narration, a Micro Agent's status) streams token-by-token from the Provider Layer's `stream()` method (Section 5.1) through to the relevant Ink component — there is no part of the UI that waits for a full response before showing anything. This matters more in OpenAgent than in a single-agent CLI, because with multiple concurrent agents, a UI that buffers before rendering would feel especially sluggish and opaque about what's actually happening.

### 19.5 Keyboard interaction

| Key | Action |
|---|---|
| `Enter` | Submit input |
| `@` (in input box) | Triggers team-name autocomplete (Section 16) |
| `Tab` | Cycle focus between team panes |
| `Ctrl+E` (on a focused pane) | Expand/collapse that pane's full output |
| `a` / `c` / `r` (when an approval prompt is focused) | Approve / Request changes / Reject |
| `Ctrl+C` (once) | Interrupt the current agent activity, return to input |
| `Ctrl+C` (twice, quickly) | Exit OpenAgent |

### 19.6 UI configuration

```typescript
export interface UiConfig {
  theme: "dark" | "light" | "auto";
  collapseCompletedTeams: boolean; // default true — keeps the transcript scannable
  showTokenUsage: boolean;          // default true — Section 25
  showCostEstimate: boolean;        // default true if cost data is available for the provider/model
}
```

---

## 20. CLI Entry Points and Commands

### 20.1 Primary entry point

```bash
openagent                    # launches the interactive TUI in the current directory
openagent "<prompt>"         # launches the TUI, immediately submitting this prompt
```

### 20.2 Subcommands

```bash
openagent init                       # scaffolds .openagent/ in the current project
openagent auth login <provider>      # Section 18.2
openagent auth status                 # shows which providers have valid credentials
openagent sessions                    # Section 17.3
openagent resume [session-id]         # Section 17.3
openagent config get <key>
openagent config set <key> <value>
openagent skill list                  # shows discovered skills (project + global) with source
openagent skill audit <skill-name>    # Section 8.5 — static scan, planned for v1.0
openagent --version
openagent --help
```

### 20.3 Non-interactive / scripted mode

```bash
openagent run "<prompt>" --non-interactive --approve-all
```

For CI or scripting contexts, `--non-interactive` suppresses the TUI entirely and prints structured progress to stdout/stderr instead; `--approve-all` is required alongside it (the CLI refuses to run non-interactively without an explicit approval policy, since there's nobody present to respond to a gate — this is a deliberate guard against a misconfigured CI job silently hanging forever waiting for input that will never come). `--approve-all` is equivalent to setting every key in `approvals` (Section 14.4) to `"never"` for that invocation only; it does not persist to config.

---

## 21. File System Layout (Project-Side)

What OpenAgent creates/reads inside a user's project:

```
my-project/
├── .openagent/
│   ├── config.json            # Section 18.3 — committed, team-shared
│   ├── sessions/                # gitignored by default, Section 17.2
│   │   └── <session-id>.json
│   └── plan.md                 # the current/most recent session's plan,
│                                 # kept at this stable path (in addition to
│                                 # being embedded in session state) so it's
│                                 # easy for a human to open directly in an
│                                 # editor while OpenAgent is running
├── .agent/
│   └── skills/                  # Section 8.2 — project-scoped skills,
│       └── <skill-name>/         # committed, shared across the team
│           ├── SKILL.md
│           ├── scripts/
│           ├── examples/
│           └── resources/
└── ... (the rest of the user's actual project)
```

`openagent init` creates `.openagent/config.json` with built-in defaults and appends `.openagent/sessions/` to `.gitignore` (creating `.gitignore` if it doesn't exist). It does not create `.agent/skills/` automatically — that directory only appears once the user (or a team) actually adds a skill, to avoid cluttering fresh projects with an empty folder.

---

## 22. Repository Layout (Source Code)

```
openagent/                       (this repository)
├── package.json
├── tsconfig.json
├── README.md
├── ARCHITECTURE.md              (this file)
├── ROADMAP.md
├── CONTRIBUTING.md
├── SKILLS.md
├── PROVIDERS.md
├── SECURITY.md
├── LICENSE                       (MIT)
├── src/
│   ├── cli.tsx                   # entry point — argument parsing, Ink render
│   ├── ui/                        # Section 19
│   ├── core/
│   │   ├── agent.ts                # Section 6 — the shared Agent class
│   │   ├── session.ts              # Section 17
│   │   ├── tools/                  # Section 7
│   │   │   ├── types.ts
│   │   │   ├── read-file.ts
│   │   │   ├── write-file.ts
│   │   │   ├── edit-file.ts
│   │   │   ├── bash.ts
│   │   │   ├── glob.ts
│   │   │   ├── grep.ts
│   │   │   ├── web-fetch.ts
│   │   │   ├── web-search.ts
│   │   │   ├── git.ts
│   │   │   └── load-skill.ts        # Section 8.4
│   │   └── tool-executor.ts          # permission checks, logging — Section 23
│   ├── providers/
│   │   ├── provider.ts               # Section 5.1 — the shared interface
│   │   ├── registry.ts                # Section 5.3
│   │   ├── anthropic.ts
│   │   ├── openai.ts
│   │   ├── google.ts
│   │   ├── openrouter.ts
│   │   ├── ollama.ts
│   │   └── azure-openai.ts
│   ├── skills/
│   │   ├── loader.ts                  # discovery + frontmatter parsing
│   │   ├── matcher.ts                  # relevance matching, Section 8.4
│   │   └── security.ts                 # Section 8.5
│   ├── orchestration/
│   │   ├── manager.ts                  # Section 9
│   │   ├── manager-state.ts             # Section 9.4
│   │   ├── team.ts                      # Section 10
│   │   ├── team-executor.ts              # concurrency/DAG handling, Section 10.4
│   │   ├── micro-agent.ts                # Section 11
│   │   ├── plan-parser.ts                 # Section 15.1
│   │   ├── plan-validator.ts              # Section 12.3
│   │   ├── approval.ts                    # Section 14
│   │   └── prompts/                        # markdown system prompt templates
│   │       ├── manager.md
│   │       ├── planning-team.md
│   │       ├── verifier-team.md
│   │       └── team-lead-base.md
│   └── config/
│       ├── schema.ts                       # Section 18.3
│       ├── defaults.ts
│       ├── load.ts
│       └── credentials.ts                   # Section 18.2
├── test/
│   └── ... (mirrors src/ structure — Section 29)
└── examples/
    └── ... (sample sessions, sample skills, sample configs)
```

This is the target layout; `ROADMAP.md` tracks which of these files actually exist versus are planned.

---

## 23. Security and Permissions Model

### 23.1 The permission check pipeline

Every tool execution (Section 7.1's `Tool.requiresPermission`) passes through `ToolExecutor` (`src/core/tool-executor.ts`) before actually running:

```typescript
export class ToolExecutor {
  async execute(call: ToolUseBlock, agentConfig: AgentConfig): Promise<ToolCallRecord> {
    const tool = this.toolRegistry.get(call.name);
    const requirement = tool.requiresPermission(call.input);

    if (requirement.level === "deny") {
      return this.recordDenied(call, requirement.reason);
    }

    if (requirement.level === "ask") {
      const decision = await this.permissionUI.ask({
        tool: call.name,
        input: call.input,
        agentId: agentConfig.id,
        reason: requirement.reason,
      });
      if (decision === "deny") return this.recordDenied(call, "user denied");
      if (decision === "always-allow-this-session") {
        this.sessionAllowlist.add(this.fingerprint(call));
      }
    }

    const result = await tool.execute(call.input, this.buildContext(agentConfig));
    return this.recordExecuted(call, result);
  }
}
```

### 23.2 Permission prompts surface up through the hierarchy correctly

A permission prompt triggered by a Micro Agent's tool call does not block silently three levels deep — it surfaces through the TUI exactly the way an approval gate does, clearly labeled with which agent (and which team) is asking, so the user always has full context for what they're approving, never just a bare "Allow bash command?" with no indication of who's asking or why.

### 23.3 Why `bash` has no auto-allow tier

Every other tool can reach `"always-allow-this-session"` status (Section 23.1) once a user has approved a specific shape of call. `bash` is intentionally excluded from this — every `bash` invocation, for the lifetime of a session, requires an explicit per-call decision, because shell commands are the highest-leverage way for something to go wrong (arbitrary code execution, by definition) and the cost of asking every time is much lower than the cost of an unreviewed destructive command slipping through on the assumption that "it's the same shape as one I approved before." Users who find this too slow can configure specific allowed command prefixes in `.openagent/config.json` (`tools.bash.allowedPrefixes`, e.g. `["npm test", "npm run build"]`) — an explicit, auditable opt-in, rather than a generic "trust bash now" toggle.

### 23.4 Sandbox boundaries

All filesystem tool operations are constrained to `ctx.workingDirectory` (Section 7.1) and its subdirectories — path traversal attempts (`../../etc/passwd`) are rejected at the `ToolExecutor` level before reaching the tool implementation, regardless of what the underlying model requested. This applies uniformly to every Agent regardless of role; there is no elevated-trust agent role that's exempt from sandbox boundaries.

### 23.5 Skill script execution

Per Section 8.5, scripts bundled with a skill go through the exact same `ToolExecutor`/permission pipeline as a direct `bash` call — a skill's `scripts/` directory is not a backdoor around the permission system. `load_skill` (Section 8.4) only ever returns text content into the conversation; actually *running* a script the skill references is a separate, explicit tool call subject to the same scrutiny as any other shell execution.

---

## 24. Error Handling and Resilience

### 24.1 Categories of failure and how each is handled

| Failure | Handling |
|---|---|
| Provider API error (rate limit, 5xx, timeout) | Retried with exponential backoff (configurable attempts, default 3) at the Provider implementation level. If retries exhaust, surfaces as a clear error to the calling Agent's loop, which reports it up rather than silently treating it as task failure with no explanation. |
| Malformed/unparseable provider response | Treated as a hard error, not "best effort" parsing — never guess at a tool call's intent from a malformed response. Logged with the raw response for debugging (Section 5.2's `raw` field exists for exactly this). |
| Tool execution error (e.g., file not found) | Returned as a normal `tool_result` with `isError: true`, fed back to the model — this is expected, recoverable territory; the model should see it and adjust, the same way a human developer sees a command fail and tries something else. |
| Agent turn limit exceeded (Section 6.4) | Throws `AgentTurnLimitExceededError`, caught by the orchestration layer, surfaced to the user with which agent/subtask hit the limit — never silently truncated with a fabricated "success" report. |
| Micro Agent reports failure | Section 11.3's retry/re-decompose/escalate protocol. |
| Verifier fails | Section 13.3's routing-back-to-team loop, bounded by `maxVerificationCycles`. |
| Plan validation fails (Section 12.3's structure not met) | The Planning Team is given the validator's specific complaint and asked to fix the structure — this loops up to a small fixed number of attempts before surfacing to the user as "Planning Team could not produce a valid plan," since a plan that doesn't even parse is not something to silently patch around. |
| Config validation fails (Section 18.5) | Hard stop at startup with a specific, actionable message; OpenAgent never starts a session against config it can't trust. |

### 24.2 The principle behind all of the above

Every failure path in OpenAgent is designed around Section 2.7: surface clearly, fail at the right level (don't let a Micro Agent's problem silently disappear three levels up), and never let "things look fine" be the result of swallowed errors. A user should never discover, after the fact, that something silently didn't work the way the system implied it did.

---

## 25. Observability, Logging, and Cost Tracking

### 25.1 Local logs

Every Agent's tool calls, provider requests/responses (sans `raw` payload bloat in the default log level), and state transitions are logged to `.openagent/sessions/<session-id>.log` in structured (JSON-lines) format, separate from the user-facing transcript stored in the session JSON (Section 17.1) — the log is for debugging and auditing, the transcript is for the conversational record a user would want to read back.

### 25.2 Cost and token tracking

```typescript
export interface SessionUsage {
  totalInputTokens: number;
  totalOutputTokens: number;
  byAgent: Record<string, { inputTokens: number; outputTokens: number }>;
  byTeam: Record<string, { inputTokens: number; outputTokens: number }>;
  estimatedCostUsd?: number; // computed from ModelInfo's cost fields, when available (Section 5.1)
}
```

This is tracked live and shown in the TUI status bar (Section 19.6's `showTokenUsage`/`showCostEstimate`), and is essential for a multi-agent system specifically because cost can scale with team/micro-agent count in a way it doesn't for a single-agent tool — users need visibility into that to make informed model-assignment choices (Section 5.5), e.g., realizing that running every Micro Agent on a frontier model for simple subtasks is needlessly expensive compared to using a smaller model for that role.

### 25.3 Per-agent cost breakdown as a design feedback loop

Because `byAgent`/`byTeam` breakdowns are tracked, a user can look at a completed session and see, concretely, "the Verifier Team cost more than the Backend Team it was checking" — which is exactly the kind of signal that should inform per-team model configuration (Section 10.5) and verifier strictness (Section 13.4) going forward. This isn't just a vanity metric; it's meant to be actionable.

### 25.4 Telemetry (opt-in, off by default)

If a user explicitly opts in (`telemetry.enabled: true`, never defaulted on), anonymized, aggregate usage data (which tools are used most, typical team counts per plan, error rates by category — never prompt content, file contents, or anything that could identify the user's codebase) may be sent to help prioritize project development. The exact schema and destination for this is itself an open design question tracked in `ROADMAP.md`, not something this document asserts as already built or finalized.

---

## 26. Extensibility: Writing a New Provider

To add support for a new model API:

1. Create `src/providers/<provider-id>.ts` implementing the `Provider` interface (Section 5.1) in full: `listModels`, `complete`, `stream`, `validateConfig`.
2. Handle the translation between OpenAgent's `ModelMessage`/`ContentBlock`/`ToolDefinition` shapes and whatever shape the target API expects. This is almost always the bulk of the work — pay particular attention to tool-calling shape differences (e.g., how tool results are threaded back into the conversation) since this is where subtle bugs hide.
3. Register the provider in `src/providers/index.ts`.
4. Add the provider's expected environment variable name(s) and any provider-specific config fields to `src/config/schema.ts`.
5. Write tests (Section 29) covering at minimum: a successful non-streaming completion, a successful streaming completion, a tool-use round-trip, and a deliberately malformed/error response.
6. Add a row to the table in Section 5.4 and to `PROVIDERS.md`'s setup instructions.

A provider implementation should never need to modify anything outside `src/providers/` and its own registration line — if adding a provider requires touching the orchestration layer, the tool system, or the skill system, that's a sign the `Provider` interface itself is missing something and the fix belongs in Section 5.1, not in a one-off workaround in the new provider file.

---

## 27. Extensibility: Writing a New Tool

1. Create `src/core/tools/<tool-name>.ts` implementing the `Tool` interface (Section 7.1).
2. Write a clear, specific `description` in the `ToolDefinition` — this is what the model reads to decide when to use the tool, and vague descriptions produce models that either never use a useful tool or misuse it. Include example invocations in the description if the tool's parameters aren't self-evident.
3. Implement `requiresPermission` thoughtfully (Section 23) — default to `"ask"` for anything with side effects, `"none"` only for genuinely read-only operations.
4. Register the tool in the relevant tool catalogs (Section 7.3's role-based scoping) — decide deliberately which agent roles should have access, don't just add it everywhere by default.
5. Write tests covering normal execution, the permission-check path, and error cases (e.g., what happens if the tool is called with a path outside the sandbox, Section 23.4).

---

## 28. Extensibility: Writing a New Skill

Full authoring guidance lives in `SKILLS.md`; the short version:

1. Create a directory under `.agent/skills/<skill-name>/` (project) or `~/.openagent/skills/<skill-name>/` (global).
2. Write `SKILL.md` with `name` and `description` frontmatter (Section 8.1) — invest real effort in the `description`, since it's the only thing read during the cheap discovery phase (Section 8.4) and a poor description means the skill simply never gets loaded when it should.
3. Write the instruction body: concrete, specific, example-driven guidance, not vague principles the model already roughly knows.
4. Optionally add `scripts/`, `examples/`, `resources/` as needed, following the patterns documented in `SKILLS.md` (Basic Router, Reference, Few-shot, Tool Use, or All-in-One patterns).
5. Test it: run a real task that should trigger the skill, confirm it loads (visible in the session log, Section 25.1) and that the agent's behavior actually reflects the skill's guidance.
6. Because OpenAgent follows the open Agent Skills standard exactly, a well-written skill here is also usable, unmodified, in Claude Code, Cursor, OpenAI Codex, OpenCode, or Antigravity — and skills from those ecosystems work here too. Consider this when authoring: a skill written generically (not OpenAgent-specific in its instructions) is more broadly useful and easier for others to adopt.

---

## 29. Testing Strategy

### 29.1 Test pyramid

- **Unit tests** (majority of test count): individual tools, the skill loader/matcher, the plan parser/validator, config loading/validation, the provider translation logic in isolation (mocking the actual HTTP calls).
- **Integration tests**: a real `Agent.run()` loop against a mocked `Provider` that returns scripted tool-call sequences, verifying the loop's turn-limiting, tool-execution-and-feedback, and termination behavior (Section 6.1) without hitting a real API.
- **Orchestration tests**: Manager state machine transitions (Section 9.4), Team Lead decomposition-to-DAG-to-concurrent-execution behavior (Section 10.4), approval gate flows (Section 14), all driven by mocked Agents so these tests are fast and deterministic.
- **End-to-end tests** (smallest count, real API calls, run less frequently — e.g., only in a scheduled CI job, not on every PR, to control cost): a small number of real scenarios against a real provider (using the cheapest/fastest model available) confirming the whole pipeline actually works against a live API, not just against mocks that might drift from reality.

### 29.2 Mocking the Provider Layer for tests

Because every higher layer only ever talks to the `Provider` interface (Section 5.1), a `MockProvider` that implements that same interface and returns scripted `CompletionResponse`/`StreamEvent` sequences is sufficient to test the entire orchestration layer without any real API calls. This is one of the concrete payoffs of the Section 2.3 design principle — testability, not just multi-vendor support.

### 29.3 What must have test coverage before merging

Per `CONTRIBUTING.md`'s actual enforcement, but stated here as the underlying intent: any change to `src/core/agent.ts`, `src/core/tool-executor.ts`, `src/orchestration/*`, or `src/providers/provider.ts` (the interface itself) requires accompanying tests, because these are the files where a subtle bug doesn't just affect one feature — it affects every Agent, every Team, and every Provider built on top of them.

---

## 30. Glossary

| Term | Definition |
|---|---|
| Agent | The fundamental unit: conversation + tools + skills + model, running a loop until done. Section 4. |
| Approval Gate | A mandatory pause for explicit user approval/changes/rejection. Section 14. |
| Manager | The singleton orchestrating Agent for a session. Section 9. |
| Team | A Team Lead + Micro Agents scoped to one phase of work. Section 10. |
| Team Lead | The Agent heading a Team; plans and delegates, doesn't usually implement directly. Section 4, 10. |
| Micro Agent | The disposable, leaf-level executing Agent inside a Team. Section 11. |
| Provider | An adapter to a specific model API, implementing the shared `Provider` interface. Section 5. |
| Skill | A `SKILL.md`-based package of domain knowledge/scripts, following the open Agent Skills standard. Section 8. |
| plan.md | The Planning Team's structured output; the contract the rest of the session executes against. Section 12. |
| Verifier Team | The default, always-last team checking cumulative output against plan.md. Section 13. |
| Mention | `@team-name` syntax to address a specific team directly. Section 16. |
| Session | One continuous run against a project; persistable and resumable. Section 17. |
| Orchestrator | The top-level controller bridging the TUI and the Manager/Team/Micro-Agent hierarchy. Section 4. |
| Progressive disclosure | The principle that skill content is loaded into context only when relevant, not all upfront. Section 8.4. |
| Dynamic team | A non-default team type, defined per-session by the Planning Team rather than hard-coded. Section 15. |

## Appendix A: A Complete Worked Trace

This appendix walks one request through every layer described above, concretely, so a new contributor can see how Sections 3–17 connect in practice rather than only in the abstract.

**User input:** `"Build a REST API for a todo app with authentication"`

**Step 1 — Manager intake (Section 9.1, 3.3).** The Manager's `Agent.run()` loop receives the prompt. Its system prompt's classification guidance leads the model to recognize this touches data modeling, authentication, and multiple API routes — clearly substantial. It calls its `spawn_team("planning", { request: "..." })` pseudo-tool.

**Step 2 — Planning Team executes (Section 12).** A fresh `TeamInstance` is constructed: `type: "planning"`, a Team Lead `Agent` configured with the Planning system prompt template (`src/orchestration/prompts/planning-team.md`), read-only tools, and the model resolved per Section 5.5's precedence (here, no per-team override exists in config, so it falls back to `defaultModel`). The Planning Lead reads the existing project structure with `list_directory` and `glob`, determines there's no existing user/auth scaffolding, and produces `plan.md` matching the structure from Section 12.3 — in this case naming a Database Team and a Backend Team, in that order, plus the default Verifier.

**Step 3 — Plan validation (Section 12.3, 24.1).** `plan-validator.ts` checks the produced markdown against the required structure. It parses cleanly on the first attempt (no retry loop needed here).

**Step 4 — Approval gate #1 (Section 14).** The Orchestrator constructs an `ApprovalGate` with `phase: "plan"`, the TUI's `ApprovalPrompt` component renders `plan.md` via `PlanRenderer`, and the Manager's state machine (Section 9.4) sits in `AWAITING_PLAN_APPROVAL`. The user reviews it and presses `a` to approve. The gate's `resolution` is recorded and persisted to session state (Section 17.1).

**Step 5 — Manager sequences the Database Team (Section 9.1, 9.3).** Reading the now-approved `plan.md`, the Manager calls `spawn_team("database", scopedContext)`, where `scopedContext` is just the Database Team's section of the plan, not the whole document verbatim (Section 6.3's context-scoping principle).

**Step 6 — Database Team Lead decomposes (Section 10.3, 11.2).** The Lead produces two subtasks: "design and write the `users` table migration" and "design and write the `todos` table migration, with a foreign key to `users`." Its dependency DAG (Section 10.4) marks the second as depending on the first (it needs to know the `users` table's primary key shape). `team-executor.ts` spawns Micro Agent 1 immediately; Micro Agent 2 waits.

**Step 7 — Micro Agent 1 executes (Section 6, 7).** A fresh `Agent` instance, role `micro-agent`, is given the subtask, `write_file`/`read_file`/`bash` tool access, and runs its own independent loop: it inspects the project's existing migration conventions (`read_file` on an example migration if one exists, or `glob` for the migrations folder), writes the migration file, and may run a `bash` command to verify the migration applies cleanly against a local dev database — this `bash` call goes through the full permission pipeline (Section 23.1), surfaced to the user as a normal permission prompt (not an approval gate — those are reserved for phase-level results, Section 14.1) naming exactly which agent is asking and why.

**Step 8 — Micro Agent 1 reports, Micro Agent 2 is unblocked and spawns (Section 10.4, 11.1).** Once Micro Agent 1's `MicroAgentReport` comes back with `success: true`, `team-executor.ts` sees the DAG edge is satisfied and spawns Micro Agent 2, which now has the actual `users` table shape available as `relevantContext`.

**Step 9 — Database Team Lead integrates and reports (Section 10.3).** Both reports come back successful; the Lead constructs a `TeamResult` summarizing both migrations and returns it to the Manager. The `TeamInstance`'s live `Agent` objects (Lead and both Micro Agents) are discarded; only the `TeamResult` and a `TeamSummary` persist.

**Step 10 — Approval gate #2.** The user reviews a diff of the two new migration files and approves.

**Step 11 — Backend Team runs (same mechanism as Steps 5–9), depending on the Database Team's now-completed schema.** Suppose its Verifier-bound output accidentally omits a per-user ownership check on `/todos/:id`, as in the worked example in Section 13.2.

**Step 12 — Approval gate #3.** User approves the Backend Team's result (the omission isn't visible from a diff review alone — it's a behavioral gap, which is exactly why Verification is a separate, mandatory phase rather than something the human approval gate alone is expected to catch).

**Step 13 — Verifier Team runs (Section 13.2)** and produces the FAIL report shown in that section's example, with a specific recommended next step.

**Step 14 — Automatic re-route (Section 13.3).** Because this is the first verification cycle (`maxVerificationCycles: 3` not yet exhausted), the Manager automatically reactivates the Backend Team with the Verifier's feedback as additional context, without a separate approval gate for the re-route decision itself (the gate happens on the *result* of the next attempt, not on the decision to retry — retrying is the Manager's own established failure-handling responsibility, not a new judgment call requiring fresh human sign-off each time).

**Step 15 — Backend Team fixes the ownership check, reports again. Approval gate. Verifier re-runs, passes.**

**Step 16 — Manager produces final reporting (Section 9.1, step 6)**, summarizing the whole session in plain language, and the Manager's state machine returns to `IDLE`.

Every piece of state involved in this trace — the plan, every gate's resolution, every team's result, the full cost/token breakdown by agent and team — is sitting in the persisted `Session` object (Section 17.1) afterward, so the user (or a future contributor debugging a bug report) can reconstruct exactly what happened and why.

## Appendix B: Frequently Asked Design Questions

**Why not let Micro Agents spawn their own sub-agents?** Covered in Section 4.1 — three levels is a deliberate ceiling for context cost, debuggability, and conceptual legibility. If you find yourself wanting a fourth level for a specific feature, that's a sign the Team Lead's subtask decomposition is too coarse, not that the hierarchy needs to get deeper.

**Why is the Team Lead usually barred from writing code directly?** It's not an absolute rule (Section 7.3 explicitly allows configuring direct write access for small teams), but the default exists because mixing "the agent responsible for decomposing and integrating" with "the agent responsible for one specific implementation detail" tends to produce worse decomposition — the Lead starts reaching for "I'll just do it myself" instead of thinking clearly about how to split the work, which defeats the purpose of having Micro Agents at all.

**Why can't `afterPlanning` ever be set to `"never"`, when other approval gates can?** Section 14.4 — because the entire trust model of the system rests on the user having seen and approved the plan that everything downstream is held accountable to (Section 2.6). Removing every other gate still leaves that one accountability anchor; removing it too would mean the system could execute arbitrary multi-team work the user never reviewed in any form, which is a fundamentally different (and much riskier) product than the one this document specifies.

**Why does the Manager get its own narrow toolset instead of just being a Team Lead with elevated privileges?** Because the Manager's job is categorically different — it's coordinating phases of an entire session, not decomposing one phase's work into subtasks. Giving it broad write access would blur the line the whole hierarchy depends on (Section 4) and would make it tempting for the Manager to bypass the Team/Micro-Agent structure entirely for "quick" changes, undermining the planning/verification guarantees the rest of the architecture is built around.

**What stops a malicious or buggy skill from silently changing agent behavior in dangerous ways?** Section 8.5: project skills are trusted at the same level as the project's own code (since an attacker with repo write access already has stronger options), global/third-party skills are not auto-trusted to execute scripts, and the planned `skill audit` command exists specifically to let users vet a skill before installing it from an untrusted source. The `load_skill` tool only ever injects text into context, which a model can ignore — it cannot itself execute anything.

**Why JSON for config instead of YAML or TOML?** JSON is what `zod` validates most naturally without an extra parsing dependency, it's universally supported by every editor's tooling out of the box, and it avoids YAML's well-known footguns (implicit type coercion, whitespace sensitivity) in a file that's meant to be hand-edited and team-shared. This is a pragmatic choice, not a strong ideological one — if community feedback strongly favors an alternative, it's a reasonable thing to revisit, but it would need a real migration story for existing `.openagent/config.json` files, not just a unilateral switch.

---

*This document is maintained alongside the codebase. If you find a place where the implementation has diverged from what's described here, that divergence is itself a bug — either the code needs to change to match the spec, or this document needs a deliberate, reviewed update. It should never be the case that this file and the codebase quietly drift apart.*


