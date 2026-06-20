export interface SkillFrontmatter {
  name: string;
  description: string;
}

export interface Skill {
  name: string;
  description: string;
  /** Full markdown body, everything after the frontmatter closing --- */
  instructions: string;
  /** Absolute path to the skill's directory (the one containing SKILL.md) */
  dirPath: string;
  /** Absolute path to SKILL.md itself */
  skillMdPath: string;
  scope: "project" | "global";
  /** True if scripts/, examples/, or resources/ subdirectories exist */
  hasScripts: boolean;
  hasExamples: boolean;
  hasResources: boolean;
}

export class SkillParseError extends Error {
  constructor(public skillMdPath: string, reason: string) {
    super(`Failed to parse ${skillMdPath}: ${reason}`);
  }
}
