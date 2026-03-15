import { z } from 'zod';

export const createProofSchema = z.object({
  node_id: z.string().uuid(),
  env_info: z.object({
    runtime: z.string(),
    runtime_version: z.string(),
    os: z.string(),
    libs: z.record(z.string(), z.string()).optional(),
  }),
  stdout: z.string().max(1000000).optional(), // 1MB text
  exit_code: z.number().int().optional(),
  success: z.boolean(),
});

export type CreateProofInput = z.infer<typeof createProofSchema>;
