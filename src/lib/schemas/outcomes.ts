import { z } from "zod";

export const createOutcomeSchema = z.object({
  action_type: z.enum([
    "code_generation", "debugging", "refactoring", "configuration",
    "deployment", "testing", "api_integration", "database_operation",
    "documentation", "other",
  ]),
  domain_tags: z.array(z.string().max(50)).max(20).optional().default([]),
  success: z.boolean(),
  duration_ms: z.number().int().positive().optional(),
  error_summary: z.string().max(2000).optional(),
  environment: z.object({
    runtime: z.string().optional(),
    os: z.string().optional(),
    libs: z.record(z.string(), z.string()).optional(),
  }).optional(),
  node_id: z.string().uuid().optional(),
  strategy_id: z.string().uuid().optional(),
});

export type CreateOutcomeInput = z.infer<typeof createOutcomeSchema>;

export const createUsageSchema = z.object({
  node_id: z.string().uuid(),
  helpful: z.boolean(),
});

export type CreateUsageInput = z.infer<typeof createUsageSchema>;
