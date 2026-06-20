import { loadConfig } from "./config/load.js";
import { getApiKey, getProviderEnvVarName } from "./config/credentials.js";
import { AnthropicProvider } from "./providers/anthropic.js";
import { GoogleProvider } from "./providers/google.js";
import { ALL_TOOLS } from "./core/tools/index.js";
import { render } from "ink";
import { App } from "./ui/App.js";
import React from "react";
import path from "node:path";

import { discoverSkills } from "./skills/loader.js";
import { resolveAttachedSkills } from "./skills/attachment.js";
import { createLoadSkillTool } from "./core/tools/load-skill.js";

async function main() {
  const arg1 = process.argv[2];
  const arg2 = process.argv[3];

  if (arg1 === "skill" && arg2 === "list") {
    const skills = discoverSkills(process.cwd());
    if (skills.length === 0) {
      console.log("No skills found.");
    } else {
      console.log("Discovered skills:\n");
      for (const skill of skills) {
        console.log(`  ${skill.name} [${skill.scope}]`);
        console.log(`    ${skill.description}\n`);
      }
    }
    process.exit(0);
  }

  const prompt = process.argv[2];
  // Note: For Phase 2 Round 1, we drop the requirement to provide an initial 
  // prompt argument since the interactive App shell will capture input.
  // We still parse process.argv[2] in case it's provided, but no longer exit if missing.

  let config;
  try {
    config = loadConfig(process.cwd());
  } catch (error: any) {
    console.error("Config error:", error.message);
    process.exit(1);
  }

  const providerId = config.defaultModel.providerId;
  const apiKey = getApiKey(providerId);

  if (apiKey === undefined && providerId !== "ollama") {
    const envVar = getProviderEnvVarName(providerId);
    console.error(`Error: ${envVar} is not set.`);
    console.error(`Run: export ${envVar}=your-key-here`);
    process.exit(1);
  }

  if (providerId === "anthropic" && apiKey) {
    process.env.ANTHROPIC_API_KEY = apiKey;
  } else if (providerId === "google" && apiKey) {
    process.env.GEMINI_API_KEY = apiKey;
  }

  if (providerId !== "anthropic" && providerId !== "google") {
    console.error("Only 'anthropic' and 'google' providers are supported");
    process.exit(1);
  }

  const provider = providerId === "google" ? new GoogleProvider() : new AnthropicProvider();

  // Phase 3: Default attachment of all discovered skills for the CLI agent
  const allSkills = discoverSkills(process.cwd());
  const defaultAttachments = allSkills.map(s => ({ skillName: s.name, scope: { level: "global" as const } }));
  const attachedSkills = resolveAttachedSkills(allSkills, defaultAttachments, "cli-agent");

  const agentConfig = {
    id: "cli-agent",
    role: "micro-agent" as const,
    systemPrompt:
      "You are a helpful coding assistant with access to tools for reading and writing files, searching the codebase, and running shell commands. When you use a tool, explain what you found or did before responding.",
    model: config.defaultModel,
    tools: [...ALL_TOOLS, createLoadSkillTool(attachedSkills)],
    skills: attachedSkills,
    maxTurns: 50,
    maxTokensPerTurn: 4096,
  };

  const { waitUntilExit } = render(
    <App 
      projectName={path.basename(process.cwd())} 
      modelId={config.defaultModel.modelId} 
      provider={provider}
      agentConfig={agentConfig}
    />
  );
  
  await waitUntilExit();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
