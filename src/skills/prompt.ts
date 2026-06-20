import { Skill } from "./types.js";

export function composeSystemPrompt(basePrompt: string, attachedSkills: Skill[]): string {
  if (attachedSkills.length === 0) {
    return basePrompt;
  }

  let prompt = basePrompt + "\n\n## Available Skills\n\n";
  prompt += "You have access to the following skills. If a skill's description \n";
  prompt += "suggests it's relevant to the current task, use the load_skill tool \n";
  prompt += "to read its full instructions before proceeding. Do not load a skill \n";
  prompt += "that isn't relevant to what you're currently doing.\n\n";

  for (const skill of attachedSkills) {
    prompt += `- ${skill.name}: ${skill.description}\n`;
  }

  return prompt.trim();
}
