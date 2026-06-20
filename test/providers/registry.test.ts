import { describe, it, expect, vi } from "vitest";
import { ProviderRegistry } from "../../src/providers/registry.js";
import { Provider } from "../../src/providers/provider.js";

describe("ProviderRegistry", () => {
  const mockProvider1: Provider = {
    id: "test-provider-1",
    displayName: "Test Provider 1",
    listModels: vi.fn(),
    complete: vi.fn(),
    stream: vi.fn(),
    validateConfig: vi.fn(),
  };

  const mockProvider2: Provider = {
    id: "test-provider-2",
    displayName: "Test Provider 2",
    listModels: vi.fn(),
    complete: vi.fn(),
    stream: vi.fn(),
    validateConfig: vi.fn(),
  };

  it("should register providers and list them", () => {
    const registry = new ProviderRegistry();
    registry.register(mockProvider1);
    registry.register(mockProvider2);

    const list = registry.list();
    expect(list).toHaveLength(2);
    expect(list).toContain(mockProvider1);
    expect(list).toContain(mockProvider2);
  });

  it("should get a registered provider by id", () => {
    const registry = new ProviderRegistry();
    registry.register(mockProvider1);

    const provider = registry.get("test-provider-1");
    expect(provider).toBe(mockProvider1);
  });

  it("should throw an error with the requested id when getting an unregistered provider", () => {
    const registry = new ProviderRegistry();
    registry.register(mockProvider1);

    expect(() => registry.get("non-existent")).toThrowError(
      'Provider "non-existent" is not registered. Available providers: test-provider-1'
    );
  });
});
