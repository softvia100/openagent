import { AnthropicProvider } from "../src/providers/anthropic.js";
import { ModelMessage } from "../src/providers/provider.js";

async function main() {
  console.log("Starting tests...");

  // CHECK C — validateConfig
  console.log("\n=== CHECK C: validateConfig ===");
  const provider = new AnthropicProvider();
  
  const originalKey = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = "";
  
  const invalidResult = await provider.validateConfig();
  console.log("With no key:", invalidResult);
  if (invalidResult.valid !== false || !invalidResult.message?.includes("ANTHROPIC_API_KEY")) {
    throw new Error("Check C failed: Invalid config check did not behave as expected.");
  }

  process.env.ANTHROPIC_API_KEY = originalKey;
  const validResult = await provider.validateConfig();
  console.log("With key:", validResult);
  if (validResult.valid !== true) {
    throw new Error("Check C failed: Valid config check did not pass.");
  }
  
  console.log("CHECK C PASSED.");

  // CHECK A — Basic completion
  console.log("\n=== CHECK A: Basic completion ===");
  const reqA = {
    model: "claude-haiku-4-5",
    systemPrompt: "You are a helpful assistant.",
    messages: [{ role: "user" as const, content: [{ type: "text" as const, text: "Say hello in one word" }] }],
    tools: [],
    maxTokens: 100,
  };

  const resA = await provider.complete(reqA);
  console.log("Response content:", JSON.stringify(resA.content, null, 2));
  console.log("Stop reason:", resA.stopReason);
  
  if (resA.stopReason !== "end_turn") {
    throw new Error("Check A failed: Stop reason should be end_turn");
  }
  if (!resA.content.some((b) => b.type === "text")) {
    throw new Error("Check A failed: Response content should contain text block");
  }

  console.log("CHECK A PASSED.");

  // CHECK B — Tool use round trip
  console.log("\n=== CHECK B: Tool use round trip ===");
  const reqB1 = {
    model: "claude-haiku-4-5",
    systemPrompt: "You are a helpful assistant.",
    messages: [
      { 
        role: "user" as const, 
        content: [{ type: "text" as const, text: "What time is it? Use the get_time tool." }] 
      }
    ],
    tools: [
      {
        name: "get_time",
        description: "returns current time",
        inputSchema: { type: "object", properties: {}, required: [] }
      }
    ],
    maxTokens: 500,
  };

  const resB1 = await provider.complete(reqB1);
  console.log("Response 1 content:", JSON.stringify(resB1.content, null, 2));
  console.log("Stop reason 1:", resB1.stopReason);

  if (resB1.stopReason !== "tool_use") {
    throw new Error("Check B failed: First stop reason should be tool_use");
  }

  const toolUseBlock = resB1.content.find((b) => b.type === "tool_use");
  if (!toolUseBlock || toolUseBlock.type !== "tool_use" || toolUseBlock.name !== "get_time") {
    throw new Error("Check B failed: Did not return get_time tool use block");
  }

  const reqB2 = {
    ...reqB1,
    messages: [
      ...reqB1.messages,
      { role: "assistant" as const, content: resB1.content },
      { 
        role: "tool" as const, 
        content: [{ 
          type: "tool_result" as const, 
          toolUseId: toolUseBlock.id, 
          content: "14:32:00" 
        }] 
      }
    ]
  };

  const resB2 = await provider.complete(reqB2);
  console.log("Response 2 content:", JSON.stringify(resB2.content, null, 2));
  console.log("Stop reason 2:", resB2.stopReason);

  if (resB2.stopReason !== "end_turn") {
    throw new Error("Check B failed: Second stop reason should be end_turn");
  }
  const textBlock = resB2.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text" || !textBlock.text.includes("14:32")) {
    throw new Error("Check B failed: Second response should contain text mentioning the time");
  }

  console.log("CHECK B PASSED.");
}

main().catch(console.error);
