import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resolveAttachedSkills, SkillAttachment } from "../../src/skills/attachment.js";
import { Skill } from "../../src/skills/types.js";

describe("resolveAttachedSkills", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockSkills: Skill[] = [
    {
      name: "skill-1",
      description: "desc 1",
      instructions: "body 1",
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
      instructions: "body 2",
      dirPath: "/tmp",
      skillMdPath: "/tmp/SKILL.md",
      scope: "global",
      hasScripts: false,
      hasExamples: false,
      hasResources: false,
    },
  ];

  it("applies global-scoped attachment to any agentId", () => {
    const attachments: SkillAttachment[] = [
      { skillName: "skill-1", scope: { level: "global" } },
    ];
    const result = resolveAttachedSkills(mockSkills, attachments, "any-agent");
    expect(result.length).toBe(1);
    expect(result[0].name).toBe("skill-1");
  });

  it("applies agent-scoped attachment only to matching agentId", () => {
    const attachments: SkillAttachment[] = [
      { skillName: "skill-1", scope: { level: "agent", agentId: "target-agent" } },
    ];
    
    const resultMatch = resolveAttachedSkills(mockSkills, attachments, "target-agent");
    expect(resultMatch.length).toBe(1);
    expect(resultMatch[0].name).toBe("skill-1");

    const resultNoMatch = resolveAttachedSkills(mockSkills, attachments, "other-agent");
    expect(resultNoMatch.length).toBe(0);
  });

  it("skips non-existent skills with a warning", () => {
    const attachments: SkillAttachment[] = [
      { skillName: "missing-skill", scope: { level: "global" } },
    ];
    const result = resolveAttachedSkills(mockSkills, attachments, "any-agent");
    expect(result.length).toBe(0);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("missing-skill"));
  });

  it("returns empty result when attachments is empty", () => {
    const result = resolveAttachedSkills(mockSkills, [], "any-agent");
    expect(result.length).toBe(0);
  });
});
