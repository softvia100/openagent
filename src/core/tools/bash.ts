import { exec } from "child_process";
import { Tool, ToolExecutionContext, ToolResult, PermissionRequirement } from "./types.js";

export const BashTool: Tool = {
  definition: {
    name: "bash",
    description: "Executes a shell command.",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string" },
        timeout_ms: { type: "number" },
      },
      required: ["command"],
    },
  },
  requiresPermission(input: Record<string, unknown>): PermissionRequirement {
    const command = input.command as string;
    return { level: "ask", reason: `Run command: ${command}` };
  },
  async execute(input: Record<string, unknown>, ctx: ToolExecutionContext): Promise<ToolResult> {
    const command = input.command as string;
    const timeout_ms = (input.timeout_ms as number) || 30000;

    return new Promise((resolve) => {
      let resultText = "";
      let isError = false;

      const child = exec(command, { cwd: ctx.workingDirectory, timeout: timeout_ms }, (error, stdout, stderr) => {
        resultText += stdout;
        if (stderr) {
          resultText += (resultText.length > 0 ? "\n" : "") + stderr;
        }

        let lines = resultText.split("\n");
        if (lines.length > 2000) {
          const truncatedCount = lines.length - 2000;
          lines = lines.slice(0, 2000);
          lines.push(`\n[... ${truncatedCount} lines truncated — use line range params to read further]`);
        }
        resultText = lines.join("\n");

        if (error) {
          isError = true;
          if (error.killed) {
            resultText += `\n\nCommand timed out after ${timeout_ms}ms`;
          } else {
            resultText += `\n\nCommand failed with exit code: ${error.code}`;
          }
        }

        resolve({ resultText: resultText.trim(), isError });
      });
    });
  },
};
