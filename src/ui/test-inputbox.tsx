import React from 'react';
import { render } from 'ink';
import { InputBox } from './InputBox.js';

process.stdin.setRawMode = () => { return process.stdin; };
process.stdin.isTTY = true;

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function runTest() {
  let submittedText = "";
  const { unmount } = render(
    <InputBox onSubmit={(text) => { submittedText = text; }} />
  );

  await delay(100);
  process.stdin.emit('keypress', 'h', { name: 'h', sequence: 'h' });
  await delay(50);
  process.stdin.emit('keypress', 'i', { name: 'i', sequence: 'i' });
  await delay(50);
  
  process.stdin.emit('keypress', '', { name: 'backspace' });
  await delay(50);
  
  process.stdin.emit('keypress', 'e', { name: 'e', sequence: 'e' });
  await delay(50);
  process.stdin.emit('keypress', 'l', { name: 'l', sequence: 'l' });
  await delay(50);
  process.stdin.emit('keypress', 'l', { name: 'l', sequence: 'l' });
  await delay(50);
  process.stdin.emit('keypress', 'o', { name: 'o', sequence: 'o' });
  await delay(50);
  
  process.stdin.emit('keypress', '', { name: 'return' });
  await delay(100);

  console.log("\n\n--- RESULTS NORMAL ---");
  console.log("Submitted:", submittedText);
  unmount();
  
  await delay(100);
  await testDisabled();
}

async function testDisabled() {
  let submittedTextDisabled = "was_empty";
  const { unmount } = render(
    <InputBox onSubmit={(text) => { submittedTextDisabled = text; }} disabled={true} />
  );

  await delay(100);
  process.stdin.emit('keypress', 'h', { name: 'h', sequence: 'h' });
  await delay(50);
  process.stdin.emit('keypress', '', { name: 'return' });
  await delay(100);
  
  console.log("\n\n--- RESULTS DISABLED ---");
  console.log("Submitted:", submittedTextDisabled);
  unmount();
}

runTest().catch(console.error);
