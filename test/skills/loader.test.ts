import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

vi.mock("os", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    homedir: vi.fn(),
  };
});

import { discoverSkills } from "../../src/skills/loader.js";

describe("discoverSkills", () => {
  let tmpProjectDir: string;
  let tmpGlobalDir: string;

  beforeEach(() => {
    tmpProjectDir = fs.mkdtempSync(path.join(os.tmpdir(), "openagent-project-"));
    tmpGlobalDir = fs.mkdtempSync(path.join(os.tmpdir(), "openagent-global-"));
    
    vi.mocked(os.homedir).mockReturnValue(tmpGlobalDir);
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    fs.rmSync(tmpProjectDir, { recursive: true, force: true });
    fs.rmSync(tmpGlobalDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  const createSkillFiles = (baseDir: string, skillName: string, subPath: string, invalid = false) => {
    const skillDir = path.join(baseDir, subPath, skillName);
    fs.mkdirSync(skillDir, { recursive: true });
    const content = invalid 
      ? `bad file`
      : `---\nname: ${skillName}\ndescription: desc for ${skillName}\n---\nbody text`;
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), content);
  };

  it("returns empty when no skills directories exist", () => {
    const skills = discoverSkills(tmpProjectDir);
    expect(skills.length).toBe(0);
  });

  it("discovers a valid project skill", () => {
    createSkillFiles(tmpProjectDir, "project-skill-1", ".agent/skills");
    const skills = discoverSkills(tmpProjectDir);
    expect(skills.length).toBe(1);
    expect(skills[0].name).toBe("project-skill-1");
    expect(skills[0].scope).toBe("project");
  });

  it("discovers multiple valid project skills", () => {
    createSkillFiles(tmpProjectDir, "project-skill-1", ".agent/skills");
    createSkillFiles(tmpProjectDir, "project-skill-2", ".agent/skills");
    const skills = discoverSkills(tmpProjectDir);
    expect(skills.length).toBe(2);
    expect(skills.map(s => s.name).sort()).toEqual(["project-skill-1", "project-skill-2"]);
  });

  it("skips malformed skills with a warning", () => {
    createSkillFiles(tmpProjectDir, "project-skill-1", ".agent/skills");
    createSkillFiles(tmpProjectDir, "bad-skill", ".agent/skills", true);
    
    const skills = discoverSkills(tmpProjectDir);
    expect(skills.length).toBe(1);
    expect(skills[0].name).toBe("project-skill-1");
    expect(console.warn).toHaveBeenCalled();
  });

  it("shadows global skill with project skill of the same name", () => {
    createSkillFiles(tmpProjectDir, "shared-skill", ".agent/skills");
    createSkillFiles(tmpGlobalDir, "shared-skill", ".openagent/skills");
    createSkillFiles(tmpGlobalDir, "global-only", ".openagent/skills");

    const skills = discoverSkills(tmpProjectDir);
    expect(skills.length).toBe(2);
    
    const shared = skills.find(s => s.name === "shared-skill")!;
    expect(shared).toBeDefined();
    expect(shared.scope).toBe("project");

    const globalOnly = skills.find(s => s.name === "global-only")!;
    expect(globalOnly).toBeDefined();
    expect(globalOnly.scope).toBe("global");

    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("is shadowed by a project skill"));
  });

  it("discovers a global skill correctly", () => {
    createSkillFiles(tmpGlobalDir, "global-skill", ".openagent/skills");
    const skills = discoverSkills(tmpProjectDir);
    expect(skills.length).toBe(1);
    expect(skills[0].name).toBe("global-skill");
    expect(skills[0].scope).toBe("global");
  });
});
