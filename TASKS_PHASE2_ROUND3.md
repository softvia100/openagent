# Tasks: Phase 2, Round 3 — In-Ink Approval Prompt UI

Round 1 built the shell. Round 2 connected the real Agent with streaming. Both are verified working live. The one known gap: `ToolExecutor` (Task 1.4) still uses a `readline`-based stdin prompt for "ask"-level permissions, which conflicts with Ink's raw-mode keyboard capture — readline and Ink's `useInput` both try to own `stdin` at once. This round fixes that, replacing it with a real Ink-rendered approval prompt, so `bash`, `write_file` on existing files, and `edit_file` finally become safely usable through the actual UI.

Read `ARCHITECTURE.md` Section 23.1 (permission pipeline) and Section 23.2 (permission prompts surface up through the hierarchy) before starting.

**The key mechanism this round depends on:** Ink's `useInput` hook accepts an `isActive` option. When `false`, that hook stops capturing keystrokes entirely. This lets two input-handling components coexist in the tree — `InputBox` and a new `ApprovalPrompt` — as long as exactly one of them has `isActive: true` at any given moment. This round is fundamentally about getting that toggle correct.

---

## Task 2.10 — Decouple ToolExecutor from any direct UI mechanism

**File:** update `src/core/tool-executor.ts`

Currently (Task 1.4), `ToolExecutor` directly calls a `readline`-based prompt function when it hits an "ask"-level permission. That's the thing being replaced. Before building the new UI, decouple `ToolExecutor` from *any* specific prompting mechanism — it shouldn't know whether it's running under readline, Ink, or anything else.

```typescript
export type PermissionResolver = (request: {
  toolName: string;
  input: Record<string, unknown>;
  reason: string;
  agentId: string;
}) => Promise<"allow" | "deny">;
```

Change `ToolExecutor`'s constructor to accept a `PermissionResolver` function:

```typescript
constructor(
  private tools: Map<string, Tool>,
  private resolvePermission: PermissionResolver
) {}
```

Replace the internal readline call with `await this.resolvePermission({ toolName: call.name, input: call.input, reason: requirement.reason, agentId: agentConfig.id })`, and branch on its return value ("allow" / "deny") instead of the old y/n string parsing.

Update existing callers:
- `cli.tsx` — construct a temporary readline-based `PermissionResolver` for now (literally the old logic, just repackaged as a function matching this signature) so nothing breaks yet. This gets replaced in Task 2.13.
- `test/core/tool-executor.test.ts` — update the existing 5 tests to pass a mock `PermissionResolver` function instead of mocking readline directly. The mock can just be `vi.fn().mockResolvedValue("allow")` or `"deny"` depending on the test case. This should actually simplify those tests.

**Done when:** `npm run typecheck` passes AND `npx vitest run test/core/tool-executor.test.ts` shows the same 5 tests passing with the new mock pattern. The full suite (`npx vitest run`) should still show the existing total test count with nothing broken.

---

## Task 2.11 — ApprovalPrompt component

**File:** `src/ui/ApprovalPrompt.tsx`

Reference: `ARCHITECTURE.md` Section 23.2.

```typescript
export interface ApprovalPromptProps {
  toolName: string;
  input: Record<string, unknown>;
  reason: string;
  agentId: string;
  onDecision: (decision: "allow" | "deny") => void;
  isActive: boolean; // controls whether this component's useInput is listening
}
```

Render something like:

```
┌─ Permission Required ────────────────────────────────────┐
│ Agent: cli-agent                                           │
│ Tool: bash                                                  │
│ Reason: Run command: npm install left-pad                   │
│ Input: { "command": "npm install left-pad" }                 │
│                                                              │
│  [y] Allow   [n] Deny                                        │
└───────────────────────────────────────────────────────────┘
```

Use `useInput` with `{ isActive: props.isActive }` (per Ink's documented mechanism for letting multiple `useInput` hooks coexist without double-handling the same keystroke — this is exactly what prevents this component and `InputBox` from fighting over stdin). Handle:
- `y` → `onDecision("allow")`
- `n` → `onDecision("deny")`
- Ignore any other key

Pretty-print the `input` object with `JSON.stringify(input, null, 2)` if it's more than a couple fields, otherwise inline is fine — use your judgment for readability, this is a minor detail.

**Done when:** `npm run typecheck` passes. Don't manually test in isolation yet — Task 2.12 wires this into `App.tsx` where it can actually be exercised meaningfully.

---

## Task 2.12 — Wire ApprovalPrompt into App.tsx with exclusive input control

**File:** update `src/ui/App.tsx`

This is the task that makes the `isActive` toggle actually work correctly. Add state to `App`:

```typescript
const [pendingApproval, setPendingApproval] = useState<{
  toolName: string;
  input: Record<string, unknown>;
  reason: string;
  agentId: string;
  resolve: (decision: "allow" | "deny") => void;
} | null>(null);
```

`App` needs to own the `PermissionResolver` function and pass it down to wherever `ToolExecutor` gets constructed (likely meaning `cli.tsx` now needs to construct `ToolExecutor` *after* `App` mounts, or `App` needs to expose a resolver that `cli.tsx` passes in at construction time — pick whichever wiring is cleaner given how `Agent`/`ToolExecutor` are currently constructed in `cli.tsx`; document your choice).

The resolver itself, conceptually:

```typescript
const resolvePermission: PermissionResolver = (request) => {
  return new Promise((resolve) => {
    setPendingApproval({ ...request, resolve });
  });
};
```

In the render:

```tsx
<InputBox 
  onSubmit={handleSubmit} 
  disabled={disabled || pendingApproval !== null} 
/>
{pendingApproval && (
  <ApprovalPrompt
    toolName={pendingApproval.toolName}
    input={pendingApproval.input}
    reason={pendingApproval.reason}
    agentId={pendingApproval.agentId}
    isActive={true}
    onDecision={(decision) => {
      pendingApproval.resolve(decision);
      setPendingApproval(null);
    }}
  />
)}
```

Critical correctness point: `InputBox`'s own `useInput` must ALSO respect `isActive` (this likely means Task 2.3's `InputBox` needs a small retrofit — check if it already supports an `isActive`/`disabled`-driven `useInput` toggle, or if `disabled` currently just ignores keystrokes inside the handler rather than actually setting `isActive: false` on the hook itself. If it's the latter, fix it: `InputBox` should pass `useInput(handler, { isActive: !disabled })` so that when an approval prompt is showing, `InputBox`'s hook is fully inactive, not just ignoring input in its callback — the difference matters because Ink's `isActive` mechanism is specifically what's documented to prevent two active hooks from both processing the same keystroke).

**Done when (REAL MANUAL TEST):**

1. Run `npm run dev`
2. Ask something that will trigger a permission-requiring tool — e.g.: `create a file called test-output.txt with the content "hello from openagent"`
3. Confirm: the `InputBox` becomes non-interactive (typing does nothing) and the `ApprovalPrompt` appears showing the correct tool name, reason, and input
4. Press `y` — confirm the file gets created (check it exists on disk afterward) and the conversation continues, with the approval prompt disappearing and `InputBox` becoming interactive again
5. Run a similar request again, this time press `n` — confirm the tool is NOT executed (file not created/modified), the agent receives the denial and responds accordingly (it should explain it couldn't complete the action), and `InputBox` becomes interactive again afterward

This is the real test of the `isActive` exclusivity mechanism — if it's wrong, you'll likely see either: both components reacting to the same keypress, or the approval prompt not responding to y/n at all, or InputBox silently swallowing the y/n keystrokes instead of the approval prompt getting them.

---

## Task 2.13 — Remove the readline fallback entirely

**File:** update `src/cli.tsx`, delete the readline-based resolver

Now that `App`'s `resolvePermission` (Task 2.12) is the real mechanism, remove the temporary readline-based `PermissionResolver` from Task 2.10 entirely — there should be no readline import left anywhere in the codebase related to permission prompts. Wire `cli.tsx` to use `App`'s resolver as the only path.

If the wiring from Task 2.12 required restructuring how `ToolExecutor`/`Agent` get constructed relative to when `App` mounts, finalize that structure here cleanly — e.g., if `ToolExecutor` needs to be constructed inside `App` itself (via `useMemo` or similar) rather than in `cli.tsx` before `render()`, that's a reasonable resolution; just make sure `Agent`'s other dependencies (`Provider`, `AgentEventBus`) are still constructed sensibly and nothing is duplicated or recreated on every render.

**Done when:**
1. `npm run typecheck` passes
2. `grep -r "readline" src/` returns no results (or only an explanatory comment if some vestige is intentionally left — but the actual prompting mechanism must be gone)
3. Re-run Task 2.12's full manual test one more time against this final wiring, confirm it still works exactly as before

---

## What's intentionally NOT in this round

- No "always allow this session" tier — `ARCHITECTURE.md` Section 23.1 describes a `sessionAllowlist` mechanism for tools other than `bash`; that's a reasonable next increment but not required for Round 3's core goal (making approval gates *work* through the UI at all). Note it as a follow-up task if you want it, but it's not blocking.
- No team-scoped approval context ("Agent: cli-agent" is the only identity shown, since there's only one agent in the whole system until Phase 4). Once Teams/Micro Agents exist, this prompt will need to show which team/agent specifically is asking — that's Phase 4's concern layered on top of this same component.
- `bash`'s permission requirement is still always "ask," per `ARCHITECTURE.md` Section 23.3 — this round doesn't change that policy, it only changes how the "ask" is presented.

## After this round

Phase 2 is complete. All three rounds done: working terminal shell, real streaming Agent connection, real in-UI approval gates. The system is a genuinely complete, safe, usable single-agent coding CLI at this point — comparable in basic capability to early Claude Code, just without the orchestration layer (Manager/Teams/Micro Agents) that's still Phase 4's job, and without Skills (Phase 3).

Worth deciding at that point whether to tackle Phase 3 (Skills) or Phase 4 (Orchestration) next — they're independent of each other, so either order works. I'd lean toward Phase 4 first, since it's the actual differentiating feature of this whole project; Skills can layer on at any point afterward without disrupting what's built. But that's worth a real conversation when you get there, not a default assumption now.
