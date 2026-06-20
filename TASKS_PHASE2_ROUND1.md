# Tasks: Phase 2, Round 1 — Basic Ink Shell

Phase 1 is complete: a working single-agent CLI with plain stdout/stderr output (`src/cli.tsx`). This round replaces that with a real Ink-rendered terminal interface — layout, status bar, message history, input box — but **without** streaming or approval gates yet. Those are Round 2 and Round 3. Get this round fully working first; Ink has real rendering quirks (re-render thrashing, focus handling, terminal resize) that are much easier to debug in a simple static-ish UI than once streaming text is also in motion.

Per `ARCHITECTURE.md` Section 19, read that section in full before starting.

---

## Task 2.1 — Ink app shell and layout

**Files:** `src/ui/App.tsx`, `src/ui/StatusBar.tsx`

Reference: `ARCHITECTURE.md` Section 19.2 (layout), 19.3 (component structure).

Build the static layout frame, no live data wired in yet:

```
┌─────────────────────────────────────────────────┐
│ OpenAgent · <project-name> · <model-id>            │  ← StatusBar
├─────────────────────────────────────────────────┤
│                                                       │
│  (message history renders here — empty for now)      │
│                                                       │
├─────────────────────────────────────────────────┤
│ > _                                                   │  ← input placeholder
└─────────────────────────────────────────────────┘
```

`StatusBar.tsx` props: `{ projectName: string; modelId: string }`. Renders a single line, styled distinctly (background color or bold) so it's visually separated from content below it. Use Ink's `Box` and `Text` components — no external CSS, Ink uses flexbox-style props (`flexDirection`, `borderStyle`, etc.) directly.

`App.tsx` is the root component. For this task, it just renders `StatusBar` + a placeholder `Box` with a border where the message list will go + a placeholder input line. Hard-code `projectName` and `modelId` as props for now — wiring them from real config is Task 2.4.

**Done when:** `npx tsx src/ui/dev-preview.tsx` (a small throwaway script that calls Ink's `render(<App projectName="test" modelId="claude-haiku-4-5" />)`) shows the layout above in a real terminal, with the status bar visually distinct from the body. No interactivity required yet.

---

## Task 2.2 — Message list component

**File:** `src/ui/Transcript.tsx`

Reference: `ARCHITECTURE.md` Section 19.3.

```typescript
export interface TranscriptMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  text: string;
  toolName?: string; // present only when role === "tool"
}

export interface TranscriptProps {
  messages: TranscriptMessage[];
}
```

Render rules:
- `role: "user"` → prefix with `>` , render in a distinct color (e.g., cyan)
- `role: "assistant"` → prefix with `●`, render in default/white
- `role: "tool"` → prefix with `[tool: <toolName>]`, render dimmed/gray, indented one level

Each message gets vertical spacing (one blank line) between entries so the transcript doesn't look cramped. This component is a pure function of its `messages` prop — no internal state, no side effects. It receives data, it renders data.

**Done when:** a Storybook-less manual test — render `<Transcript messages={[...fakeData]} />` with a few of each role type in `dev-preview.tsx`, confirm visually that user/assistant/tool messages are styled distinctly and readable.

---

## Task 2.3 — Input box with submission

**File:** `src/ui/InputBox.tsx`

Reference: `ARCHITECTURE.md` Section 19.3, 19.5 (keyboard interaction — only the `Enter` row applies to this task, ignore the rest for now).

```typescript
export interface InputBoxProps {
  onSubmit: (text: string) => void;
  disabled?: boolean; // true while the agent is processing — input is shown but not editable
}
```

Use Ink's `useInput` hook (from the `ink` package) to capture keystrokes: printable characters append to a local `useState` string, `Backspace`/`Delete` removes the last character, `Enter` calls `onSubmit(currentText)` and clears the input. When `disabled` is true, ignore all input and render the prompt dimmed with a "..." or similar indicator instead of a cursor.

**Done when:** in `dev-preview.tsx`, wire `InputBox` with an `onSubmit` that just `console.error`s the submitted text (Ink renders to stdout, so use stderr for this debug output to avoid corrupting the Ink render). Type a message, press Enter, confirm the callback fires with the correct text and the input clears.

---

## Task 2.4 — Wire the shell into a working (non-agent-connected) app

**File:** update `src/ui/App.tsx`

Combine 2.1–2.3 into a real, stateful App:

```typescript
export interface AppProps {
  projectName: string;
  modelId: string;
}

export function App({ projectName, modelId }: AppProps) {
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  
  function handleSubmit(text: string) {
    setMessages(prev => [...prev, { 
      id: crypto.randomUUID(), 
      role: "user", 
      text 
    }]);
    // No agent wiring yet — Round 2 connects this to the real Agent.
    // For this task, just echo back a fake assistant response after 
    // a short delay so the loop is visibly testable:
    setTimeout(() => {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: "assistant",
        text: `(echo) You said: ${text}`
      }]);
    }, 300);
  }

  return (
    <Box flexDirection="column">
      <StatusBar projectName={projectName} modelId={modelId} />
      <Transcript messages={messages} />
      <InputBox onSubmit={handleSubmit} />
    </Box>
  );
}
```

This fake-echo behavior is intentionally temporary — it exists so the full render → input → state-update → re-render cycle can be verified end to end before real agent wiring (which adds async complexity) is introduced in Round 2.

**Done when:** running the app, you can type multiple messages in a row, see each appear in the transcript as a user message, followed ~300ms later by an echoed assistant message, with the input box correctly clearing and accepting new input after each submission. No crashes, no visual glitches on repeated submissions.

---

## Task 2.5 — Replace cli.tsx's entry point with the Ink render

**File:** update `src/cli.tsx`

This is the one task in this round that touches the real CLI entry point. Replace the plain console.log-based flow from Task 1.10 with:

```typescript
import { render } from "ink";
import { App } from "./ui/App.js";
// ... existing config/credential loading logic from Task 1.10 stays,
// but instead of running the Agent directly and console.logging,
// pass the resolved projectName/modelId into the Ink App:

render(<App projectName={path.basename(process.cwd())} modelId={config.defaultModel.modelId} />);
```

Keep all of Task 1.10's config-loading and credential-validation logic — run it *before* calling `render()`, and if it fails (missing key, invalid config), print the error with plain `console.error` and `process.exit(1)` exactly as before, since you can't render a useful Ink app without valid config anyway. Only call `render()` once those checks pass.

The real Agent is NOT wired into the App yet in this task — `App` still uses Task 2.4's fake echo. Round 2 connects it for real.

**Done when:** running `npm run dev -- "anything"` launches the full Ink shell (status bar showing your real project name and configured model, working input box, working transcript) instead of the old plain-text output. The fake echo behavior from 2.4 is what you'll see when you type — that's expected and correct for this round.

---

## What's intentionally NOT in this round

- No streaming — text appears all at once (the fake echo), not token by token. That's Round 2.
- No real Agent connection — typing doesn't call the actual model yet. That's also Round 2.
- No approval gates, no tool-call panes, no team panes. That's Round 3 and beyond (orchestration doesn't exist until Phase 4 anyway, so team panes specifically have nothing real to render until then).
- No keyboard shortcuts beyond Enter (Tab, Ctrl+E, etc. from Section 19.5) — those attach to features that don't exist yet (multiple panes, approval prompts).

## Round 2 preview (do not start yet)

Once this round is verified working, Round 2 replaces Task 2.4's fake `setTimeout` echo with a real connection to the `Agent` class from Phase 1 — including wiring `AgentEventBus` events into live-updating Transcript entries (so tool calls appear as they happen, not after the fact) and real token-by-token streaming via the Provider's `stream()` method. That's a meaningfully bigger jump in complexity, which is exactly why it's worth confirming this round is rock solid first.
