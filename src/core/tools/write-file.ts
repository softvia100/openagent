import * as fs from "fs";
import * as path from "path";
import { Tool, ToolExecutionContext, ToolResult, PermissionRequirement } from "./types.js";

export const WriteFileTool: Tool = {
  definition: {
    name: "write_file",
    description: "Writes content to a file, creating parent directories if needed.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        content: { type: "string" },
      },
      required: ["path", "content"],
    },
  },
  requiresPermission(input: Record<string, unknown>): PermissionRequirement {
    const inputPath = input.path as string;
    if (fs.existsSync(inputPath)) {
      return { level: "ask", reason: `Overwriting existing file: ${inputPath}` };
    }
    return { level: "none" };
  },
  async execute(input: Record<string, unknown>, ctx: ToolExecutionContext): Promise<ToolResult> {
    const inputPath = input.path as string;
    const content = input.content as string;

    const resolvedPath = path.resolve(ctx.workingDirectory, inputPath);
    if (!resolvedPath.startsWith(path.resolve(ctx.workingDirectory))) {
      return { resultText: "Access denied: path is outside working directory", isError: true };
    }

    try {
      fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
      fs.writeFileSync(resolvedPath, content, "utf-8");
      return { resultText: `File written: ${inputPath}`, isError: false };
    } catch (error: any) {
      return { resultText: error.message || String(error), isError: true };
    }
  },
};
