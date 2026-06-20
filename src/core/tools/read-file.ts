import * as fs from "fs";
import * as path from "path";
import { Tool, ToolExecutionContext, ToolResult, PermissionRequirement } from "./types.js";

export const ReadFileTool: Tool = {
  definition: {
    name: "read_file",
    description: "Reads the contents of a file. Supports line ranges.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        start_line: { type: "number" },
        end_line: { type: "number" },
      },
      required: ["path"],
    },
  },
  requiresPermission(): PermissionRequirement {
    return { level: "none" };
  },
  async execute(input: Record<string, unknown>, ctx: ToolExecutionContext): Promise<ToolResult> {
    const inputPath = input.path as string;
    const startLine = input.start_line as number | undefined;
    const endLine = input.end_line as number | undefined;

    const resolvedPath = path.resolve(ctx.workingDirectory, inputPath);
    if (!resolvedPath.startsWith(path.resolve(ctx.workingDirectory))) {
      return { resultText: "Access denied: path is outside working directory", isError: true };
    }

    try {
      const content = fs.readFileSync(resolvedPath, "utf-8");
      let lines = content.split("\n");

      if (startLine !== undefined || endLine !== undefined) {
        const start = startLine !== undefined ? Math.max(1, startLine) : 1;
        const end = endLine !== undefined ? Math.min(lines.length, endLine) : lines.length;
        lines = lines.slice(start - 1, end);
      }

      if (lines.length > 2000) {
        const truncatedCount = lines.length - 2000;
        lines = lines.slice(0, 2000);
        lines.push(`\n[... ${truncatedCount} lines truncated — use line range params to read further]`);
      }

      return { resultText: lines.join("\n"), isError: false };
    } catch (error: any) {
      return { resultText: error.message || String(error), isError: true };
    }
  },
};
