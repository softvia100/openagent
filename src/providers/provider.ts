export interface ModelMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: ContentBlock[];
}

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; toolUseId: string; content: string; isError?: boolean }
  | { type: "image"; mimeType: string; data: string }; // base64

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>; // JSON Schema
}

export interface CompletionRequest {
  model: string;
  systemPrompt: string;
  messages: ModelMessage[];
  tools: ToolDefinition[];
  maxTokens: number;
  temperature?: number;
  stopSequences?: string[];
}

export interface CompletionResponse {
  content: ContentBlock[];
  stopReason: "end_turn" | "tool_use" | "max_tokens" | "stop_sequence" | "error";
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  raw?: unknown; // original provider response, for debugging only — never depended on elsewhere
}

export interface StreamEvent {
  type: "text_delta" | "tool_use_start" | "tool_use_delta" | "tool_use_end" | "message_stop";
  data: unknown;
}

export interface Provider {
  /** Stable identifier, e.g. "anthropic", "openai", "ollama" */
  readonly id: string;

  /** Human-readable name shown in the TUI/config, e.g. "Anthropic" */
  readonly displayName: string;

  /** List of model identifiers this provider can serve, for config validation and UI pickers */
  listModels(): Promise<ModelInfo[]>;

  /** Non-streaming completion call */
  complete(request: CompletionRequest): Promise<CompletionResponse>;

  /** Streaming completion call — required for responsive TUI output */
  stream(request: CompletionRequest): AsyncIterable<StreamEvent>;

  /** Validate that credentials/config are present and usable, without making a billed call if avoidable */
  validateConfig(): Promise<{ valid: boolean; message?: string }>;
}

export interface ModelInfo {
  id: string;
  displayName: string;
  contextWindow: number;
  maxOutputTokens: number;
  supportsImages: boolean;
  supportsTools: boolean; // should always be true for any model usable in OpenAgent
  costPerMillionInputTokens?: number;
  costPerMillionOutputTokens?: number;
}
