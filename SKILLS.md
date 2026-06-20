# Skills in OpenAgent

OpenAgent uses the open **Agent Skills** standard — the same `SKILL.md`-based format used by Claude Code, Cursor, OpenAI Codex, OpenCode, and Google Antigravity. This is a deliberate compatibility decision: a skill you already have for any of those tools works in OpenAgent with zero changes, and any skill you write for OpenAgent works in them too. This document is the practical authoring guide. For how skills integrate with OpenAgent's specific multi-agent architecture (per-team attachment, progressive loading, security model), see `ARCHITECTURE.md` Section 8 — this file focuses on "how do I write one," that one focuses on "how does the system use it."

## What a skill is

A skill is a folder of instructions (and optionally scripts/examples/resources) that gets handed to an agent when it's working on something the skill is relevant to. Think of it as a colleague's onboarding notes for a specific kind of task — "here's how we do error handling on this API," "here's our migration checklist," "here's the house style for our React components."

## Minimal skill

```
my-skill/
└── SKILL.md
```

```markdown
---
name: rest-api-error-handling
description: Standardizes error responses across REST API endpoints using this project's error envelope format. Use when implementing or reviewing API route handlers.
---

# REST API Error Handling

All error responses from API route handlers must use this envelope:

\`\`\`json
{ "error": { "code": "string", "message": "string", "details": {} } }
\`\`\`

Map errors as follows:
- Validation failures → 400, code "VALIDATION_ERROR"
- Missing/invalid auth → 401, code "UNAUTHORIZED"
- Authenticated but forbidden → 403, code "FORBIDDEN"
- Resource not found → 404, code "NOT_FOUND"
- Anything unexpected → 500, code "INTERNAL_ERROR", and log the original error server-side; never leak internal error messages to the client at 500.
```

That's a complete, valid skill. Most useful skills are this simple.

## The `description` field is the most important thing you write

When an agent considers whether a skill is relevant, it does **not** read the whole file up front — it only sees the `name` and `description` of every available skill, cheaply, as part of its system prompt (this is the "progressive disclosure" principle: full content loads on demand, not always). If your `description` is vague, the skill will either never trigger when it should, or trigger constantly and waste context when it shouldn't.

**Weak:** `"Helps with APIs."`
**Strong:** `"Standardizes error responses across REST API endpoints using this project's error envelope format. Use when implementing or reviewing API route handlers."`

The strong version tells the model both *what* the skill covers and *when* to reach for it — both halves matter.

## Folder structure (full version)

```
my-skill/
├── SKILL.md          # required
├── scripts/           # optional — executable helpers
│   └── validate.sh
├── examples/          # optional — reference implementations, few-shot examples
│   └── good-handler.ts
└── resources/         # optional — templates, static assets
    └── error-codes.json
```

`SKILL.md` can reference these — "see `examples/good-handler.ts` for a complete reference implementation" — and the agent will read them with its normal file tools once it has decided the skill is relevant and loaded it.

## Authoring patterns

These aren't enforced by the system, but they're common, proven shapes worth following:

**Quick Reference** — a short skill that's essentially a lookup table or checklist (status codes, naming conventions, a short decision tree). Good for things an agent needs to get *exactly* right but that don't require much explanation.

**Reference Pattern** — `SKILL.md` gives the overview and points to `resources/` for the detailed spec (e.g., a full OpenAPI schema, a design system's token list). Keeps the main file scannable while making deep detail available on demand.

**Few-shot / Examples Pattern** — `SKILL.md` is mostly "here's the pattern" plus 2-3 worked examples in `examples/`, useful when the convention is easier to show than to describe in prose (a specific test structure, a specific component shape).

**Tool Use Pattern** — the skill bundles an actual script in `scripts/` that the agent is expected to invoke (e.g., a validation script, a codegen script) rather than reimplementing that logic itself from a description. Good for anything where determinism matters more than the model's own reasoning (e.g., "run this exact linter config," not "write code that's probably lint-clean").

**All-in-one** — for genuinely small, self-contained conventions, just `SKILL.md` with no subfolders, as in the minimal example above. Don't add folder structure you don't need.

## Where skills live

| Scope | Path | Use for |
|---|---|---|
| Project | `.agent/skills/<name>/` | Conventions specific to this codebase, committed and shared with your team |
| Global | `~/.openagent/skills/<name>/` | Your personal toolbox, available in every project |

If a project skill and a global skill share a name, the project one wins — same convention used across the rest of the Agent Skills ecosystem, so behavior is consistent regardless of which compatible tool you're running.

OpenAgent also checks a few other conventional locations (`.claude/skills/`, `.cursor/skills/`, configurable via `skills.additionalSearchPaths` in `.openagent/config.json`) so a project that's already set up for another compatible tool doesn't need duplicate skill folders.

## Attaching skills to specific teams or agents

This is the part that's specific to OpenAgent's multi-agent structure (full detail in `ARCHITECTURE.md` Section 8.3): a skill doesn't have to be globally available. You can scope it:

```json
{
  "teams": {
    "backend": { "skills": ["database-migration-safety", "rest-api-error-handling"] },
    "frontend": { "skills": ["react-component-conventions"] }
  }
}
```

This means your Backend Team and Frontend Team can each have exactly the domain knowledge relevant to them, regardless of which model each team is configured to use — skill attachment and model assignment are independent settings.

## Cross-tool compatibility in practice

Because OpenAgent reads the standard format as-is:

- A skill folder you already use with Claude Code can be copied straight into `.agent/skills/` and OpenAgent will pick it up with no edits.
- Public community skill repositories (collections of ready-made `SKILL.md` folders for common tasks) are usable directly — clone or copy the folder, drop it in, done.
- A skill you write carefully for OpenAgent, written in a tool-agnostic way (not referencing OpenAgent-specific concepts unless genuinely necessary), is equally usable by your team if some of them use a different compatible tool.

## Security notes

Skills can include scripts, and scripts can do real things (network calls, file writes, anything a shell can do). OpenAgent's stance:

- Project-scoped skills (`.agent/skills/`) are trusted the same way the rest of your repo's code is trusted — if someone has write access to plant a malicious skill there, they already have much more direct ways to cause harm.
- Global, third-party-sourced skills are **not** auto-trusted to execute scripts. Running anything from `scripts/` goes through the same permission-prompt pipeline as a direct shell command — you'll see exactly what's about to run and from which skill.
- Before installing a skill from an untrusted source, prefer reading `SKILL.md` and any `scripts/` yourself first. A planned `openagent skill audit <name>` command will eventually do an automated static scan for risky patterns, but manual review is always a good habit regardless.

## Quick checklist before you publish a skill

- Does the `description` clearly say both what it covers and when to use it?
- Is the instruction body specific and example-driven, not vague principles the model already knows?
- If it references `examples/` or `resources/`, do those files actually exist and match what's described?
- If it includes scripts, are they something you'd be comfortable having reviewed line-by-line by someone installing your skill?
- Have you actually run a real task that should trigger it and confirmed it loads and the agent's behavior reflects it?
