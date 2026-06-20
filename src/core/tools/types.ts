import { ToolDefinition } from "../../providers/provider.js";

export interface Tool {
  definition: ToolDefinition;
  execute(input: Record<string, unknown>, ctx: ToolExecutionContext): Promise<ToolResult>;
  requiresPermission(input: Record<string, unknown>): PermissionRequirement;
}

export interface ToolExecutionContext {
  agentId: string;
  agentRole: "manager" | "team-lead" | "micro-agent";
  workingDirectory: string;
  sessionId: string;
}

export interface ToolResult {
  resultText: string;
  isError: boolean;
  metadata?: Record<string, unknown>;
}

export type PermissionRequirement =
  | { level: "none" }
  | { level: "ask"; reason: string }
  | { level: "deny"; reason: string };

export interface ToolCallRecord {
  callId: string;
  toolName: string;
  input: Record<string, unknown>;
  result: ToolResult;
  permissionDecision: "auto-allowed" | "user-allowed" | "user-denied" | "system-denied";
  executedAt: string; // ISO timestamp
}
