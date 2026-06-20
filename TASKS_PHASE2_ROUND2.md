# Tasks: Phase 2, Round 2 — Real Agent + Streaming

Round 1 is complete and verified: a working Ink terminal shell (status bar, transcript, input box) with a fake `setTimeout` echo standing in for the real model. This round rips out the fake echo and replaces it with the actual `Agent` class from Phase 1 — including live tool-call visibility and real token-by-token streaming, so responses appear word by word instead of all at once.

This round requires a real `ANTHROPIC_API_KEY` to test, at every step. There is no more mocking around it — you (the human) will need to manually verify every task in this round in a real terminal, same as Tasks 2.3–2.5 in Round 1.

Read `ARCHITECTURE.md` Section 19.4 (streaming and responsiveness) before starting.

---

## Task 2.6 — Add streaming support to AgentEventBus

**File:** update `src/core/events.ts`

Round 1's `AgentEventBus` (Task 1.6) only emitted whole-response events (`agent_response`, `tool_call_start`, `tool_call_end`, `turn_complete`). Streaming needs a finer-grained event for partial text as it arrives:

```typescript
export type AgentEvent =
  | { type: "agent_response"; agentId: string; response: CompletionResponse }
  | { type: "text_delta"; agentId: string; text: string }        // NEW
  | { type: "tool_call_start"; agentId: string; toolName: string; input: Record<string, unknown> }
  | { type: "tool_call_end"; agentId: string; record: ToolCallRecord }
  | { type: "turn_complete"; agentId: string; result: AgentTurnResult }
```

Add the `text_delta` variant. No other changes to this file are needed yet.

**Done when:** `npm run typecheck` passes. No behavior change yet — this just adds the type.

---

## Task 2.7 — Add a streaming run method to Agent

**File:** update `src/core/agent.ts`

The existing `Agent.run()` method (Task 1.6) uses `provider.complete()` — a single non-streaming call per turn. Add a new method that uses `provider.stream()` instead and emits `text_delta` events as tokens arrive, while preserving all the existing loop logic (tool execution, turn limits, etc.).

```typescript
async runStreaming(
  input: string, 
  conversationHistory: ModelMessage[]
): Promise<AgentTurnResult> {
  // Same overall loop structure as run(), but:
  // - call this.provider.stream() instead of this.provider.complete()
  // - as StreamEvents arrive, accumulate them into a full response 
  //   (same shape as what complete() would have returned)
  // - emit a "text_delta" AgentEvent for each text_delta StreamEvent, 
  //   so the UI can render text as it arrives
  // - once the stream ends (message_stop event), proceed with the 
  //   accumulated response exactly as run() does: check for tool_use 
  //   blocks, execute tools, continue the loop or return
}
```

Important implementation details:
- You'll need to accumulate `tool_use_start` / `tool_use_delta` (partial JSON) / `tool_use_end` StreamEvents into complete `tool_use` ContentBlocks — the partial JSON deltas need to be concatenated and parsed once `tool_use_end` arrives.
- Reuse as much logic as possible from `run()` — consider extracting the shared "process one complete turn's worth of content blocks" logic into a private helper both `run()` and `runStreaming()` call, rather than duplicating the tool-execution/turn-limit logic wholesale. This keeps the two methods from drifting out of sync.
- `run()` (non-streaming) must continue to work exactly as before — do not break Phase 1's tests.

**Tests:** add to `test/core/agent.test.ts`:

TEST — `runStreaming` emits text_delta events and produces the same final result shape as `run()`:
- Extend `MockProvider`'s `stream()` (Task 1.7) to yield a scripted sequence: a few `text_delta` events, then `message_stop`
- Call `runStreaming()`, subscribe to the event bus first
- Assert multiple `text_delta` events were emitted, in order, and concatenating their `text` fields equals the final `finalText`
- Assert the final `AgentTurnResult` shape matches what `run()` would have produced for an equivalent non-streaming response

TEST — `runStreaming` correctly handles a tool-use round trip via streaming:
- Script `MockProvider.stream()` to yield `tool_use_start` → `tool_use_delta` (with partial JSON chunks that need concatenating) → `tool_use_end` → `message_stop`, then a second stream call yielding `text_delta`s → `message_stop`
- Assert the tool was correctly executed with the fully-reconstructed input (not partial/corrupted JSON)
- Assert the final result reflects both turns correctly, same as the equivalent `run()` test from Task 1.6

**Done when:** `npm run typecheck` passes AND `npx vitest run` shows the existing Phase 1 test count (46) plus these new tests, all passing, with zero real API calls (tests still pass with `ANTHROPIC_API_KEY` unset).

---

## Task 2.8 — Wire the real Agent into App.tsx (replace the fake echo)

**File:** update `src/ui/App.tsx`, `src/cli.tsx`

This is the task that actually connects everything. `App` needs access to a real `Agent` instance instead of using `setTimeout`.

Change `AppProps` to accept the dependencies needed to construct an `Agent` per-message (or accept a pre-built `Agent` instance — your call, but document which):

```typescript
export interface AppProps {
  projectName: string;
  modelId: string;
  agent: Agent;          // the real Agent from Phase 1, already constructed
  eventBus: AgentEventBus; // so App can subscribe to live tool-call events
}
```

In `cli.tsx`, construct the real `Agent` (same construction as the old Task 1.10 logic — `AnthropicProvider`, `ToolExecutor` with `ALL_TOOLS`, `AgentEventBus`) and pass it into `App` as a prop, instead of the deleted code from Task 2.5. This effectively un-deletes the Phase 1 wiring, but now it feeds the UI instead of `console.log`.

In `App.tsx`, replace the `setTimeout` echo in `handleSubmit` with:

```typescript
async function handleSubmit(text: string) {
  setMessages(prev => [...prev, { id: crypto.randomUUID(), role: "user", text }]);
  setDisabled(true);
  
  try {
    // conversationHistory should be built from prior messages in 
    // `messages` state, converted to ModelMessage[] — for this task, 
    // a simple version is fine: map each prior user/assistant message 
    // to a ModelMessage with the appropriate role and a single text 
    // ContentBlock. Tool messages are an internal detail Round 2 
    // doesn't need to replay back into history.
    const history = buildConversationHistory(messages);
    const result = await props.agent.runStreaming(text, history);
    // Don't manually append the final text here — Task 2.9's event 
    // subscription handles live-updating an in-progress assistant 
    // message as text_delta events arrive. By the time runStreaming() 
    // resolves, the full text should already be visible from streaming.
  } catch (error) {
    setMessages(prev => [...prev, { 
      id: crypto.randomUUID(), 
      role: "assistant", 
      text: `Error: ${error instanceof Error ? error.message : String(error)}` 
    }]);
  } finally {
    setDisabled(false);
  }
}
```

Note this task references "Task 2.9's event subscription" for the live-updating text — implement Task 2.8 and 2.9 together, they're tightly coupled. Task 2.9 below is what actually makes streamed text appear incrementally rather than all at once at the end.

**Done when:** this compiles, but don't manually test yet — Task 2.9 needs to be done first for there to be any visible streaming behavior worth testing. If you want to sanity check now, runStreaming() resolving and the catch block firing correctly on a deliberately bad input (e.g., temporarily break the API key) is a reasonable partial check.

---

## Task 2.9 — Live-updating transcript during streaming

**File:** update `src/ui/App.tsx`, possibly `src/ui/Transcript.tsx`

This is what makes the UI actually show streaming. Subscribe to `eventBus` in `App` (via `useEffect`) and handle these events to update the transcript in real time:

- `text_delta` — append the incoming text to the CURRENT in-progress assistant message. If no in-progress assistant message exists yet for this turn, create one (empty `TranscriptMessage` with `role: "assistant"`) and start appending to it.
- `tool_call_start` — add a `role: "tool"` message to the transcript immediately (so the user sees "the agent is using a tool" in real time, not after the fact), text like `Running ${toolName}...`
- `tool_call_end` — update that same tool message's text to reflect completion: success → `${toolName} completed` (or show a brief result summary), error → `${toolName} failed: ${errorText}`. You'll need to track which `TranscriptMessage.id` corresponds to which in-flight tool call (e.g., a `Map<toolName, messageId>` in a ref, acknowledging this is a simplification that doesn't handle two concurrent calls to the SAME tool name — fine for Phase 2, Phase 4's real concurrent Micro Agents are a different, later concern).
- `turn_complete` — mark the current in-progress assistant message as finalized (no more appending expected); reset the "current in-progress message" tracking so the next turn starts a fresh message.

```typescript
useEffect(() => {
  function handleEvent(event: AgentEvent) {
    switch (event.type) {
      case "text_delta":
        // append to current in-progress assistant message
        break;
      case "tool_call_start":
        // insert a new tool message
        break;
      case "tool_call_end":
        // update that tool message
        break;
      case "turn_complete":
        // finalize current assistant message
        break;
    }
  }
  props.eventBus.on("agent_event", handleEvent);
  return () => { props.eventBus.off("agent_event", handleEvent); };
}, [props.eventBus]);
```

**Done when (REAL MANUAL TEST, requires your API key):**

1. Run `npm run dev`
2. Type: `what files are in the current directory, and what does package.json say this project is called?`
3. Press Enter
4. **Watch closely.** You should see, in this rough order:
   - Your message appears immediately
   - A tool message appears: `Running list_directory...` (or similar)
   - That tool message updates to show completion
   - Possibly another tool call for `read_file` on `package.json`, same start/complete pattern
   - An assistant message starts appearing and **grows token by token** — text should visibly stream in, not pop in all at once
   - The final answer correctly describes the files and the project name from `package.json`
5. Confirm the input box was disabled during all of this and re-enabled once the response fully completed

This is the real proof that Phase 1's Agent, Phase 1's tools, and Phase 2's UI are all correctly wired together end to end — this is also, finally, the live version of the original Phase 1 definition-of-done check from `GETTING_STARTED.md`, now running inside the real UI instead of plain stdout.

**Report back with what you actually observed, step by step** — not just "it worked," but whether the streaming was visibly incremental, whether tool calls showed up as separate visible steps, and whether the final answer was actually correct.

---

## What's intentionally NOT in this round

- No approval gate UI — `bash`/`write_file`/`edit_file` permission prompts still use the Task 1.4 readline stand-in, which will currently interrupt/conflict with the Ink render (readline's stdin prompt and Ink's raw-mode stdin capture will fight each other). This is a known, expected limitation of this round — Round 3 replaces the readline prompt with a proper in-Ink approval UI. **For this round, test only with prompts that don't trigger "ask"-level tools** (e.g., asking it to read files and describe them, not asking it to write/edit/run commands), to avoid hitting that conflict before Round 3 fixes it.
- No multi-team panes — there's only ever one Agent/one conversation at this stage. Team panes have nothing to render until Phase 4 (orchestration) exists.
- No session persistence — closing the app loses the conversation. That's Phase 4 territory (`ARCHITECTURE.md` Section 17).

## Round 3 preview (do not start yet)

Round 3 replaces Task 1.4's readline-based permission prompt with a real Ink-rendered approval UI (per `ARCHITECTURE.md` Section 23.2) — so `bash`, `write_file` on existing files, and `edit_file` calls show a proper in-terminal prompt instead of conflicting with Ink's input handling. That's what finally makes the full tool set safely usable through the real UI.
