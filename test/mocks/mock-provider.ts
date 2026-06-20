import { Provider, ModelInfo, CompletionRequest, CompletionResponse, StreamEvent } from "../../src/providers/provider.js";

export class MockProvider implements Provider {
  readonly id = "mock";
  readonly displayName = "Mock Provider";

  private responseQueue: CompletionResponse[] = [];
  private callLog: CompletionRequest[] = [];

  queueResponse(response: CompletionResponse): void {
    this.responseQueue.push(response);
  }

  getCalls(): CompletionRequest[] {
    return this.callLog;
  }

  reset(): void {
    this.responseQueue = [];
    this.callLog = [];
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    if (this.responseQueue.length === 0) {
      throw new Error("MockProvider queue is empty — did you forget to queueResponse()?");
    }
    this.callLog.push(request);
    return this.responseQueue.shift()!;
  }

  async *stream(request: CompletionRequest): AsyncIterable<StreamEvent> {
    if (this.responseQueue.length === 0) {
      throw new Error("MockProvider queue is empty — did you forget to queueResponse()?");
    }
    this.callLog.push(request);
    const res = this.responseQueue.shift()!;

    for (const block of res.content) {
      if (block.type === "text") {
        const mid = Math.floor(block.text.length / 2);
        if (mid > 0) {
          yield { type: "text_delta", data: { text: block.text.substring(0, mid) } };
          yield { type: "text_delta", data: { text: block.text.substring(mid) } };
        } else {
          yield { type: "text_delta", data: { text: block.text } };
        }
      } else if (block.type === "tool_use") {
        yield { type: "tool_use_start", data: { id: block.id, name: block.name } };
        const jsonStr = JSON.stringify(block.input);
        const mid = Math.floor(jsonStr.length / 2);
        if (mid > 0) {
          yield { type: "tool_use_delta", data: { partial_json: jsonStr.substring(0, mid) } };
          yield { type: "tool_use_delta", data: { partial_json: jsonStr.substring(mid) } };
        } else {
          yield { type: "tool_use_delta", data: { partial_json: jsonStr } };
        }
        yield { type: "tool_use_end", data: { id: block.id } };
      }
    }
    yield { type: "message_stop", data: {} };
  }

  async listModels(): Promise<ModelInfo[]> {
    return [];
  }

  async validateConfig(): Promise<{ valid: boolean }> {
    return { valid: true };
  }
}
