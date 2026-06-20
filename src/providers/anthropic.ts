import Anthropic from "@anthropic-ai/sdk";
import {
  Provider,
  ModelInfo,
  CompletionRequest,
  CompletionResponse,
  StreamEvent,
  ContentBlock,
} from "./provider.js";

export class AnthropicProvider implements Provider {
  readonly id = "anthropic";
  readonly displayName = "Anthropic";

  private getClient(): Anthropic {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not set.");
    }
    return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  async listModels(): Promise<ModelInfo[]> {
    // TODO: revisit if Anthropic ships a models-list endpoint
    return [
      {
        id: "claude-opus-4-8",
        displayName: "Claude Opus 4.8",
        contextWindow: 200000,
        maxOutputTokens: 32000,
        supportsImages: true,
        supportsTools: true,
      },
      {
        id: "claude-sonnet-4-6",
        displayName: "Claude Sonnet 4.6",
        contextWindow: 200000,
        maxOutputTokens: 8192,
        supportsImages: true,
        supportsTools: true,
      },
      {
        id: "claude-haiku-4-5",
        displayName: "Claude Haiku 4.5",
        contextWindow: 200000,
        maxOutputTokens: 4096,
        supportsImages: true,
        supportsTools: true,
      },
    ];
  }

  private mapContentBlocksToAnthropic(blocks: ContentBlock[]): Anthropic.MessageParam["content"] {
    return blocks.map((b) => {
      if (b.type === "text") {
        return { type: "text", text: b.text };
      } else if (b.type === "tool_use") {
        return {
          type: "tool_use",
          id: b.id,
          name: b.name,
          input: b.input,
        };
      } else if (b.type === "tool_result") {
        return {
          type: "tool_result",
          tool_use_id: b.toolUseId,
          content: b.content,
          is_error: b.isError,
        };
      } else if (b.type === "image") {
        return {
          type: "image",
          source: {
            type: "base64",
            media_type: b.mimeType as any,
            data: b.data,
          },
        };
      }
      throw new Error(`Unknown content block type: ${(b as any).type}`);
    });
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const client = this.getClient();

    const messages: Anthropic.MessageParam[] = request.messages.map((m) => {
      // Map 'tool' role to 'user' for Anthropic as required by their API
      if (m.role === "system") {
        throw new Error(
          "System messages must not appear in the messages array — " +
          "pass via CompletionRequest.systemPrompt instead"
        );
      }
      const role = m.role === "tool" ? "user" : m.role;
      return {
        role: role as "user" | "assistant",
        content: this.mapContentBlocksToAnthropic(m.content) as any,
      };
    });

    const tools: Anthropic.Tool[] | undefined =
      request.tools.length > 0
        ? request.tools.map((t) => ({
            name: t.name,
            description: t.description,
            input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
          }))
        : undefined;

    const response = await client.messages.create({
      model: request.model,
      system: request.systemPrompt,
      messages,
      tools,
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      stop_sequences: request.stopSequences,
    });

    const content: ContentBlock[] = response.content.map((b) => {
      if (b.type === "text") {
        return { type: "text", text: b.text };
      } else if (b.type === "tool_use") {
        return {
          type: "tool_use",
          id: b.id,
          name: b.name,
          input: b.input as Record<string, unknown>,
        };
      }
      throw new Error(`Unknown response block type: ${(b as any).type}`);
    });

    let stopReason: CompletionResponse["stopReason"] = "error";
    if (response.stop_reason === "end_turn") stopReason = "end_turn";
    else if (response.stop_reason === "tool_use") stopReason = "tool_use";
    else if (response.stop_reason === "max_tokens") stopReason = "max_tokens";
    else if (response.stop_reason === "stop_sequence") stopReason = "stop_sequence";

    return {
      content,
      stopReason,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
      // Never read response.raw outside of debugging — see ARCHITECTURE.md Section 5.2
      raw: response,
    };
  }

  async *stream(request: CompletionRequest): AsyncIterable<StreamEvent> {
    const client = this.getClient();

    const messages: Anthropic.MessageParam[] = request.messages.map((m) => {
      if (m.role === "system") {
        throw new Error(
          "System messages must not appear in the messages array — " +
          "pass via CompletionRequest.systemPrompt instead"
        );
      }
      const role = m.role === "tool" ? "user" : m.role;
      return {
        role: role as "user" | "assistant",
        content: this.mapContentBlocksToAnthropic(m.content) as any,
      };
    });

    const tools: Anthropic.Tool[] | undefined =
      request.tools.length > 0
        ? request.tools.map((t) => ({
            name: t.name,
            description: t.description,
            input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
          }))
        : undefined;

    const stream = await client.messages.create({
      model: request.model,
      system: request.systemPrompt,
      messages,
      tools,
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      stop_sequences: request.stopSequences,
      stream: true,
    });

    let currentToolUseId: string | null = null;

    for await (const chunk of stream) {
      switch (chunk.type) {
        case "content_block_start":
          if (chunk.content_block.type === "tool_use") {
            currentToolUseId = chunk.content_block.id;
            yield {
              type: "tool_use_start",
              data: {
                id: chunk.content_block.id,
                name: chunk.content_block.name,
              },
            };
          }
          break;

        case "content_block_delta":
          if (chunk.delta.type === "text_delta") {
            yield {
              type: "text_delta",
              data: { text: chunk.delta.text },
            };
          } else if (chunk.delta.type === "input_json_delta") {
            yield {
              type: "tool_use_delta",
              data: { partial_json: chunk.delta.partial_json },
            };
          }
          break;

        case "content_block_stop":
          if (currentToolUseId) {
            yield {
              type: "tool_use_end",
              data: { id: currentToolUseId },
            };
            currentToolUseId = null;
          }
          break;

        case "message_stop":
          yield {
            type: "message_stop",
            data: {},
          };
          break;
      }
    }
  }

  async validateConfig(): Promise<{ valid: boolean; message?: string }> {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key || key.trim() === "") {
      return {
        valid: false,
        message:
          "ANTHROPIC_API_KEY is not set. Run: export ANTHROPIC_API_KEY=sk-ant-...",
      };
    }
    return { valid: true };
  }
}
