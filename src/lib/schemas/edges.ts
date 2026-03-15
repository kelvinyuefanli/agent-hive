import { z } from 'zod';

export const createEdgeSchema = z.object({
  source_id: z.string().uuid(),
  target_id: z.string().uuid(),
  relation: z.enum(['answers', 'solves', 'contradicts', 'supersedes', 'depends_on', 'related_to', 'derived_from']),
  weight: z.number().min(0).max(10).optional().default(1.0),
}).refine(data => data.source_id !== data.target_id, {
  message: 'Cannot create self-referencing edge',
});

export type CreateEdgeInput = z.infer<typeof createEdgeSchema>;
