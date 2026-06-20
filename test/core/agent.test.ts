import { describe, it, expect, vi, beforeEach } from "vitest";
import { Agent, AgentConfig, AgentTurnLimitExceededError } from "../../src/core/agent.js";
import { AgentEventBus, AgentEvent } from "../../src/core/events.js";
import { ToolExecutor } from "../../src/core/tool-executor.js";
import { Provider, CompletionRequest, CompletionResponse, StreamEvent } from "../../src/providers/provider.js";

import { MockProvider } from "../mocks/mock-provider.js";

describe("Agent", () => {
  let provider: MockProvider;
  let eventBus: AgentEventBus;
  let config: AgentConfig;

  beforeEach(() => {
    provider = new MockProvider();
    eventBus = new AgentEventBus();
    config = {
      id: "agent-1",
      role: "micro-agent",
      systemPrompt: "You are a helpful assistant.",
      model: { providerId: "mock", modelId: "mock-model" },
      tools: [],
      skills: [],
    };
    vi.resetAllMocks();
  });

  const createMockToolExecutor = () => {
    return {
      execute: vi.fn().mockResolvedValue({
        callId: "c1",
        toolName: "read_file",
        input: { path: "x.ts" },
        result: { resultText: "file contents", isError: false },
        permissionDecision: "auto-allowed",
        executedAt: new Date().toISOString(),
      }),
    } as unknown as ToolExecutor;
  };

  it("TEST 1 — single turn, no tools", async () => {
    provider.queueResponse({
      content: [{ type: "text", text: "Hello!" }],
      stopReason: "end_turn",
      usage: { inputTokens: 5, outputTokens: 3 },
      raw: {},
    });

    const agent = new Agent(config, provider, createMockToolExecutor(), eventBus);
    const result = await agent.run("say hello", []);

    expect(result.finalText).toBe("Hello!");
    expect(result.toolCallsExecuted.length).toBe(0);
    expect(result.stopReason).toBe("end_turn");
    expect(result.usage.inputTokens).toBe(5);
  });

  it("TEST 2 — single tool call then completion", async () => {
    provider.queueResponse({
      content: [{ type: "tool_use", id: "c1", name: "read_file", input: { path: "x.ts" } }],
      stopReason: "tool_use",
      usage: { inputTokens: 10, outputTokens: 8 },
      raw: {},
    });
    provider.queueResponse({
      content: [{ type: "text", text: "Done" }],
      stopReason: "end_turn",
      usage: { inputTokens: 15, outputTokens: 4 },
      raw: {},
    });

    const agent = new Agent(config, provider, createMockToolExecutor(), eventBus);
    const result = await agent.run("do thing", []);

    expect(result.finalText).toBe("Done");
    expect(result.toolCallsExecuted.length).toBe(1);
    expect(result.usage.inputTokens).toBe(25);
    expect(result.stopReason).toBe("end_turn");
  });

  it("TEST 3 — turn limit exceeded throws", async () => {
    config.maxTurns = 2;
    for (let i = 0; i < 5; i++) {
      provider.queueResponse({
        content: [{ type: "tool_use", id: "c1", name: "read_file", input: { path: "x.ts" } }],
        stopReason: "tool_use",
        usage: { inputTokens: 1, outputTokens: 1 },
        raw: {},
      });
    }

    const agent = new Agent(config, provider, createMockToolExecutor(), eventBus);
    await expect(agent.run("loop", [])).rejects.toThrow(/Agent agent-1 exceeded turn limit of 2 turns/);
  });

  it("TEST 4 — events are emitted correctly", async () => {
    provider.queueResponse({
      content: [{ type: "text", text: "Hello!" }],
      stopReason: "end_turn",
      usage: { inputTokens: 5, outputTokens: 3 },
      raw: {},
    });

    const events: AgentEvent[] = [];
    eventBus.on("agent_event", (e) => events.push(e));

    const agent = new Agent(config, provider, createMockToolExecutor(), eventBus);
    await agent.run("say hello", []);

    const responseEvents = events.filter((e) => e.type === "agent_response");
    const turnEvents = events.filter((e) => e.type === "turn_complete");

    expect(responseEvents.length).toBeGreaterThanOrEqual(1);
    expect(turnEvents.length).toBeGreaterThanOrEqual(1);
    expect(events.length).toBe(2);
  });

  it("TEST 5 — conversation history is passed through", async () => {
    provider.queueResponse({
      content: [{ type: "text", text: "Hello!" }],
      stopReason: "end_turn",
      usage: { inputTokens: 5, outputTokens: 3 },
      raw: {},
    });

    const agent = new Agent(config, provider, createMockToolExecutor(), eventBus);
    const history = [{ role: "user" as const, content: [{ type: "text" as const, text: "prior message" }] }];
    await agent.run("new message", history);

    expect(provider.getCalls().length).toBe(1);
    const req = provider.getCalls()[0];
    
    expect(req.messages[0]).toEqual({ role: "user", content: [{ type: "text", text: "prior message" }] });
    expect(req.messages[1]).toEqual({ role: "user", content: [{ type: "text", text: "new message" }] });
  });
  it("TEST 6 — runStreaming emits text_delta events and matches run()", async () => {
    provider.queueResponse({
      content: [{ type: "text", text: "Hello from stream!" }],
      stopReason: "end_turn",
      usage: { inputTokens: 5, outputTokens: 3 },
      raw: {},
    });

    const events: AgentEvent[] = [];
    eventBus.on("agent_event", (e) => events.push(e));

    const agent = new Agent(config, provider, createMockToolExecutor(), eventBus);
    const result = await agent.runStreaming("say hello stream", []);

    const textDeltas = events.filter((e) => e.type === "text_delta") as Extract<AgentEvent, { type: "text_delta" }>[];
    expect(textDeltas.length).toBeGreaterThan(1);
    
    const combinedText = textDeltas.map(e => e.text).join("");
    expect(combinedText).toBe("Hello from stream!");

    expect(result.finalText).toBe("Hello from stream!");
    expect(result.stopReason).toBe("end_turn");
    expect(result.toolCallsExecuted.length).toBe(0);
  });

  it("TEST 7 — runStreaming correctly handles a tool-use round trip via streaming", async () => {
    provider.queueResponse({
      content: [{ type: "tool_use", id: "c1", name: "read_file", input: { path: "x.ts" } }],
      stopReason: "tool_use",
      usage: { inputTokens: 10, outputTokens: 8 },
      raw: {},
    });
    provider.queueResponse({
      content: [{ type: "text", text: "Stream Done" }],
      stopReason: "end_turn",
      usage: { inputTokens: 15, outputTokens: 4 },
      raw: {},
    });

    const events: AgentEvent[] = [];
    eventBus.on("agent_event", (e) => events.push(e));

    const agent = new Agent(config, provider, createMockToolExecutor(), eventBus);
    const result = await agent.runStreaming("do stream thing", []);

    expect(result.finalText).toBe("Stream Done");
    expect(result.toolCallsExecuted.length).toBe(1);
    expect(result.stopReason).toBe("end_turn");
    
    // ensure the tool was executed properly with reconstructed input
    expect(result.toolCallsExecuted[0].input).toEqual({ path: "x.ts" });
  });
});
