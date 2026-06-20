import { Skill } from "./types.js";

export interface SkillAttachment {
  skillName: string;
  scope: { level: "global" } | { level: "agent"; agentId: string };
  // NOTE: "manager" and "team" scope levels exist in ARCHITECTURE.md 
  // Section 8.3 but are not implementable until Phase 4 — do not 
  // stub them out with fake behavior, just omit them from this 
  // union for now and add them when Teams exist.
}

export function resolveAttachedSkills(
  allSkills: Skill[],
  attachments: SkillAttachment[],
  agentId: string
): Skill[] {
  const result: Skill[] = [];

  for (const attachment of attachments) {
    if (
      attachment.scope.level === "global" ||
      (attachment.scope.level === "agent" && attachment.scope.agentId === agentId)
    ) {
      const skill = allSkills.find((s) => s.name === attachment.skillName);
      if (skill) {
        result.push(skill);
      } else {
        console.warn(`Warning: Attached skill '${attachment.skillName}' not found in available skills.`);
      }
    }
  }

  return result;
}
