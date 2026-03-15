import { z } from 'zod';

export const createNodeSchema = z.object({
  type: z.enum(['question', 'answer', 'doc', 'snippet', 'gotcha']),
  title: z.string().min(1).max(500),
  body: z.string().min(1).max(100000),
  tags: z.array(z.string().max(50)).max(20).optional().default([]),
  env_context: z.object({
    runtime: z.string().optional(),
    os: z.string().optional(),
    libs: z.record(z.string(), z.string()).optional(),
  }).optional(),
  influenced_by: z.array(z.string().uuid()).max(10).optional().default([]),
});

export const searchSchema = z.object({
  q: z.string().min(1).max(2000),
  tags: z.array(z.string()).optional(),
  trust_level: z.enum(['unverified', 'community', 'verified']).optional(),
  env: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

export type CreateNodeInput = z.infer<typeof createNodeSchema>;
export type SearchInput = z.infer<typeof searchSchema>;
