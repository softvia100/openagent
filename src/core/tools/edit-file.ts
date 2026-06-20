import * as fs from "fs";
import * as path from "path";
import { Tool, ToolExecutionContext, ToolResult, PermissionRequirement } from "./types.js";

export const EditFileTool: Tool = {
  definition: {
    name: "edit_file",
    description: "Replaces a specific string in a file with a new string.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        old_str: { type: "string" },
        new_str: { type: "string" },
      },
      required: ["path", "old_str", "new_str"],
    },
  },
  requiresPermission(input: Record<string, unknown>): PermissionRequirement {
    return { level: "ask", reason: `Editing file: ${input.path}` };
  },
  async execute(input: Record<string, unknown>, ctx: ToolExecutionContext): Promise<ToolResult> {
    const inputPath = input.path as string;
    const oldStr = input.old_str as string;
    const newStr = input.new_str as string;

    const resolvedPath = path.resolve(ctx.workingDirectory, inputPath);
    if (!resolvedPath.startsWith(path.resolve(ctx.workingDirectory))) {
      return { resultText: "Access denied: path is outside working directory", isError: true };
    }

    try {
      const content = fs.readFileSync(resolvedPath, "utf-8");
      const occurrences = content.split(oldStr).length - 1;

      if (occurrences === 0) {
        return { resultText: "old_str not found in file", isError: true };
      }
      if (occurrences > 1) {
        return { resultText: `old_str is ambiguous — appears ${occurrences} times. Make it more specific.`, isError: true };
      }

      const newContent = content.replace(oldStr, newStr);
      fs.writeFileSync(resolvedPath, newContent, "utf-8");
      return { resultText: `Edited ${inputPath}: replaced 1 occurrence`, isError: false };
    } catch (error: any) {
      return { resultText: error.message || String(error), isError: true };
    }
  },
};
