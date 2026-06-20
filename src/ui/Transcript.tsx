import React from "react";
import { Box, Text } from "ink";

export interface TranscriptMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  text: string;
  toolName?: string;
}

export interface TranscriptProps {
  messages: TranscriptMessage[];
}

export function Transcript({ messages }: TranscriptProps) {
  return (
    <Box flexDirection="column">
      {messages.map((msg, index) => {
        const isLast = index === messages.length - 1;
        return (
          <Box key={msg.id} flexDirection="column" marginBottom={isLast ? 0 : 1}>
            {msg.role === "user" && (
              <Text color="cyan">{"> "} {msg.text}</Text>
            )}
            {msg.role === "assistant" && (
              <Text>● {msg.text}</Text>
            )}
            {msg.role === "tool" && (
              <Box paddingLeft={2}>
                <Text color="gray" dimColor>
                  [tool: {msg.toolName}] {msg.text}
                </Text>
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
