import { describe, it, expect, vi, beforeEach } from "vitest";
import { AnthropicProvider } from "../../src/providers/anthropic.js";
import Anthropic from "@anthropic-ai/sdk";

vi.mock("@anthropic-ai/sdk");

describe("AnthropicProvider", () => {
  let provider: AnthropicProvider;
  let mockCreate: any;

  beforeEach(() => {
    vi.resetAllMocks();
    
    // Ensure an API key is set so the provider doesn't throw on instantiation/getClient()
    process.env.ANTHROPIC_API_KEY = "test-key";
    
    mockCreate = vi.fn();
    
    // Mock the Anthropic constructor to return our mocked methods
    (Anthropic as any).mockImplementation(function(this: any) {
      return {
        messages: {
          create: mockCreate
        }
      };
    });
    
    provider = new AnthropicProvider();
  });

  it("TEST 1 — complete() maps a text response correctly", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: "Hello" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 10, output_tokens: 5 }
    });

    const response = await provider.complete({
      model: "claude-haiku-4-5",
      systemPrompt: "You are a helpful assistant.",
      messages: [{ role: "user", content: [{ type: "text", text: "Say hello" }] }],
      tools: [],
      maxTokens: 100,
    });

    expect(response.stopReason).toBe("end_turn");
    expect(response.content).toHaveLength(1);
    expect(response.content[0]).toEqual({ type: "text", text: "Hello" });
    expect(response.usage.inputTokens).toBe(10);
    expect(response.usage.outputTokens).toBe(5);
  });

  it("TEST 2 — complete() maps a tool_use response correctly", async () => {
    mockCreate.mockResolvedValue({
      content: [{ 
        type: "tool_use", 
        id: "tool_123", 
        name: "get_time", 
        input: {}
      }],
      stop_reason: "tool_use",
      usage: { input_tokens: 20, output_tokens: 15 }
    });

    const response = await provider.complete({
      model: "claude-haiku-4-5",
      systemPrompt: "You are a helpful assistant.",
      messages: [{ role: "user", content: [{ type: "text", text: "What time is it?" }] }],
      tools: [{
        name: "get_time",
        description: "returns current time",
        inputSchema: { type: "object", properties: {}, required: [] }
      }],
      maxTokens: 500,
    });

    expect(response.stopReason).toBe("tool_use");
    expect(response.content).toHaveLength(1);
    expect(response.content[0]).toEqual({
      type: "tool_use",
      id: "tool_123",
      name: "get_time",
      input: {}
    });
    expect(response.usage.inputTokens).toBe(20);
    expect(response.usage.outputTokens).toBe(15);
  });

  it("TEST 3 — validateConfig behaves correctly", async () => {
    const originalKey = process.env.ANTHROPIC_API_KEY;
    
    process.env.ANTHROPIC_API_KEY = "";
    const invalidResult = await provider.validateConfig();
    expect(invalidResult.valid).toBe(false);
    expect(invalidResult.message).toContain("ANTHROPIC_API_KEY");

    process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";
    const validResult = await provider.validateConfig();
    expect(validResult.valid).toBe(true);

    process.env.ANTHROPIC_API_KEY = originalKey; // restore
  });

  it("MISSING TEST 3 — tool_result boundary translation", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: "OK" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 10, output_tokens: 5 }
    });

    await provider.complete({
      model: "claude-haiku-4-5",
      systemPrompt: "You are a helpful assistant.",
      messages: [
        { role: "user", content: [{ type: "text", text: "What time?" }] },
        { role: "assistant", content: [{ type: "tool_use", id: "tool_123", name: "get_time", input: {} }] },
        { role: "tool", content: [{ type: "tool_result", toolUseId: "tool_123", content: "14:32:00" }] }
      ],
      tools: [],
      maxTokens: 100,
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const callArgs = mockCreate.mock.calls[0][0];
    const messages = callArgs.messages;
    
    // The last message should be the tool_result, translated to user role
    const lastMessage = messages[messages.length - 1];
    expect(lastMessage.role).toBe("user");
    expect(lastMessage.content[0]).toHaveProperty("tool_use_id", "tool_123");
    expect(lastMessage.content[0]).not.toHaveProperty("toolUseId");
  });

  it("MISSING TEST 4 — system role in messages array throws", async () => {
    await expect(provider.complete({
      model: "claude-haiku-4-5",
      systemPrompt: "You are a helpful assistant.",
      messages: [
        { role: "system", content: [{ type: "text", text: "Sneaky system prompt" }] as any }
      ],
      tools: [],
      maxTokens: 100,
    })).rejects.toThrow("System messages must not appear in the messages array");
  });
});
