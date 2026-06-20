import React from "react";
import { render } from "ink";
import { App } from "./App.js";

const { waitUntilExit } = render(
  <App 
    projectName="test" 
    modelId="claude-haiku-4-5" 
    provider={null as any} 
    agentConfig={null as any} 
  />
);

await waitUntilExit();
