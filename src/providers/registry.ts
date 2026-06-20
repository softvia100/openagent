import { Provider } from "./provider.js";

export class ProviderRegistry {
  private providers = new Map<string, Provider>();

  register(provider: Provider): void {
    this.providers.set(provider.id, provider);
  }

  get(id: string): Provider {
    const provider = this.providers.get(id);
    if (!provider) {
      const available = Array.from(this.providers.keys()).join(", ");
      throw new Error(`Provider "${id}" is not registered. Available providers: ${available || "none"}`);
    }
    return provider;
  }

  list(): Provider[] {
    return Array.from(this.providers.values());
  }
}
