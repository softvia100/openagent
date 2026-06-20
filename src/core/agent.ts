import { Provider, ModelMessage, CompletionResponse, ContentBlock } from "../providers/provider.js";
import { ToolExecutor } from "./tool-executor.js";
import { Tool, ToolCallRecord, ToolExecutionContext } from "./tools/types.js";
import { AgentEventBus } from "./events.js";

export interface AgentConfig {
  id: string;
  role: "manager" | "team-lead" | "micro-agent";
  systemPrompt: string;
  model: { providerId: string; modelId: string };
  tools: Tool[];
  skills: never[]; // always empty array for Phase 1 — skills are Phase 3
  maxTurns?: number;
  maxTokensPerTurn?: number;
}

export interface AgentTurnResult {
  finalText: string;
  toolCallsExecuted: ToolCallRecord[];
  usage: { inputTokens: number; outputTokens: number };
  stopReason: CompletionResponse["stopReason"];
}

export class AgentTurnLimitExceededError extends Error {
  constructor(agentId: string, turns: number) {
    super(`Agent ${agentId} exceeded turn limit of ${turns} turns`);
    this.name = "AgentTurnLimitExceededError";
  }
}

export class Agent {
  constructor(
    private config: AgentConfig,
    private provider: Provider,
    private toolExecutor: ToolExecutor,
    private eventBus: AgentEventBus
  ) {}

  async run(input: string, conversationHistory: ModelMessage[]): Promise<AgentTurnResult> {
    const messages: ModelMessage[] = [
      ...conversationHistory,
      { role: "user", content: [{ type: "text", text: input }] },
    ];

    let turns = 0;
    const maxTurns = this.config.maxTurns ?? 50;
    const toolCallsExecuted: ToolCallRecord[] = [];
    const usage = { inputTokens: 0, outputTokens: 0 };
    const systemPrompt = this.buildSystemPrompt();
    const toolCtx = this.buildToolExecutionContext();

    while (turns < maxTurns) {
      turns++;

      const response = await this.provider.complete({
        model: this.config.model.modelId,
        systemPrompt,
        messages,
        tools: this.config.tools.map((t) => t.definition),
        maxTokens: this.config.maxTokensPerTurn ?? 4096,
      });

      usage.inputTokens += response.usage.inputTokens;
      usage.outputTokens += response.usage.outputTokens;

      this.eventBus.emit({
        type: "agent_response",
        agentId: this.config.id,
        response,
      });

      const result = await this.processTurnResponse(response, messages, toolCallsExecuted, usage, toolCtx);
      if (result) return result;
    }

    throw new AgentTurnLimitExceededError(this.config.id, turns);
  }

  async runStreaming(input: string, conversationHistory: ModelMessage[]): Promise<AgentTurnResult> {
    const messages: ModelMessage[] = [
      ...conversationHistory,
      { role: "user", content: [{ type: "text", text: input }] },
    ];

    let turns = 0;
    const maxTurns = this.config.maxTurns ?? 50;
    const toolCallsExecuted: ToolCallRecord[] = [];
    const usage = { inputTokens: 0, outputTokens: 0 };
    const systemPrompt = this.buildSystemPrompt();
    const toolCtx = this.buildToolExecutionContext();

    while (turns < maxTurns) {
      turns++;

      const stream = await this.provider.stream({
        model: this.config.model.modelId,
        systemPrompt,
        messages,
        tools: this.config.tools.map((t) => t.definition),
        maxTokens: this.config.maxTokensPerTurn ?? 4096,
      });

      let contentBlocks: ContentBlock[] = [];
      let activeText = "";
      let activeToolUse: { id: string; name: string; jsonStr: string } | null = null;

      for await (const event of stream) {
        const data = event.data as any;
        if (event.type === "text_delta") {
          activeText += data.text;
          this.eventBus.emit({ type: "text_delta", agentId: this.config.id, text: data.text });
        } else if (event.type === "tool_use_start") {
          if (activeText.length > 0) {
            contentBlocks.push({ type: "text", text: activeText });
            activeText = "";
          }
          activeToolUse = { id: data.id, name: data.name, jsonStr: "" };
        } else if (event.type === "tool_use_delta") {
          if (activeToolUse) {
            activeToolUse.jsonStr += data.partial_json;
          }
        } else if (event.type === "tool_use_end") {
          if (activeToolUse) {
            contentBlocks.push({
              type: "tool_use",
              id: activeToolUse.id,
              name: activeToolUse.name,
              input: JSON.parse(activeToolUse.jsonStr)
            });
            activeToolUse = null;
          }
        }
      }

      if (activeText.length > 0) {
        contentBlocks.push({ type: "text", text: activeText });
      }

      let stopReason: CompletionResponse["stopReason"] = "end_turn";
      if (contentBlocks.some(b => b.type === "tool_use")) {
        stopReason = "tool_use";
      }

      const response: CompletionResponse = {
        content: contentBlocks,
        stopReason,
        usage: { inputTokens: 0, outputTokens: 0 },
        raw: {}
      };

      this.eventBus.emit({
        type: "agent_response",
        agentId: this.config.id,
        response,
      });

      const result = await this.processTurnResponse(response, messages, toolCallsExecuted, usage, toolCtx);
      if (result) return result;
    }

    throw new AgentTurnLimitExceededError(this.config.id, turns);
  }

  private async processTurnResponse(
    response: CompletionResponse,
    messages: ModelMessage[],
    toolCallsExecuted: ToolCallRecord[],
    usage: { inputTokens: number; outputTokens: number },
    toolCtx: ToolExecutionContext
  ): Promise<AgentTurnResult | null> {
    messages.push({ role: "assistant", content: response.content });

    const toolUses = response.content.filter((b) => b.type === "tool_use");

    if (toolUses.length === 0 || response.stopReason !== "tool_use") {
      const finalText = response.content
        .filter((b): b is { type: "text"; text: string } => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      
      const result: AgentTurnResult = {
        finalText,
        toolCallsExecuted,
        usage,
        stopReason: response.stopReason,
      };
      
      this.eventBus.emit({
        type: "turn_complete",
        agentId: this.config.id,
        result,
      });
      
      return result;
    }

    const toolResults: ContentBlock[] = [];

    for (const callBlock of toolUses) {
      if (callBlock.type !== "tool_use") continue;
      
      const call = {
        id: callBlock.id,
        name: callBlock.name,
        input: callBlock.input as Record<string, unknown>,
      };

      this.eventBus.emit({
        type: "tool_call_start",
        agentId: this.config.id,
        toolName: call.name,
        input: call.input,
      });

      const record = await this.toolExecutor.execute(call, {
        id: toolCtx.agentId,
        role: toolCtx.agentRole,
        workingDirectory: toolCtx.workingDirectory,
        sessionId: toolCtx.sessionId,
      });

      this.eventBus.emit({
        type: "tool_call_end",
        agentId: this.config.id,
        record,
      });

      toolCallsExecuted.push(record);

      toolResults.push({
        type: "tool_result",
        toolUseId: record.callId,
        content: record.result.resultText,
        isError: record.result.isError,
      });
    }

    messages.push({ role: "tool", content: toolResults });
    return null;
  }

  private buildSystemPrompt(): string {
    // TODO(Phase 3): inject skill content here — ARCHITECTURE.md Section 8.4
    return this.config.systemPrompt;
  }

  private buildToolExecutionContext(): ToolExecutionContext {
    return {
      agentId: this.config.id,
      agentRole: this.config.role,
      workingDirectory: process.cwd(),
      sessionId: `${this.config.id}-session`,
    };
  }
}
