import { EventEmitter } from "events";
import { CompletionResponse } from "../providers/provider.js";
import { ToolCallRecord } from "./tools/types.js";
import { AgentTurnResult } from "./agent.js";

export type AgentEvent =
  | { type: "agent_response"; agentId: string; response: CompletionResponse }
  | { type: "text_delta"; agentId: string; text: string }
  | { type: "tool_call_start"; agentId: string; toolName: string; input: Record<string, unknown> }
  | { type: "tool_call_end"; agentId: string; record: ToolCallRecord }
  | { type: "turn_complete"; agentId: string; result: AgentTurnResult };

export class AgentEventBus extends EventEmitter {
  emit(event: AgentEvent): boolean;
  emit(eventName: string | symbol, ...args: any[]): boolean;
  emit(eventOrName: AgentEvent | string | symbol, ...args: any[]): boolean {
    if (typeof eventOrName === "object" && eventOrName !== null && "type" in eventOrName) {
      return super.emit("agent_event", eventOrName);
    }
    return super.emit(eventOrName, ...args);
  }

  on(event: "agent_event", listener: (e: AgentEvent) => void): this;
  on(eventName: string | symbol, listener: (...args: any[]) => void): this;
  on(eventName: string | symbol, listener: (...args: any[]) => void): this {
    return super.on(eventName, listener);
  }
}
