import { describe, it, expect } from "vitest";
import { composeSystemPrompt } from "../../src/skills/prompt.js";
import { Skill } from "../../src/skills/types.js";

describe("composeSystemPrompt", () => {
  const basePrompt = "You are a helpful assistant.";

  const createSkill = (name: string, desc: string, instructions: string): Skill => ({
    name,
    description: desc,
    instructions,
    dirPath: "/tmp",
    skillMdPath: "/tmp/SKILL.md",
    scope: "project",
    hasScripts: false,
    hasExamples: false,
    hasResources: false,
  });

  it("returns basePrompt unchanged when skills list is empty", () => {
    const result = composeSystemPrompt(basePrompt, []);
    expect(result).toBe(basePrompt);
  });

  it("produces correctly formatted section with one skill", () => {
    const skill = createSkill("test-skill", "A short description.", "Long body text");
    const result = composeSystemPrompt(basePrompt, [skill]);
    expect(result).toContain(basePrompt);
    expect(result).toContain("## Available Skills");
    expect(result).toContain("- test-skill: A short description.");
  });

  it("produces correctly formatted section with multiple skills on own lines", () => {
    const skill1 = createSkill("skill-1", "Desc 1", "Body 1");
    const skill2 = createSkill("skill-2", "Desc 2", "Body 2");
    const result = composeSystemPrompt(basePrompt, [skill1, skill2]);
    expect(result).toContain("- skill-1: Desc 1");
    expect(result).toContain("- skill-2: Desc 2");
  });

  it("does not include instructions field in output", () => {
    const skill = createSkill("test-skill", "Desc", "THIS_IS_THE_SECRET_INSTRUCTIONS_BODY_THAT_MUST_NOT_APPEAR");
    const result = composeSystemPrompt(basePrompt, [skill]);
    expect(result).not.toContain("THIS_IS_THE_SECRET_INSTRUCTIONS_BODY_THAT_MUST_NOT_APPEAR");
  });
});
