import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { glob } from "glob";
import { exec } from "child_process";

import { ReadFileTool } from "../../../src/core/tools/read-file.js";
import { WriteFileTool } from "../../../src/core/tools/write-file.js";
import { EditFileTool } from "../../../src/core/tools/edit-file.js";
import { ListDirectoryTool } from "../../../src/core/tools/list-directory.js";
import { GlobTool } from "../../../src/core/tools/glob.js";
import { GrepTool } from "../../../src/core/tools/grep.js";
import { BashTool } from "../../../src/core/tools/bash.js";

vi.mock("fs");
vi.mock("glob");
vi.mock("child_process");

const workspaceDir = path.resolve(__dirname, "workspace");
const ctx = {
  agentId: "agent1",
  agentRole: "micro-agent" as const,
  workingDirectory: workspaceDir,
  sessionId: "session1",
};

describe("Core Tools", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("read_file", () => {
    it("returns 'none' for permission", () => {
      expect(ReadFileTool.requiresPermission({ path: "test.txt" })).toEqual({ level: "none" });
    });

    it("rejects path traversal outside working directory", async () => {
      const res = await ReadFileTool.execute({ path: "../../etc/passwd" }, ctx);
      expect(res.isError).toBe(true);
      expect(res.resultText).toContain("Access denied");
      expect(fs.readFileSync).not.toHaveBeenCalled();
    });

    it("reads file content normally", async () => {
      (fs.readFileSync as any).mockReturnValue("line1\nline2\nline3");
      const res = await ReadFileTool.execute({ path: "test.txt" }, ctx);
      expect(res.isError).toBe(false);
      expect(res.resultText).toBe("line1\nline2\nline3");
      expect(fs.readFileSync).toHaveBeenCalledWith(path.resolve(workspaceDir, "test.txt"), "utf-8");
    });
  });

  describe("write_file", () => {
    it("returns 'ask' if file exists, 'none' if it does not", () => {
      (fs.existsSync as any).mockImplementation((p: string) => p.includes("exists"));
      expect(WriteFileTool.requiresPermission({ path: "exists.txt" }).level).toBe("ask");
      expect(WriteFileTool.requiresPermission({ path: "new.txt" }).level).toBe("none");
    });

    it("rejects path traversal", async () => {
      const res = await WriteFileTool.execute({ path: "../out.txt", content: "data" }, ctx);
      expect(res.isError).toBe(true);
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it("creates directories and writes file", async () => {
      const res = await WriteFileTool.execute({ path: "dir/test.txt", content: "data" }, ctx);
      expect(res.isError).toBe(false);
      expect(fs.mkdirSync).toHaveBeenCalledWith(path.resolve(workspaceDir, "dir"), { recursive: true });
      expect(fs.writeFileSync).toHaveBeenCalledWith(path.resolve(workspaceDir, "dir/test.txt"), "data", "utf-8");
    });
  });

  describe("edit_file", () => {
    it("returns 'ask' for permission", () => {
      expect(EditFileTool.requiresPermission({ path: "test.txt", old_str: "a", new_str: "b" }).level).toBe("ask");
    });

    it("rejects path traversal", async () => {
      const res = await EditFileTool.execute({ path: "../test.txt", old_str: "a", new_str: "b" }, ctx);
      expect(res.isError).toBe(true);
    });

    it("replaces exact 1 occurrence", async () => {
      (fs.readFileSync as any).mockReturnValue("hello world");
      const res = await EditFileTool.execute({ path: "test.txt", old_str: "world", new_str: "there" }, ctx);
      expect(res.isError).toBe(false);
      expect(fs.writeFileSync).toHaveBeenCalledWith(path.resolve(workspaceDir, "test.txt"), "hello there", "utf-8");
    });

    it("returns error if 0 or >1 occurrences", async () => {
      (fs.readFileSync as any).mockReturnValue("hello hello");
      let res = await EditFileTool.execute({ path: "test.txt", old_str: "hello", new_str: "hi" }, ctx);
      expect(res.isError).toBe(true);
      expect(res.resultText).toContain("ambiguous");

      res = await EditFileTool.execute({ path: "test.txt", old_str: "bye", new_str: "hi" }, ctx);
      expect(res.isError).toBe(true);
      expect(res.resultText).toContain("not found");
    });
  });

  describe("list_directory", () => {
    it("returns 'none' for permission", () => {
      expect(ListDirectoryTool.requiresPermission({})).toEqual({ level: "none" });
    });

    it("rejects path traversal", async () => {
      const res = await ListDirectoryTool.execute({ path: "../../" }, ctx);
      expect(res.isError).toBe(true);
    });

    it("lists files and directories", async () => {
      (fs.readdirSync as any).mockReturnValue([
        { name: "src", isDirectory: () => true },
        { name: "test.txt", isDirectory: () => false },
      ]);
      const res = await ListDirectoryTool.execute({ path: "." }, ctx);
      expect(res.isError).toBe(false);
      expect(res.resultText).toContain("[dir]");
      expect(res.resultText).toContain("[file]");
    });
  });

  describe("glob", () => {
    it("returns 'none' for permission", () => {
      expect(GlobTool.requiresPermission({})).toEqual({ level: "none" });
    });

    it("reverts cwd to ctx.workingDirectory if input cwd escapes sandbox", async () => {
      (glob as any).mockResolvedValue([path.resolve(workspaceDir, "test.ts")]);
      await GlobTool.execute({ pattern: "*.ts", cwd: "../../" }, ctx);
      expect((glob as any).mock.calls[0][1].cwd).toBe(workspaceDir);
    });

    it("finds matching files", async () => {
      const matchPath = path.resolve(workspaceDir, "a.ts");
      (glob as any).mockResolvedValue([matchPath]);
      const res = await GlobTool.execute({ pattern: "*.ts" }, ctx);
      expect(res.isError).toBe(false);
      expect(res.resultText).toBe(matchPath);
    });
  });

  describe("grep", () => {
    it("returns 'none' for permission", () => {
      expect(GrepTool.requiresPermission({})).toEqual({ level: "none" });
    });

    it("rejects path traversal", async () => {
      const res = await GrepTool.execute({ pattern: "test", path: "../" }, ctx);
      expect(res.isError).toBe(true);
    });

    it("searches lines", async () => {
      (fs.statSync as any).mockReturnValue({ isDirectory: () => false });
      (fs.readFileSync as any).mockReturnValue("line 1 test\nline 2\nline 3 test");
      const res = await GrepTool.execute({ pattern: "test", path: "file.txt" }, ctx);
      expect(res.isError).toBe(false);
      expect(res.resultText.split("\n").length).toBe(2);
    });
  });

  describe("bash", () => {
    it("bash — requiresPermission returns 'ask' for EVERY input", () => {
      const commands = ["ls", "npm test", "rm -rf /"];
      for (const cmd of commands) {
        const perm = BashTool.requiresPermission({ command: cmd });
        expect(perm.level).toBe("ask");
      }
    });

    it("executes command", async () => {
      (exec as any).mockImplementation((cmd: string, opts: any, callback: any) => {
        callback(null, "output", "");
        return { killed: false };
      });
      const res = await BashTool.execute({ command: "echo test" }, ctx);
      expect(res.isError).toBe(false);
      expect(res.resultText).toBe("output");
      expect((exec as any).mock.calls[0][1].cwd).toBe(workspaceDir);
    });
  });
});
