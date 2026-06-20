import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { parseSkillMd } from "../../src/skills/parser.js";
import { SkillParseError } from "../../src/skills/types.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

describe("parseSkillMd", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "openagent-skill-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("parses valid minimal skill", () => {
    const mdPath = path.join(tmpDir, "SKILL.md");
    const content = `---\nname: my-skill\ndescription: A test skill\n---\nbody text`;
    const skill = parseSkillMd(mdPath, content, "project");

    expect(skill.name).toBe("my-skill");
    expect(skill.description).toBe("A test skill");
    expect(skill.instructions).toBe("body text");
    expect(skill.dirPath).toBe(tmpDir);
    expect(skill.skillMdPath).toBe(mdPath);
    expect(skill.scope).toBe("project");
    expect(skill.hasScripts).toBe(false);
    expect(skill.hasExamples).toBe(false);
    expect(skill.hasResources).toBe(false);
  });

  it("detects subdirectories when present", () => {
    fs.mkdirSync(path.join(tmpDir, "scripts"));
    fs.mkdirSync(path.join(tmpDir, "examples"));
    fs.mkdirSync(path.join(tmpDir, "resources"));

    const mdPath = path.join(tmpDir, "SKILL.md");
    const content = `---\nname: my-skill\ndescription: desc\n---\nbody`;
    const skill = parseSkillMd(mdPath, content, "global");

    expect(skill.hasScripts).toBe(true);
    expect(skill.hasExamples).toBe(true);
    expect(skill.hasResources).toBe(true);
  });

  it("throws when missing frontmatter opening", () => {
    const content = `name: my-skill\ndescription: desc\n---\nbody`;
    expect(() => parseSkillMd("test", content, "project")).toThrow(SkillParseError);
    expect(() => parseSkillMd("test", content, "project")).toThrow("missing frontmatter (file must start with ---)");
  });

  it("throws when missing frontmatter closing", () => {
    const content = `---\nname: my-skill\ndescription: desc\nbody`;
    expect(() => parseSkillMd("test", content, "project")).toThrow(SkillParseError);
    expect(() => parseSkillMd("test", content, "project")).toThrow("frontmatter not closed (missing second ---)");
  });

  it("throws on invalid YAML", () => {
    const content = `---\nname: "unclosed\n---\nbody`;
    expect(() => parseSkillMd("test", content, "project")).toThrow(SkillParseError);
    expect(() => parseSkillMd("test", content, "project")).toThrow(/invalid YAML in frontmatter/);
  });

  it("throws when name is missing", () => {
    const content = `---\ndescription: desc\n---\nbody`;
    expect(() => parseSkillMd("test", content, "project")).toThrow(SkillParseError);
    expect(() => parseSkillMd("test", content, "project")).toThrow("frontmatter is missing required field 'name'");
  });

  it("throws when description is missing", () => {
    const content = `---\nname: my-skill\n---\nbody`;
    expect(() => parseSkillMd("test", content, "project")).toThrow(SkillParseError);
    expect(() => parseSkillMd("test", content, "project")).toThrow("frontmatter is missing required field 'description'");
  });

  it("throws on invalid name characters", () => {
    const cases = ["My Skill!", "my_skill", "MySkill"];
    for (const invalidName of cases) {
      const content = `---\nname: ${invalidName}\ndescription: desc\n---\nbody`;
      expect(() => parseSkillMd("test", content, "project")).toThrow(SkillParseError);
      expect(() => parseSkillMd("test", content, "project")).toThrow(/name must contain only lowercase letters, numbers, and hyphens/);
    }
  });

  it("parses name with hyphens and numbers", () => {
    const content = `---\nname: api-error-handling-v2\ndescription: desc\n---\nbody`;
    const skill = parseSkillMd("test", content, "project");
    expect(skill.name).toBe("api-error-handling-v2");
  });
});
