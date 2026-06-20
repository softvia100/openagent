# Tasks: Phase 3, Round 2 — Skill Attachment and Progressive Loading

Round 1 built parsing and discovery: `discoverSkills()` finds and validates `SKILL.md` files from project and global scope, with correct project-wins-on-collision behavior. Verified live with a real hand-written skill.

This round connects that to actual Agent behavior — the part that matters. Per `ARCHITECTURE.md` Section 8.4, skills must NOT be fully loaded into context upfront. Only cheap `name`+`description` metadata goes into the system prompt; the model decides when something looks relevant and requests the full content via a `load_skill` tool call. This round builds that whole pipeline and proves, with a real test skill and a real model, that it actually changes the agent's behavior.

Read `ARCHITECTURE.md` Section 8.3 (per-agent skill attachment) and 8.4 (progressive disclosure) in full before starting.

---

## Task 3.5 — Skill attachment resolution (Phase 3 subset)

**File:** `src/skills/attachment.ts`

`ARCHITECTURE.md` Section 8.3 describes scoping skills to manager/team/agent levels — but Teams and Micro Agents don't exist until Phase 4. For Phase 3, there's effectively only one agent role active (the CLI's single agent), so implement the simplest correct subset now, structured so it extends cleanly later rather than needing a rewrite in Phase 4.

```typescript
export interface SkillAttachment {
  skillName: string;
  scope: { level: "global" } | { level: "agent"; agentId: string };
  // NOTE: "manager" and "team" scope levels exist in ARCHITECTURE.md 
  // Section 8.3 but are not implementable until Phase 4 — do not 
  // stub them out with fake behavior, just omit them from this 
  // union for now and add them when Teams exist.
}

export function resolveAttachedSkills(
  allSkills: Skill[],
  attachments: SkillAttachment[],
  agentId: string
): Skill[]
```

Logic: a skill is attached to a given `agentId` if there's an attachment with `{ level: "global" }` (applies to everyone) OR `{ level: "agent", agentId }` matching this specific agent. Look up each attachment's `skillName` against `allSkills` (the full discovered list from Round 1) — if a referenced skill name doesn't exist in `allSkills`, skip it silently but log a `console.warn` (a config referencing a skill that doesn't exist shouldn't crash the agent, just means that attachment does nothing).

For Phase 3, the CLI doesn't have a config-driven attachment list yet — for now, **default to attaching ALL discovered skills at `{ level: "global" }`** when no explicit attachment config exists. This is a reasonable Phase 3 default (single agent, no teams to differentiate between) and should be implemented as: `cli.tsx` builds a default attachment list of `allSkills.map(s => ({ skillName: s.name, scope: { level: "global" } }))` if no explicit attachment config is found. Note this default behavior clearly in a comment, since Phase 4 will likely change it once per-team attachment config (`ARCHITECTURE.md` Section 10.5) becomes real.

**Tests:** `test/skills/attachment.test.ts`

- Global-scoped attachment applies to any agentId
- Agent-scoped attachment only applies to the matching agentId, not others
- A skill name in attachments that doesn't exist in allSkills is skipped, with a warning logged (spy on console.warn)
- Empty attachments list returns empty result

**Done when:** `npm run typecheck` passes AND `npx vitest run test/skills/attachment.test.ts` shows all tests passing.

---

## Task 3.6 — System prompt composition with skill metadata

**File:** `src/skills/prompt.ts`

```typescript
export function composeSystemPrompt(basePrompt: string, attachedSkills: Skill[]): string
```

If `attachedSkills` is empty, return `basePrompt` unchanged — no need to add an empty section.

Otherwise, append a clearly delimited section listing only `name` + `description` for each skill (never the full `instructions` body — that's the entire point of progressive disclosure, loading full content here would defeat Round 2's purpose):

```
<basePrompt>

## Available Skills

You have access to the following skills. If a skill's description 
suggests it's relevant to the current task, use the load_skill tool 
to read its full instructions before proceeding. Do not load a skill 
that isn't relevant to what you're currently doing.

- test-skill: A short description of when this skill applies.
- another-skill: Another description.
```

Now go back to `src/core/agent.ts` (from Task 1.6) and replace the placeholder `buildSystemPrompt()` method — the one that currently just returns `this.config.systemPrompt` directly with a `// TODO(Phase 3)` comment — to actually call `composeSystemPrompt(this.config.systemPrompt, this.config.skills)`.

This means `AgentConfig.skills` (currently typed as `never[]` per Task 1.6's Phase 1 stub) needs to become `Skill[]` for real now. Update the type in `agent.ts` accordingly, and update `cli.tsx`'s `Agent` construction to pass the resolved attached skills (from Task 3.5) instead of an empty array.

**Tests:** add to `test/skills/prompt.test.ts` (new file) and update `test/core/agent.test.ts`:

`prompt.test.ts`:
- Empty skills list returns basePrompt unchanged (exact string equality)
- One skill produces a correctly formatted section with its name and description
- Multiple skills all appear, each on their own line
- The skill's `instructions` field never appears anywhere in the output (this is the critical assertion — write a skill fixture with a long, distinctive `instructions` body and assert that exact text does NOT appear in `composeSystemPrompt`'s output)

`agent.test.ts` — add one test:
- Construct an `Agent` with a non-empty `skills` array, spy on `provider.complete()`'s calls, run it, and assert the `systemPrompt` field of the captured request contains the skill's name and description (proving `buildSystemPrompt()` is actually wired up, not just present as dead code)

**Done when:** `npm run typecheck` passes AND `npx vitest run` shows the full suite passing (existing count + new tests), confirming nothing in Phase 1/2 broke from changing `AgentConfig.skills`'s type.

---

## Task 3.7 — The `load_skill` tool

**File:** `src/core/tools/load-skill.ts`

Reference: `ARCHITECTURE.md` Section 8.4, point 3-4 — this is implemented as a normal `Tool`, not special-cased outside the tool system (per Section 2.2's composition principle).

```typescript
inputSchema: { skill_name: string }
requiresPermission: always "none" (reading skill content is not a 
  side-effecting action — it's equivalent to reading a file, which 
  is also "none")
```

This tool needs access to the full discovered+attached skill list to look up by name — which means it can't be a fully static, parameterless tool the way `read_file` is. Construct it as a factory function rather than a bare object:

```typescript
export function createLoadSkillTool(availableSkills: Skill[]): Tool {
  return {
    definition: {
      name: "load_skill",
      description: "Load the full instructions for a specific skill by name, when its description suggests it's relevant to your current task.",
      inputSchema: {
        type: "object",
        properties: { skill_name: { type: "string" } },
        required: ["skill_name"],
      },
    },
    requiresPermission: () => ({ level: "none" }),
    async execute(input, ctx) {
      const skillName = input.skill_name as string;
      const skill = availableSkills.find(s => s.name === skillName);
      if (!skill) {
        return {
          resultText: `No skill found with name "${skillName}". Available skills: ${availableSkills.map(s => s.name).join(", ") || "(none)"}`,
          isError: true,
        };
      }
      return {
        resultText: skill.instructions,
        isError: false,
        metadata: { skillName: skill.name, scope: skill.scope },
      };
    },
  };
}
```

Wire this into `cli.tsx`: after resolving attached skills (Task 3.5), construct `createLoadSkillTool(attachedSkills)` and add it to the tool list passed into `ToolExecutor`/`Agent` alongside `ALL_TOOLS` from Phase 1.

**Tests:** `test/core/tools/load-skill.test.ts`

- Loading an existing skill by name returns its `instructions` as `resultText`, `isError: false`
- Loading a nonexistent skill name returns `isError: true` with a message listing available skill names
- `requiresPermission` always returns `{ level: "none" }` regardless of input

**Done when:** `npm run typecheck` passes AND `npx vitest run test/core/tools/load-skill.test.ts` shows all tests passing.

---

## Task 3.8 — Real end-to-end verification with a genuine test skill

This is the task that actually proves the whole round works — not just that the pieces compile, but that a real model, given a real skill, actually changes its behavior because of it. No new files; this is a manual verification task using everything built in 3.5–3.7.

**Setup (do this yourself or have Antigravity create the file, either is fine since it's just content, not logic):**

Create `.agent/skills/pirate-mode/SKILL.md` in your real project:

```markdown
---
name: pirate-mode
description: Use this skill whenever the user asks you to introduce yourself, say hello, or explain who you are. It changes your tone of voice.
---

# Pirate Mode

When this skill is relevant, respond in the speaking style of a 
stereotypical pirate — "ahoy," "matey," "arr," etc. — while still 
being genuinely helpful and answering the user's actual question. 
Do not break character within a response where this skill applies, 
but only apply it when the skill's description says to.
```

This is deliberately silly and deliberately unmistakable — if the agent's response style visibly changes, you know for certain the skill loaded and was followed. A subtle, realistic skill (like the error-handling example in `SKILLS.md`) would make it much harder to tell whether a change in output was due to the skill or just normal model variance. Once this round is proven working with the obvious test, delete `pirate-mode` and feel free to write a real, useful skill for your actual project.

**Test procedure:**

1. Run `npm run dev` (with `GOOGLE_API_KEY` set, as established in Phase 2)
2. Ask: `hi, who are you?`
3. **Expected:** the response should be in pirate-speak, because the skill's description matches this exact scenario and the model should choose to call `load_skill` with `skill_name: "pirate-mode"` before responding
4. Watch for a `[tool: load_skill]` line appearing in the transcript before the final response — this is the visible proof the model actually invoked the tool, not just coincidentally sounding piratical
5. Ask something completely unrelated: `what is 2+2?`
6. **Expected:** a normal, non-pirate response — confirming the model is actually using the skill's description to decide relevance, not applying it to every single message regardless of context

**If the model doesn't pick it up:** this is useful signal, not necessarily a bug. Check, in order:
- Is `composeSystemPrompt`'s skill section actually appearing in what gets sent to the provider? (Add a temporary debug `console.error(systemPrompt)` in `agent.ts` if needed, just to confirm, then remove it)
- Is `load_skill` actually in the tool list passed to the Agent?
- Try rephrasing the request more explicitly ("introduce yourself") if `gemini-2.5-flash` specifically isn't picking up on the skill's relevance from "hi, who are you?" — smaller/faster models can be less reliable at this kind of judgment call than larger ones, which is itself a real, useful thing to learn about model selection for this role

**Done when:** you've personally observed the pirate-mode response for the relevant prompt, the load_skill tool call visible in the transcript, AND the normal non-pirate response for the unrelated prompt. Report back exactly what you saw for both prompts.

---

## What's intentionally NOT in this round

- No per-team skill scoping — there are no Teams yet. The "attach everything globally" default from Task 3.5 is a deliberate, temporary simplification.
- No skill security/audit tooling (`ARCHITECTURE.md` Section 8.5) — skills in this round are pure-text, no `scripts/` execution wired in yet. Reading a skill's instructions is no riskier than reading any file, which is why `load_skill` correctly has `requiresPermission: "none"`.
- No cross-tool skill path compatibility (`.claude/skills/`, etc.) — still deferred from Round 1's decision.

## After this round

Phase 3 is complete once Round 2 is verified. The system now has working skills, fully interoperable with the broader Agent Skills ecosystem (any `SKILL.md` written for Claude Code or similar tools will work here unmodified, since the format itself hasn't been altered). Combined with Phase 2's TUI and Phase 1's core loop, this is a genuinely complete single-agent coding assistant with a real extensibility mechanism.

What's left for the "big vision" — the Manager, Teams, Micro Agents, plan.md, approval gates between phases — is entirely Phase 4, and it's the largest remaining phase by a wide margin. Worth a real planning conversation before diving in, given its size; it likely deserves its own multi-round breakdown the way Phase 2 did, possibly more rounds given the scope described in `ARCHITECTURE.md` Sections 9-16.
