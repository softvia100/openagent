import { Tool } from "./types.js";
import { ReadFileTool } from "./read-file.js";
import { WriteFileTool } from "./write-file.js";
import { EditFileTool } from "./edit-file.js";
import { ListDirectoryTool } from "./list-directory.js";
import { GlobTool } from "./glob.js";
import { GrepTool } from "./grep.js";
import { BashTool } from "./bash.js";

export const ALL_TOOLS: Tool[] = [
  ReadFileTool,
  WriteFileTool,
  EditFileTool,
  ListDirectoryTool,
  GlobTool,
  GrepTool,
  BashTool,
];
