# Providers

OpenAgent talks to model APIs through a single internal interface (`Provider`, defined in `ARCHITECTURE.md` Section 5) so that every part of the system — the Manager, every Team Lead, every Micro Agent — can be configured to use any supported provider independently, including mixing several in one session. This document covers setup and practical notes for each provider. For the interface itself and how to add a new one, see `ARCHITECTURE.md` Sections 5 and 26.

**Current status:** Only Anthropic is implemented today. The rest of this document describes the target v1.0 provider set; see `ROADMAP.md` for what's actually built versus planned.

## Setting up a provider

General pattern for any provider:

```bash
openagent auth login <provider-id>
```

This walks you through obtaining and storing credentials. Credentials are stored in your OS keychain where available, or a restricted-permission file otherwise — never in plaintext inside a committed config file. You can check what's configured with:

```bash
openagent auth status
```

You can also set credentials via environment variables, which is the recommended approach for CI:

```bash
export ANTHROPIC_API_KEY=...
export OPENAI_API_KEY=...
```

## Anthropic

**Provider ID:** `anthropic`
**Env var:** `ANTHROPIC_API_KEY`
**Get a key:** the Anthropic Console, under API Keys.

This is OpenAgent's reference provider implementation — every other provider's translation logic is checked against the behavior established here. Anthropic's tool-use format (content blocks with `tool_use`/`tool_result` types) maps closely to OpenAgent's internal `ContentBlock` union, which is not a coincidence; that union was designed with this shape in mind first, then verified to generalize.

```json
{ "defaultModel": { "providerId": "anthropic", "modelId": "claude-opus-4-8" } }
```

Model family naming follows Anthropic's own conventions (Opus/Sonnet/Haiku tiers); use `openagent config get providers.anthropic.models` (once implemented) or check Anthropic's own documentation for current model identifiers, since these are added by Anthropic over time and this document does not attempt to enumerate them exhaustively.

## OpenAI

**Provider ID:** `openai`
**Env var:** `OPENAI_API_KEY`
**Get a key:** the OpenAI Platform dashboard, under API keys.

OpenAI's function-calling format differs from Anthropic's in how tool calls and their results are threaded through the message list. This is the provider that most exercised the translation layer's flexibility during initial design, since getting multi-turn tool conversations right across both shapes simultaneously is the actual hard part of "multi-provider support" — not the happy-path single completion call.

```json
{ "teams": { "frontend": { "model": { "providerId": "openai", "modelId": "gpt-5" } } } }
```

## Google (Gemini)

**Provider ID:** `google`
**Env var:** `GOOGLE_API_KEY`
**Get a key:** Google AI Studio or Google Cloud, depending on whether you want the consumer or enterprise/Vertex path.

Note that Google's API has historically had some differences in how multi-turn tool conversations and system prompts are structured compared to Anthropic/OpenAI; this provider implementation is the second-most-exercised path for the translation layer's flexibility after OpenAI's.

## OpenRouter

**Provider ID:** `openrouter`
**Env var:** `OPENROUTER_API_KEY`
**Get a key:** openrouter.ai

OpenRouter is a meta-provider: one API key gives access to many underlying hosted models. This is a convenient default for users who want to experiment with model choice across teams without managing several providers' credentials separately. Specify the underlying model using OpenRouter's own model identifier scheme.

```json
{ "teams": { "database": { "model": { "providerId": "openrouter", "modelId": "some-vendor/some-model" } } } }
```

## Ollama (local models)

**Provider ID:** `ollama`
**Env var:** none required by default — assumes a local Ollama server at its default address; configurable via `providers.ollama.baseUrl` if you're running it elsewhere.
**Setup:** install and run Ollama separately, pull whatever model you want to use (`ollama pull <model>`), then point OpenAgent at it.

Local models are the one case where `ModelInfo.costPerMillionInputTokens`/`costPerMillionOutputTokens` (Section 25.2's cost tracking) are meaningless — there's no per-token billing for a model running on your own machine. The cost tracking UI simply omits cost estimates for sessions using only local models. Be aware that smaller local models may struggle with the complexity of acting as a Team Lead (real subtask decomposition and integration judgment) even if they're fine as a Micro Agent for narrow, well-specified subtasks — consider that when deciding which roles to assign a local model to.

## Azure OpenAI

**Provider ID:** `azure-openai`
**Env vars:** `AZURE_OPENAI_API_KEY`, plus deployment-specific configuration (endpoint, deployment name, API version) since Azure routes by deployment rather than a flat model identifier the way OpenAI's own API does.
**Setup:** this provider exists specifically for organizations that need Azure's deployment/compliance model rather than calling OpenAI directly; if that's not a constraint you have, the plain `openai` provider is simpler to set up.

```json
{
  "providers": {
    "azure-openai": {
      "endpoint": "https://your-resource.openai.azure.com",
      "deploymentName": "your-deployment",
      "apiVersion": "2024-XX-XX"
    }
  }
}
```

## Choosing models per role: practical guidance

This isn't a hard rule, just a starting heuristic worth knowing before you over-customize your config:

- **Manager and Team Leads** benefit most from strong reasoning models, since their job is judgment-heavy: classifying requests, decomposing work, integrating results, catching inconsistencies. This is not where it pays to economize.
- **Micro Agents** doing narrow, well-specified subtasks (implement this one function per this one spec) are often fine on a smaller/cheaper model, *if* the Team Lead's decomposition is genuinely well-scoped (Section 11.2's guidance on subtask sizing matters more, the smaller the Micro Agent's model is).
- **The Verifier Team** arguably deserves a strong model too — judging whether something is actually correct is at least as hard as producing it, and a weak verifier gives false confidence, which is worse than no verification at all.

None of this is enforced by the system — you can configure it however you want, including everything on one model, which is a perfectly reasonable choice, especially when you're starting out and don't yet have a strong opinion about where the cost/quality tradeoff matters most for your own work.

## Adding a provider not listed here

See `ARCHITECTURE.md` Section 26 for the full guide. In short: implement the `Provider` interface in a new file under `src/providers/`, register it, and add it to this document once it's working — contributions adding new providers are very welcome and are one of the most valuable, self-contained things to contribute, since the interface is designed specifically so a new provider doesn't require touching the orchestration layer at all.
