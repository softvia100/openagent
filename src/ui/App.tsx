import React, { useState, useEffect, useRef } from "react";
import { Box, Text } from "ink";
import { StatusBar } from "./StatusBar.js";
import { Transcript, TranscriptMessage } from "./Transcript.js";
import { InputBox } from "./InputBox.js";
import { v4 as uuidv4 } from "uuid";
import { Agent, AgentConfig } from "../core/agent.js";
import { AgentEventBus, AgentEvent } from "../core/events.js";
import { Provider, ModelMessage } from "../providers/provider.js";
import { ApprovalPrompt } from "./ApprovalPrompt.js";
import { ToolExecutor, PermissionResolver } from "../core/tool-executor.js";

export interface AppProps {
  projectName: string;
  modelId: string;
  provider: Provider;
  agentConfig: AgentConfig;
}

export function App({ projectName, modelId, provider, agentConfig }: AppProps) {
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const [pendingApproval, setPendingApproval] = useState<{
    toolName: string;
    input: Record<string, unknown>;
    reason: string;
    agentId: string;
    resolve: (decision: "allow" | "deny") => void;
  } | null>(null);

  const eventBusRef = useRef<AgentEventBus | null>(null);
  const agentRef = useRef<Agent | null>(null);

  if (!agentRef.current) {
    eventBusRef.current = new AgentEventBus();
    const resolvePermission: PermissionResolver = (request) => {
      return new Promise((resolve) => {
        setPendingApproval({ ...request, resolve });
      });
    };
    const toolExecutor = new ToolExecutor(agentConfig.tools, resolvePermission);
    agentRef.current = new Agent(
      agentConfig,
      provider,
      toolExecutor,
      eventBusRef.current
    );
  }

  const agent = agentRef.current!;
  const eventBus = eventBusRef.current!;

  const activeAssistantIdRef = useRef<string | null>(null);
  const toolCallIdsRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    function handleEvent(event: AgentEvent) {
      if (event.type === "text_delta") {
        setMessages((prev) => {
          const currentId = activeAssistantIdRef.current;
          if (!currentId) {
            const newId = uuidv4();
            activeAssistantIdRef.current = newId;
            return [...prev, { id: newId, role: "assistant", text: event.text }];
          }
          return prev.map((msg) =>
            msg.id === currentId ? { ...msg, text: msg.text + event.text } : msg
          );
        });
      } else if (event.type === "tool_call_start") {
        const newId = uuidv4();
        toolCallIdsRef.current.set(event.toolName, newId);
        setMessages((prev) => [
          ...prev,
          { id: newId, role: "tool", text: `Running...`, toolName: event.toolName },
        ]);
      } else if (event.type === "tool_call_end") {
        const msgId = toolCallIdsRef.current.get(event.record.toolName);
        if (msgId) {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === msgId
                ? {
                    ...msg,
                    text: event.record.result.isError
                      ? `failed: ${event.record.result.resultText}`
                      : `completed`,
                  }
                : msg
            )
          );
        }
      } else if (event.type === "turn_complete") {
        activeAssistantIdRef.current = null;
        toolCallIdsRef.current.clear();
      }
    }

    eventBus.on("agent_event", handleEvent);
    return () => {
      eventBus.off("agent_event", handleEvent);
    };
  }, [eventBus]);

  async function handleSubmit(text: string) {
    setMessages((prev) => [...prev, { id: uuidv4(), role: "user", text }]);
    setIsProcessing(true);

    try {
      const history: ModelMessage[] = messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: [{ type: "text", text: m.text }],
        }));

      await agent.runStreaming(text, history);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          id: uuidv4(),
          role: "assistant",
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ]);
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <Box flexDirection="column" width="100%">
      <StatusBar projectName={projectName} modelId={modelId} />
      <Box borderStyle="single" padding={1} flexDirection="column" minHeight={3}>
        {messages.length === 0 ? (
          <Text color="gray">(message history renders here — empty for now)</Text>
        ) : (
          <Transcript messages={messages} />
        )}
      </Box>
      <InputBox onSubmit={handleSubmit} disabled={isProcessing || pendingApproval !== null} />
      {pendingApproval && (
        <ApprovalPrompt
          toolName={pendingApproval.toolName}
          input={pendingApproval.input}
          reason={pendingApproval.reason}
          agentId={pendingApproval.agentId}
          isActive={true}
          onDecision={(decision) => {
            pendingApproval.resolve(decision);
            setPendingApproval(null);
          }}
        />
      )}
    </Box>
  );
}
