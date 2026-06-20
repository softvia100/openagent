import React from "react";
import { Box, Text, useInput } from "ink";

export interface ApprovalPromptProps {
  toolName: string;
  input: Record<string, unknown>;
  reason: string;
  agentId: string;
  onDecision: (decision: "allow" | "deny") => void;
  isActive: boolean;
}

export function ApprovalPrompt({
  toolName,
  input,
  reason,
  agentId,
  onDecision,
  isActive,
}: ApprovalPromptProps) {
  useInput(
    (inputChar, key) => {
      if (inputChar.toLowerCase() === "y") {
        onDecision("allow");
      } else if (inputChar.toLowerCase() === "n") {
        onDecision("deny");
      }
    },
    { isActive }
  );

  const inputStr = JSON.stringify(input, null, 2);

  return (
    <Box flexDirection="column" borderStyle="single" padding={1} borderColor="yellow">
      <Text color="yellow" bold>Permission Required</Text>
      <Box flexDirection="column" marginTop={1} marginBottom={1}>
        <Text><Text bold>Agent:</Text> {agentId}</Text>
        <Text><Text bold>Tool:</Text> {toolName}</Text>
        <Text><Text bold>Reason:</Text> {reason}</Text>
        <Text><Text bold>Input:</Text> {inputStr}</Text>
      </Box>
      <Text bold>[y] Allow   [n] Deny</Text>
    </Box>
  );
}
