import React, { useState } from "react";
import { Box, Text, useInput } from "ink";

export interface InputBoxProps {
  onSubmit: (text: string) => void;
  disabled?: boolean;
}

export function InputBox({ onSubmit, disabled }: InputBoxProps) {
  const [text, setText] = useState("");

  useInput(
    (input, key) => {
      if (key.return) {
        onSubmit(text);
        setText("");
      } else if (key.backspace || key.delete) {
        setText((prev) => prev.slice(0, -1));
      } else if (input) {
        setText((prev) => prev + input);
      }
    },
    { isActive: !disabled }
  );

  return (
    <Box paddingX={1}>
      <Text color={disabled ? "gray" : "cyan"}>{"> "} </Text>
      {disabled ? (
        <Text color="gray" dimColor>...</Text>
      ) : (
        <Text>{text}<Text inverse> </Text></Text>
      )}
    </Box>
  );
}
