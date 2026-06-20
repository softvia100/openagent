# Glossary

A quick-reference list of every core term used across this repo's documentation. Every term here is defined in full, with diagrams and implementation detail, in [`ARCHITECTURE.md`](./ARCHITECTURE.md) — this file is a fast lookup, not a replacement for it. If a term is used inconsistently anywhere, that's a documentation bug; please open an issue.

### Manager
The single, persistent top-level agent for a session. Reads the user's initial prompt, always runs the **Planning Team** first (for substantial requests), owns `plan.md`, decides which **Team** runs next, enforces the approval gate between teams, and reports overall status back to the user. There is exactly one Manager per session. Full detail: `ARCHITECTURE.md` Section 9.

### Team
A task-scoped unit of work, e.g. "Frontend Team" or "Backend Team." Consists of one **Team Lead** and zero or more **Micro Agents**. `planning` and `verifier` are built-in and always run; everything else is dynamic, defined per-session by the Planning Team based on what the request actually needs. Full detail: `ARCHITECTURE.md` Section 10.

### Team Lead
The agent in charge of a Team. Receives its slice of `plan.md`, decomposes it into concrete subtasks, dispatches them to Micro Agents, integrates results, and reports completion back to the Manager. Plans and delegates rather than implementing directly, by default. Full detail: `ARCHITECTURE.md` Sections 10, 11.

### Micro Agent
A short-lived agent spawned by a Team Lead to execute exactly one concrete subtask. Has access to whatever tools and skills the subtask needs. Reports its result back and then terminates — it never persists across subtasks. Full detail: `ARCHITECTURE.md` Section 11.

### Skill
A directory (containing `SKILL.md` plus optional scripts/examples/resources) describing domain-specific instructions an agent can load on demand, following the open Agent Skills standard shared with Claude Code, Cursor, OpenAI Codex, OpenCode, and Google Antigravity. Attachable to any agent at any level, independent of which model that agent uses. Full detail: `ARCHITECTURE.md` Section 8, and the full authoring guide in [`SKILLS.md`](./SKILLS.md).

### Provider
An implementation of the shared `Provider` interface wrapping a specific model API (Anthropic, OpenAI, etc.) behind one stable shape. Any agent in the system can be independently configured to use any registered provider/model. Full detail: `ARCHITECTURE.md` Section 5, and setup instructions in [`PROVIDERS.md`](./PROVIDERS.md).

### Tool
A function an agent can call — `read_file`, `write_file`, `bash`, and so on. Provider-agnostic by construction. Full detail: `ARCHITECTURE.md` Section 7.

### plan.md
The structured artifact produced by the Planning Team at the start of a substantial session, describing what teams will run, in what order, and what each will do. Must be approved by the user before execution begins, and is kept updated (not frozen) as teams complete their work. Full detail: `ARCHITECTURE.md` Section 12.

### Approval Gate
The hard stop after every team completes (including Planning and Verification) where execution pauses for explicit user approval before proceeding. Full detail: `ARCHITECTURE.md` Section 14.

### Session
One end-to-end run: user prompt → (optionally) Planning → N teams → Verifier → done. Persistable and resumable. Full detail: `ARCHITECTURE.md` Section 17.
