import { glob } from "glob";
import * as path from "path";
import { Tool, ToolExecutionContext, ToolResult, PermissionRequirement } from "./types.js";

export const GlobTool: Tool = {
  definition: {
    name: "glob",
    description: "Finds files matching a glob pattern.",
    inputSchema: {
      type: "object",
      properties: {
        pattern: { type: "string" },
        cwd: { type: "string" },
      },
      required: ["pattern"],
    },
  },
  requiresPermission(): PermissionRequirement {
    return { level: "none" };
  },
  async execute(input: Record<string, unknown>, ctx: ToolExecutionContext): Promise<ToolResult> {
    const pattern = input.pattern as string;
    let cwd = (input.cwd as string) || ctx.workingDirectory;

    const resolvedCwd = path.resolve(ctx.workingDirectory, cwd);
    if (!resolvedCwd.startsWith(path.resolve(ctx.workingDirectory))) {
      cwd = ctx.workingDirectory; // Ignore if escaping sandbox
    } else {
      cwd = resolvedCwd;
    }

    try {
      const matches = await glob(pattern, { cwd, absolute: true });
      if (matches.length === 0) {
        return { resultText: `No files matched: ${pattern}`, isError: false };
      }
      return { resultText: matches.join("\n"), isError: false };
    } catch (error: any) {
      return { resultText: error.message || String(error), isError: true };
    }
  },
};
