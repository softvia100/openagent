import * as yaml from "yaml";
import * as fs from "fs";
import * as path from "path";
import { Skill, SkillParseError } from "./types.js";

export function parseSkillMd(filePath: string, fileContent: string, scope: "project" | "global"): Skill {
  if (!fileContent.startsWith("---")) {
    throw new SkillParseError(filePath, "missing frontmatter (file must start with ---)");
  }

  const endOfFrontmatter = fileContent.indexOf("---", 3);
  if (endOfFrontmatter === -1) {
    throw new SkillParseError(filePath, "frontmatter not closed (missing second ---)");
  }

  const frontmatterString = fileContent.substring(3, endOfFrontmatter);
  const instructionsString = fileContent.substring(endOfFrontmatter + 3).trim();

  let parsedYaml;
  try {
    parsedYaml = yaml.parse(frontmatterString);
  } catch (err: any) {
    throw new SkillParseError(filePath, `invalid YAML in frontmatter: ${err.message}`);
  }

  if (!parsedYaml || typeof parsedYaml.name !== "string" || parsedYaml.name.trim() === "") {
    throw new SkillParseError(filePath, "frontmatter is missing required field 'name'");
  }

  if (typeof parsedYaml.description !== "string" || parsedYaml.description.trim() === "") {
    throw new SkillParseError(filePath, "frontmatter is missing required field 'description'");
  }

  const name = parsedYaml.name.trim();
  if (!/^[a-z0-9-]+$/.test(name)) {
    throw new SkillParseError(filePath, `name must contain only lowercase letters, numbers, and hyphens, got: '${parsedYaml.name}'`);
  }

  const dirPath = path.dirname(filePath);

  return {
    name,
    description: parsedYaml.description.trim(),
    instructions: instructionsString,
    dirPath,
    skillMdPath: filePath,
    scope,
    hasScripts: fs.existsSync(path.join(dirPath, "scripts")),
    hasExamples: fs.existsSync(path.join(dirPath, "examples")),
    hasResources: fs.existsSync(path.join(dirPath, "resources")),
  };
}
