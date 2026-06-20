import { Tool } from "./types.js";
import { Skill } from "../../skills/types.js";

export function createLoadSkillTool(availableSkills: Skill[]): Tool {
  return {
    definition: {
      name: "load_skill",
      description: "Load the full instructions for a specific skill by name, when its description suggests it's relevant to your current task.",
      inputSchema: {
        type: "object",
        properties: { skill_name: { type: "string" } },
        required: ["skill_name"],
      },
    },
    requiresPermission: () => ({ level: "none" }),
    async execute(input, ctx) {
      const skillName = input.skill_name as string;
      const skill = availableSkills.find(s => s.name === skillName);
      if (!skill) {
        return {
          resultText: `No skill found with name "${skillName}". Available skills: ${availableSkills.map(s => s.name).join(", ") || "(none)"}`,
          isError: true,
        };
      }
      return {
        resultText: skill.instructions,
        isError: false,
        metadata: { skillName: skill.name, scope: skill.scope },
      };
    },
  };
}
