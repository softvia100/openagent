import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import { loadConfig } from "../../src/config/load.js";
import { getApiKey, getProviderEnvVarName } from "../../src/config/credentials.js";

vi.mock("fs");

describe("Config Loading", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("TEST 1 — loadConfig with no project config returns defaults", () => {
    (fs.existsSync as any).mockReturnValue(false);
    const result = loadConfig("/test-root");
    expect(result.defaultModel.providerId).toBe("google");
    expect(result.defaultModel.modelId).toBe("gemini-2.5-flash");
  });

  it("TEST 2 — loadConfig merges project config over defaults", () => {
    (fs.existsSync as any).mockReturnValue(true);
    (fs.readFileSync as any).mockReturnValue(JSON.stringify({
      defaultModel: { providerId: "openai", modelId: "gpt-5" }
    }));
    const result = loadConfig("/test-root");
    expect(result.defaultModel.providerId).toBe("openai");
    expect(result.defaultModel.modelId).toBe("gpt-5");
  });

  it("TEST 3 — loadConfig throws on invalid config", () => {
    (fs.existsSync as any).mockReturnValue(true);
    (fs.readFileSync as any).mockReturnValue(JSON.stringify({
      defaultModel: "this is a string instead of object"
    }));
    expect(() => loadConfig("/test-root")).toThrow(/Invalid config at \.openagent[\\/]config\.json:/);
  });
});

describe("Credentials", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("TEST 4 — getApiKey returns correct env var value", () => {
    process.env.ANTHROPIC_API_KEY = "test-key-123";
    expect(getApiKey("anthropic")).toBe("test-key-123");
  });

  it("TEST 5 — getApiKey returns undefined for unknown provider", () => {
    expect(getApiKey("unknown-provider")).toBeUndefined();
  });

  it("TEST 6 — getApiKey returns undefined when env var not set", () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(getApiKey("anthropic")).toBeUndefined();
  });

  it("TEST 7 — getProviderEnvVarName returns correct names", () => {
    expect(getProviderEnvVarName("anthropic")).toBe("ANTHROPIC_API_KEY");
    expect(getProviderEnvVarName("openai")).toBe("OPENAI_API_KEY");
    expect(getProviderEnvVarName("ollama")).toBeUndefined();
  });
});
