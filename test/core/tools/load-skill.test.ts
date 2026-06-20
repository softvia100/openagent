import { describe, it, expect } from "vitest";
import { createLoadSkillTool } from "../../../src/core/tools/load-skill.js";
import { Skill } from "../../../src/skills/types.js";

describe("load_skill tool", () => {
  const mockSkills: Skill[] = [
    {
      name: "skill-1",
      description: "desc 1",
      instructions: "Skill 1 instructions body",
      dirPath: "/tmp",
      skillMdPath: "/tmp/SKILL.md",
      scope: "project",
      hasScripts: false,
      hasExamples: false,
      hasResources: false,
    },
    {
      name: "skill-2",
      description: "desc 2",
      instructions: "Skill 2 instructions body",
      dirPath: "/tmp",
      skillMdPath: "/tmp/SKILL.md",
      scope: "global",
      hasScripts: false,
      hasExamples: false,
      hasResources: false,
    },
  ];

  const tool = createLoadSkillTool(mockSkills);
  const dummyCtx = { agentId: "1", agentRole: "micro-agent" as const, workingDirectory: "/tmp", sessionId: "1" };

  it("returns instructions when skill exists", async () => {
    const result = await tool.execute({ skill_name: "skill-1" }, dummyCtx);
    expect(result.isError).toBe(false);
    expect(result.resultText).toBe("Skill 1 instructions body");
    expect(result.metadata).toEqual({ skillName: "skill-1", scope: "project" });
  });

  it("returns error message when skill does not exist", async () => {
    const result = await tool.execute({ skill_name: "missing" }, dummyCtx);
    expect(result.isError).toBe(true);
    expect(result.resultText).toContain("No skill found with name \"missing\"");
    expect(result.resultText).toContain("Available skills: skill-1, skill-2");
  });

  it("requiresPermission is always none", () => {
    expect(tool.requiresPermission({})).toEqual({ level: "none" });
  });
});
