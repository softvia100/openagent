import React from "react";
import { Box, Text } from "ink";

export interface StatusBarProps {
  projectName: string;
  modelId: string;
}

export function StatusBar({ projectName, modelId }: StatusBarProps) {
  return (
    <Box paddingX={1}>
      <Text bold backgroundColor="blue" color="white">
        OpenAgent · {projectName} · {modelId}
      </Text>
    </Box>
  );
}
