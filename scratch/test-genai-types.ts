import { GoogleGenAI, Type, Content, Part, Tool } from "@google/genai";

const part: Part = { text: "hello" };
const content: Content = { role: "user", parts: [part] };
const tool: Tool = { functionDeclarations: [{ name: "test", description: "test", parameters: { type: Type.OBJECT } }] };
