// Phase 1 subset only. Full schema in ARCHITECTURE.md Section 18.3.
// Teams, approvals, verifier, skills, autonomy, ui config are 
// later phases — do not add them here yet.

import { z } from "zod";

export const ModelAssignmentSchema = z.object({
  providerId: z.string(),
  modelId: z.string(),
});

export const OpenAgentConfigSchema = z.object({
  defaultModel: ModelAssignmentSchema,
});

export type ModelAssignment = z.infer<typeof ModelAssignmentSchema>;
export type OpenAgentConfig = z.infer<typeof OpenAgentConfigSchema>;
