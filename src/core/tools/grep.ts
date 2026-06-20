import * as fs from "fs";
import * as path from "path";
import { glob } from "glob";
import { Tool, ToolExecutionContext, ToolResult, PermissionRequirement } from "./types.js";

export const GrepTool: Tool = {
  definition: {
    name: "grep",
    description: "Searches files for lines matching a pattern (regex).",
    inputSchema: {
      type: "object",
      properties: {
        pattern: { type: "string" },
        path: { type: "string" },
        recursive: { type: "boolean" },
      },
      required: ["pattern"],
    },
  },
  requiresPermission(): PermissionRequirement {
    return { level: "none" };
  },
  async execute(input: Record<string, unknown>, ctx: ToolExecutionContext): Promise<ToolResult> {
    const patternStr = input.pattern as string;
    const inputPath = (input.path as string) || ctx.workingDirectory;
    const recursive = input.recursive as boolean | undefined;

    const resolvedPath = path.resolve(ctx.workingDirectory, inputPath);
    if (!resolvedPath.startsWith(path.resolve(ctx.workingDirectory))) {
      return { resultText: "Access denied: path is outside working directory", isError: true };
    }

    let filesToSearch: string[] = [];

    try {
      const stats = fs.statSync(resolvedPath);
      if (stats.isDirectory()) {
        if (recursive) {
          filesToSearch = await glob("**/*", { cwd: resolvedPath, absolute: true, nodir: true });
        } else {
          const entries = fs.readdirSync(resolvedPath, { withFileTypes: true });
          filesToSearch = entries
            .filter((e) => e.isFile())
            .map((e) => path.join(resolvedPath, e.name));
        }
      } else {
        filesToSearch = [resolvedPath];
      }

      const regex = new RegExp(patternStr, "g");
      const matches: string[] = [];

      for (const file of filesToSearch) {
        try {
          const content = fs.readFileSync(file, "utf-8");
          const lines = content.split("\n");
          for (let i = 0; i < lines.length; i++) {
            if (regex.test(lines[i])) {
              matches.push(`${file}:${i + 1}:${lines[i]}`);
              regex.lastIndex = 0; // reset
              if (matches.length >= 500) {
                break;
              }
            }
          }
        } catch (e) {
          // ignore unreadable files
        }
        if (matches.length >= 500) {
          break;
        }
      }

      if (matches.length === 0) {
        return { resultText: `No matches found for: ${patternStr}`, isError: false };
      }

      if (matches.length >= 500) {
        matches.push(`\n[... output truncated at 500 lines — make pattern more specific]`);
      }

      return { resultText: matches.join("\n"), isError: false };
    } catch (error: any) {
      return { resultText: error.message || String(error), isError: true };
    }
  },
};
