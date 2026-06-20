import * as fs from "fs";
import * as path from "path";
import { Tool, ToolExecutionContext, ToolResult, PermissionRequirement } from "./types.js";

export const ListDirectoryTool: Tool = {
  definition: {
    name: "list_directory",
    description: "Lists files and directories in a given path.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
      },
      required: [],
    },
  },
  requiresPermission(): PermissionRequirement {
    return { level: "none" };
  },
  async execute(input: Record<string, unknown>, ctx: ToolExecutionContext): Promise<ToolResult> {
    const inputPath = (input.path as string) || ctx.workingDirectory;

    const resolvedPath = path.resolve(ctx.workingDirectory, inputPath);
    if (!resolvedPath.startsWith(path.resolve(ctx.workingDirectory))) {
      return { resultText: "Access denied: path is outside working directory", isError: true };
    }

    try {
      const entries = fs.readdirSync(resolvedPath, { withFileTypes: true });
      const output = entries.map((entry) => {
        const type = entry.isDirectory() ? "dir" : "file";
        return `[${type}]\t${entry.name}`;
      });
      return { resultText: output.join("\n"), isError: false };
    } catch (error: any) {
      return { resultText: error.message || String(error), isError: true };
    }
  },
};
