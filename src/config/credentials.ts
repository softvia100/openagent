// Phase 1: env vars only.
// TODO: add OS keychain support (keytar) in Phase 5/6 
// — ARCHITECTURE.md Section 18.2

const envVarMap: Record<string, string | undefined> = {
  "anthropic": "ANTHROPIC_API_KEY",
  "openai": "OPENAI_API_KEY",
  "google": "GEMINI_API_KEY",
  "openrouter": "OPENROUTER_API_KEY",
  "ollama": undefined,
};

export function getProviderEnvVarName(providerId: string): string | undefined {
  if (providerId in envVarMap) {
    return envVarMap[providerId];
  }
  return undefined;
}

export function getApiKey(providerId: string): string | undefined {
  const envVar = getProviderEnvVarName(providerId);
  if (!envVar) {
    return undefined;
  }
  return process.env[envVar];
}
