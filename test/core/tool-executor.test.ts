import { describe, it, expect, vi, beforeEach } from "vitest";
import { ToolExecutor, PermissionResolver } from "../../src/core/tool-executor.js";
import { Tool } from "../../src/core/tools/types.js";

describe("ToolExecutor", () => {
  let mockResolver: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetAllMocks();
    mockResolver = vi.fn();
  });

  const createMockTool = (name: string, permissionReturn: any): Tool => ({
    definition: { name, description: "", inputSchema: {} },
    execute: vi.fn().mockResolvedValue({ resultText: "success", isError: false }),
    requiresPermission: vi.fn().mockReturnValue(permissionReturn),
  });

  const agentConfig = { id: "a1", role: "micro-agent", workingDirectory: "/tmp", sessionId: "s1" };

  it("TEST 1 — tool with requiresPermission 'none' executes without prompting", async () => {
    const tool = createMockTool("test-tool", { level: "none" });
    const executor = new ToolExecutor([tool], mockResolver);
    
    const record = await executor.execute({ id: "1", name: "test-tool", input: {} }, agentConfig);
    
    expect(record.permissionDecision).toBe("auto-allowed");
    expect(record.result.isError).toBe(false);
    expect(tool.execute).toHaveBeenCalledTimes(1);
    expect(mockResolver).not.toHaveBeenCalled();
  });

  it("TEST 2 — tool with 'deny' never executes", async () => {
    const tool = createMockTool("test-tool", { level: "deny", reason: "not allowed" });
    const executor = new ToolExecutor([tool], mockResolver);

    const record = await executor.execute({ id: "1", name: "test-tool", input: {} }, agentConfig);

    expect(record.permissionDecision).toBe("system-denied");
    expect(record.result.isError).toBe(true);
    expect(record.result.resultText).toContain("not allowed");
    expect(tool.execute).not.toHaveBeenCalled();
  });

  it("TEST 3 — tool with 'ask', user answers 'y', executes", async () => {
    mockResolver.mockResolvedValue("allow");
    const tool = createMockTool("test-tool", { level: "ask", reason: "dangerous" });
    const executor = new ToolExecutor([tool], mockResolver);

    const record = await executor.execute({ id: "1", name: "test-tool", input: {} }, agentConfig);

    expect(record.permissionDecision).toBe("user-allowed");
    expect(record.result.isError).toBe(false);
    expect(tool.execute).toHaveBeenCalledTimes(1);
    expect(mockResolver).toHaveBeenCalledTimes(1);
  });

  it("TEST 4 — tool with 'ask', user answers 'n', does not execute", async () => {
    mockResolver.mockResolvedValue("deny");
    const tool = createMockTool("test-tool", { level: "ask", reason: "dangerous" });
    const executor = new ToolExecutor([tool], mockResolver);

    const record = await executor.execute({ id: "1", name: "test-tool", input: {} }, agentConfig);

    expect(record.permissionDecision).toBe("user-denied");
    expect(record.result.isError).toBe(true);
    expect(record.result.resultText).toContain("User denied permission");
    expect(tool.execute).not.toHaveBeenCalled();
    expect(mockResolver).toHaveBeenCalledTimes(1);
  });

  it("TEST 5 — unknown tool name returns error record, does not throw", async () => {
    const executor = new ToolExecutor([], mockResolver);

    const record = await executor.execute({ id: "1", name: "unknown-tool", input: {} }, agentConfig);

    expect(record.result.isError).toBe(true);
    expect(record.result.resultText).toContain("unknown-tool");
  });
});
