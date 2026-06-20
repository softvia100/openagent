import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { Skill, SkillParseError } from "./types.js";
import { parseSkillMd } from "./parser.js";

function scanDirectory(baseDir: string, scope: "project" | "global"): Skill[] {
  const skills: Skill[] = [];
  if (!fs.existsSync(baseDir)) return skills;

  let entries;
  try {
    entries = fs.readdirSync(baseDir, { withFileTypes: true });
  } catch {
    return skills;
  }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const skillMdPath = path.join(baseDir, entry.name, "SKILL.md");
      if (fs.existsSync(skillMdPath)) {
        try {
          const content = fs.readFileSync(skillMdPath, "utf-8");
          const skill = parseSkillMd(skillMdPath, content, scope);
          skills.push(skill);
        } catch (error) {
          if (error instanceof SkillParseError) {
            console.warn(`Warning: skipping malformed skill in ${entry.name}: ${error.message}`);
          } else {
            console.warn(`Warning: failed to read skill in ${entry.name}: ${String(error)}`);
          }
        }
      }
    }
  }

  return skills;
}

export function discoverSkills(projectRoot: string): Skill[] {
  const projectDir = path.join(projectRoot, ".agent", "skills");
  const globalDir = path.join(os.homedir(), ".openagent", "skills");

  const projectSkills = scanDirectory(projectDir, "project");
  const globalSkills = scanDirectory(globalDir, "global");

  const finalSkills = new Map<string, Skill>();

  // Add global first
  for (const skill of globalSkills) {
    finalSkills.set(skill.name, skill);
  }

  // Add project, overwriting global on collision
  for (const skill of projectSkills) {
    if (finalSkills.has(skill.name)) {
      console.warn(`Warning: Global skill '${skill.name}' is shadowed by a project skill with the same name`);
    }
    finalSkills.set(skill.name, skill);
  }

  return Array.from(finalSkills.values());
}
