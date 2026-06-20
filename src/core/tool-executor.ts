import { Tool, ToolCallRecord, ToolExecutionContext } from "./tools/types.js";

export type PermissionResolver = (request: {
  toolName: string;
  input: Record<string, unknown>;
  reason: string;
  agentId: string;
}) => Promise<"allow" | "deny">;

export class ToolExecutor {
  private tools: Map<string, Tool>;

  constructor(
    tools: Tool[],
    private resolvePermission: PermissionResolver
  ) {
    this.tools = new Map(tools.map((t) => [t.definition.name, t]));
  }

  async execute(
    call: { id: string; name: string; input: Record<string, unknown> },
    agentConfig: { id: string; role: string; workingDirectory: string; sessionId: string }
  ): Promise<ToolCallRecord> {
    const tool = this.tools.get(call.name);

    if (!tool) {
      return {
        callId: call.id,
        toolName: call.name,
        input: call.input,
        result: {
          resultText: `Tool not found: ${call.name}`,
          isError: true,
        },
        permissionDecision: "system-denied",
        executedAt: new Date().toISOString(),
      };
    }

    const requirement = tool.requiresPermission(call.input);
    
    let permissionDecision: ToolCallRecord["permissionDecision"] = "auto-allowed";
    let isError = false;
    let resultText = "";
    let shouldExecute = true;

    if (requirement.level === "deny") {
      permissionDecision = "system-denied";
      shouldExecute = false;
      isError = true;
      resultText = requirement.reason;
    } else if (requirement.level === "ask") {
      const decision = await this.resolvePermission({
        toolName: call.name,
        input: call.input,
        reason: requirement.reason,
        agentId: agentConfig.id,
      });

      if (decision === "allow") {
        permissionDecision = "user-allowed";
      } else {
        permissionDecision = "user-denied";
        shouldExecute = false;
        isError = true;
        resultText = `User denied permission for tool: ${call.name}`;
      }
    }

    let result = { resultText, isError };

    if (shouldExecute) {
      const ctx: ToolExecutionContext = {
        agentId: agentConfig.id,
        agentRole: agentConfig.role as ToolExecutionContext["agentRole"],
        workingDirectory: agentConfig.workingDirectory,
        sessionId: agentConfig.sessionId,
      };

      try {
        result = await tool.execute(call.input, ctx);
      } catch (error: any) {
        result = {
          resultText: error.message || String(error),
          isError: true,
        };
      }
    }

    return {
      callId: call.id,
      toolName: call.name,
      input: call.input,
      result,
      permissionDecision,
      executedAt: new Date().toISOString(),
    };
  }
}
