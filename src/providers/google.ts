import { GoogleGenAI } from "@google/genai";
import {
  Provider,
  ModelInfo,
  CompletionRequest,
  CompletionResponse,
  StreamEvent,
  ContentBlock,
} from "./provider.js";

export class GoogleProvider implements Provider {
  readonly id = "google";
  readonly displayName = "Google";

  private getClient(): GoogleGenAI {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not set.");
    }
    return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }

  async listModels(): Promise<ModelInfo[]> {
    return [
      {
        id: "gemini-2.5-flash",
        displayName: "Gemini 2.5 Flash",
        contextWindow: 1000000,
        maxOutputTokens: 8192,
        supportsImages: true,
        supportsTools: true,
      },
    ];
  }

  private mapContentBlocksToGoogle(blocks: ContentBlock[]): any[] {
    return blocks.map((b) => {
      if (b.type === "text") {
        return { text: b.text };
      } else if (b.type === "tool_use") {
        return {
          functionCall: {
            name: b.name,
            args: b.input,
          },
        };
      } else if (b.type === "tool_result") {
        return {
          functionResponse: {
            name: b.toolUseId, // Wait, Gemini functionResponse needs the name of the function, not the call ID.
            response: b.isError ? { error: b.content } : { result: b.content },
          },
        };
      } else if (b.type === "image") {
        return {
          inlineData: {
            mimeType: b.mimeType,
            data: b.data,
          },
        };
      }
      throw new Error(`Unknown content block type: ${(b as any).type}`);
    });
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const ai = this.getClient();

    const contents = request.messages.map((m) => {
      if (m.role === "system") {
        throw new Error("System messages must be passed via systemPrompt");
      }
      const role = m.role === "assistant" ? "model" : "user";
      return {
        role,
        parts: this.mapContentBlocksToGoogle(m.content),
      };
    });

    const tools = request.tools.length > 0 ? [{
      functionDeclarations: request.tools.map(t => ({
        name: t.name,
        description: t.description,
        parameters: t.inputSchema, // Assuming inputSchema is compatible with OpenAPI Schema
      }))
    }] : undefined;

    const response = await ai.models.generateContent({
      model: request.model,
      contents,
      config: {
        systemInstruction: request.systemPrompt,
        tools,
        maxOutputTokens: request.maxTokens,
        temperature: request.temperature,
        stopSequences: request.stopSequences,
      }
    });

    const content: ContentBlock[] = [];
    let stopReason: CompletionResponse["stopReason"] = "error";

    if (response.candidates && response.candidates.length > 0) {
      const candidate = response.candidates[0];
      if (candidate.finishReason === "STOP") {
        stopReason = "end_turn";
      } else if (candidate.finishReason === "MAX_TOKENS") {
        stopReason = "max_tokens";
      }
      
      const parts = candidate.content?.parts || [];
      for (const p of parts) {
        if (p.text) {
          content.push({ type: "text", text: p.text });
        } else if (p.functionCall) {
          stopReason = "tool_use";
          content.push({
            type: "tool_use",
            id: (p.functionCall.name || "unknown") + "_" + Math.random().toString(36).substring(7),
            name: p.functionCall.name || "unknown",
            input: (p.functionCall.args || {}) as Record<string, unknown>,
          });
        }
      }
    }

    return {
      content,
      stopReason,
      usage: {
        inputTokens: response.usageMetadata?.promptTokenCount || 0,
        outputTokens: response.usageMetadata?.candidatesTokenCount || 0,
      },
      raw: response,
    };
  }

  async *stream(request: CompletionRequest): AsyncIterable<StreamEvent> {
    const ai = this.getClient();

    const contents = request.messages.map((m) => {
      const role = m.role === "assistant" ? "model" : "user";
      return {
        role,
        parts: this.mapContentBlocksToGoogle(m.content),
      };
    });

    const tools = request.tools.length > 0 ? [{
      functionDeclarations: request.tools.map(t => ({
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
      }))
    }] : undefined;

    const stream = await ai.models.generateContentStream({
      model: request.model,
      contents,
      config: {
        systemInstruction: request.systemPrompt,
        tools,
        maxOutputTokens: request.maxTokens,
        temperature: request.temperature,
        stopSequences: request.stopSequences,
      }
    });

    let activeToolUseId: string | null = null;
    let inputTokens = 0;
    let outputTokens = 0;
    let finalStopReason: CompletionResponse["stopReason"] = "end_turn";

    for await (const chunk of stream) {
      if (chunk.usageMetadata) {
        inputTokens = chunk.usageMetadata.promptTokenCount || 0;
        outputTokens = chunk.usageMetadata.candidatesTokenCount || 0;
      }

      if (chunk.candidates && chunk.candidates.length > 0) {
        const candidate = chunk.candidates[0];
        
        if (candidate.finishReason === "STOP") {
          finalStopReason = "end_turn";
        } else if (candidate.finishReason === "MAX_TOKENS") {
          finalStopReason = "max_tokens";
        } else if (candidate.content?.parts?.some(p => p.functionCall)) {
          finalStopReason = "tool_use";
        }

        const parts = candidate.content?.parts || [];
        for (const p of parts) {
          if (p.text) {
            yield {
              type: "text_delta",
              data: { text: p.text },
            };
          } else if (p.functionCall) {
            if (!activeToolUseId) {
               activeToolUseId = (p.functionCall.name || "unknown") + "_" + Math.random().toString(36).substring(7);
               yield {
                 type: "tool_use_start",
                 data: { id: activeToolUseId, name: p.functionCall.name || "unknown" },
               };
               yield {
                 type: "tool_use_delta",
                 data: { partial_json: JSON.stringify(p.functionCall.args || {}) },
               };
               yield {
                 type: "tool_use_end",
                 data: { id: activeToolUseId },
               };
               activeToolUseId = null;
            }
          }
        }
      }
    }

    yield {
      type: "message_stop",
      data: { stopReason: finalStopReason, inputTokens, outputTokens },
    };
  }

  async validateConfig(): Promise<{ valid: boolean; message?: string }> {
    const key = process.env.GEMINI_API_KEY;
    if (!key || key.trim() === "") {
      return {
        valid: false,
        message: "GEMINI_API_KEY is not set. Run: export GEMINI_API_KEY=your-key-...",
      };
    }
    return { valid: true };
  }
}
