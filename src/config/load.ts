// Phase 1: project config + defaults only.
// TODO: add global user config (~/.openagent/config.json) 
// and env var layering in Phase 5/6 — ARCHITECTURE.md Section 18.1

import * as fs from "fs";
import * as path from "path";
import { OpenAgentConfig, OpenAgentConfigSchema } from "./schema.js";
import { DEFAULT_CONFIG } from "./defaults.js";

function isObject(item: any) {
  return item && typeof item === "object" && !Array.isArray(item);
}

function deepMerge(target: any, source: any) {
  if (!isObject(target) || !isObject(source)) {
    return source;
  }
  const output = { ...target };
  Object.keys(source).forEach((key) => {
    if (isObject(source[key])) {
      if (!(key in target)) {
        output[key] = source[key];
      } else {
        output[key] = deepMerge(target[key], source[key]);
      }
    } else {
      output[key] = source[key];
    }
  });
  return output;
}

export function loadConfig(projectRoot?: string): OpenAgentConfig {
  let mergedConfig: any = { ...DEFAULT_CONFIG };

  if (projectRoot) {
    const configPath = path.join(projectRoot, ".openagent", "config.json");
    if (fs.existsSync(configPath)) {
      try {
        const fileContents = fs.readFileSync(configPath, "utf-8");
        const parsedJson = JSON.parse(fileContents);
        mergedConfig = deepMerge(mergedConfig, parsedJson);
      } catch (e: any) {
        if (e instanceof SyntaxError) {
          throw new Error(`Invalid config at .openagent/config.json: Invalid JSON`);
        }
        throw e;
      }
    }
  }

  const result = OpenAgentConfigSchema.safeParse(mergedConfig);
  if (!result.success) {
    throw new Error(`Invalid config at .openagent/config.json: ${result.error.message}`);
  }

  return result.data;
}
