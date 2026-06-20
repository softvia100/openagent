# Tasks: Phase 3, Round 1 — SKILL.md Parsing and Discovery

Phase 2 is complete: a working Ink TUI with real streaming Agent responses (verified via Gemini) and real in-UI approval gates for permission-requiring tools. This phase adds the Skill system — `ARCHITECTURE.md` Section 8.

Round 1 builds parsing and discovery only: reading `SKILL.md` files, validating their structure, and finding them on disk in the right scopes. Nothing in this round changes Agent behavior yet — that's Round 2 (matching/loading) and Round 3 (a real end-to-end test skill). Get parsing and discovery rock solid first, since every later round depends on it being correct.

Read `ARCHITECTURE.md` Section 8.1 (anatomy of a skill) and 8.2 (scopes) before starting. Also skim `SKILLS.md` for the authoring conventions — Round 1's parser needs to handle real-world skill files, not just an idealized example.

---

## Task 3.1 — Skill types

**File:** `src/skills/types.ts`

```typescript
export interface SkillFrontmatter {
  name: string;
  description: string;
}

export interface Skill {
  name: string;
  description: string;
  /** Full markdown body, everything after the frontmatter closing --- */
  instructions: string;
  /** Absolute path to the skill's directory (the one containing SKILL.md) */
  dirPath: string;
  /** Absolute path to SKILL.md itself */
  skillMdPath: string;
  scope: "project" | "global";
  /** True if scripts/, examples/, or resources/ subdirectories exist */
  hasScripts: boolean;
  hasExamples: boolean;
  hasResources: boolean;
}

export class SkillParseError extends Error {
  constructor(public skillMdPath: string, reason: string) {
    super(`Failed to parse ${skillMdPath}: ${reason}`);
  }
}
```

**Done when:** `npm run typecheck` passes. No implementation yet, just types.

---

## Task 3.2 — SKILL.md parser

**File:** `src/skills/parser.ts`

```typescript
export function parseSkillMd(filePath: string, fileContent: string, scope: "project" | "global"): Skill
```

Implementation requirements:

1. **Frontmatter extraction.** A valid `SKILL.md` starts with `---`, then YAML frontmatter, then a closing `---`, then the markdown body. Use the `yaml` npm package to parse the frontmatter block (install it — do not hand-roll a YAML parser).

2. **Validation, throwing `SkillParseError` with a specific reason for each case:**
   - File doesn't start with `---` → `"missing frontmatter (file must start with ---)"`
   - No closing `---` found → `"frontmatter not closed (missing second ---)"`
   - YAML parse failure → `"invalid YAML in frontmatter: <underlying error message>"`
   - `name` field missing or not a non-empty string → `"frontmatter is missing required field 'name'"`
   - `description` field missing or not a non-empty string → `"frontmatter is missing required field 'description'"`
   - `name` containing characters other than lowercase letters, numbers, and hyphens → `"name must contain only lowercase letters, numbers, and hyphens, got: '<actual value>'"`
     (this constraint matters because `name` is used to build lookup keys and directory-matching logic later — keep it filesystem- and identifier-safe)

3. **On success**, return a `Skill` object:
   - `name`, `description` from frontmatter
   - `instructions` = everything after the closing `---`, trimmed of leading/trailing whitespace
   - `dirPath` = the directory containing the given `filePath`
   - `skillMdPath` = `filePath` itself
   - `scope` = the passed-in scope
   - `hasScripts`/`hasExamples`/`hasResources` = check via `fs.existsSync` whether `scripts/`, `examples/`, `resources/` subdirectories exist relative to `dirPath`

**Tests:** `test/skills/parser.test.ts`

Write tests covering:
- Valid minimal skill (frontmatter + body, no subdirectories) parses correctly, all fields correct
- Valid skill with all three subdirectories present sets all three `has*` flags true
- Missing opening `---` throws `SkillParseError` with the correct message
- Missing closing `---` throws with the correct message
- Invalid YAML throws with the correct message
- Missing `name` throws with the correct message
- Missing `description` throws with the correct message
- `name` with invalid characters (e.g., `"My Skill!"`, `"my_skill"` with underscore, `"MySkill"` with capitals) throws with the correct message
- Valid `name` with hyphens and numbers (e.g., `"api-error-handling-v2"`) parses successfully

For the filesystem-dependent tests (subdirectory detection), either use a real temp directory (created and cleaned up in test setup/teardown via `fs.mkdtempSync`) or mock `fs.existsSync` — your choice, but be consistent and document which approach you used.

**Done when:** `npm run typecheck` passes AND `npx vitest run test/skills/parser.test.ts` shows all tests passing.

---

## Task 3.3 — Skill discovery (filesystem scanning)

**File:** `src/skills/loader.ts`

```typescript
export function discoverSkills(projectRoot: string): Skill[]
```

Implementation:

1. **Project scope:** scan `<projectRoot>/.agent/skills/*/SKILL.md` — for each subdirectory of `.agent/skills/` that contains a `SKILL.md` file, parse it with `scope: "project"`. If `.agent/skills/` doesn't exist at all, that's not an error — just return no project skills (most projects won't have any, especially early on).

2. **Global scope:** scan `~/.openagent/skills/*/SKILL.md` the same way, with `scope: "global"`. Use `os.homedir()` to resolve `~`. Same non-error handling if the directory doesn't exist.

3. **Per-skill parse failures should not crash discovery entirely.** If one skill's `SKILL.md` fails to parse (per Task 3.2's `SkillParseError`), log a warning (e.g., `console.warn`) naming the specific skill directory and the reason, and skip that skill — continue discovering the rest. A single malformed skill folder should never prevent the agent from starting up or from using every other valid skill.

4. **Name collision resolution (project wins over global):** per `ARCHITECTURE.md` Section 8.2, if a project skill and a global skill share the same `name`, the project skill takes precedence. Implement this as: discover both lists, then merge them into a single list where, for any name collision, the project-scoped one is kept and the global-scoped one is dropped (with a `console.warn` noting the shadowing, e.g., `"Global skill 'foo' is shadowed by a project skill with the same name"`).

5. Return the final merged, deduplicated list.

**Tests:** `test/skills/loader.test.ts`

Use a real temp directory structure (via `fs.mkdtempSync`) rather than mocking the filesystem for this task — discovery is inherently a filesystem-walking operation, and a real temp directory makes the tests much more trustworthy than deeply mocking `fs.readdirSync`/`fs.existsSync` chains.

Write tests covering:
- No `.agent/skills/` directory at all → returns empty project skills, no crash
- One valid project skill → discovered correctly with `scope: "project"`
- Multiple valid project skills → all discovered
- A malformed skill alongside valid ones → valid ones still discovered, malformed one skipped with a warning (you can spy on `console.warn` to confirm it was called, without asserting the exact message text too strictly)
- Project skill and global skill with the same `name` → only the project one appears in the final result, and a shadowing warning was logged
- Global skill discovery works the same way project discovery does (you'll need to mock `os.homedir()` to point at your temp directory for this test)

**Done when:** `npm run typecheck` passes AND `npx vitest run test/skills/loader.test.ts` shows all tests passing.

---

## Task 3.4 — `openagent skill list` CLI command (minimal)

**File:** update `src/cli.tsx`, or create `src/commands/skill-list.ts` if you prefer separating CLI subcommands into their own files (reasonable either way — pick based on how much subcommand structure already exists in `cli.tsx` from Phase 1/2, which was a single-purpose entry point so far)

Per `ARCHITECTURE.md` Section 20.2, add a basic `openagent skill list` subcommand. For Phase 3 Round 1, this can be simple — detect if `process.argv[2] === "skill"` and `process.argv[3] === "list"`, and if so, run `discoverSkills(process.cwd())` and print each one in a simple format, then exit — bypassing the Ink UI entirely for this command (it's a quick informational command, not an interactive session):

```
Discovered skills:

  rest-api-error-handling [project]
    Standardizes error responses across REST API endpoints...

  react-component-conventions [global]
    React component structure and naming conventions...

No skills found. (if the list is empty)
```

**Done when (REAL MANUAL TEST):**

1. Create a test skill by hand: `.agent/skills/test-skill/SKILL.md` in your actual project, with valid frontmatter (`name: test-skill`, a `description`) and a short body
2. Run `npx tsx src/cli.tsx skill list` (or however the command ends up invoked) in your real terminal
3. Confirm your test skill shows up correctly with the right name, scope, and description
4. Delete that test skill folder afterward (or keep it — your call, it's a harmless real skill you could actually build on, see Round 3) and confirm `skill list` correctly reports no project skills

This is a real, simple, low-risk way to manually prove discovery actually works against the real filesystem, not just temp-directory tests.

---

## What's intentionally NOT in this round

- No connection to the Agent or system prompts yet — `discoverSkills()` exists and works, but nothing reads its output to influence agent behavior. That's Round 2.
- No `load_skill` tool, no progressive disclosure mechanism. Round 2.
- No cross-tool path compatibility (`.claude/skills/`, `.cursor/skills/`) — per your direction, this round only implements OpenAgent's own two scopes. Worth a follow-up task later, noted in `ROADMAP.md`, but not blocking.
- No skill script execution or the security/audit concerns from Section 8.5 — those matter once skills can actually do something beyond providing text, which isn't yet the case until scripts are actually invoked (a later concern, likely Phase 6 territory per the original `ROADMAP.md`).

## Round 2 preview (do not start yet)

Round 2 connects discovery to the Agent: per-agent skill attachment (`ARCHITECTURE.md` Section 8.3), injecting the cheap name+description metadata into the system prompt, and implementing the `load_skill` tool so an agent can request full skill content on demand — the actual progressive-disclosure mechanism described in Section 8.4.
