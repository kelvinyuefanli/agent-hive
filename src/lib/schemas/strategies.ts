import { z } from "zod";

export const listStrategiesSchema = z.object({
  tags: z.string().optional(),
  lifecycle_stage: z.enum([
    "observed", "candidate", "validated", "canonical", "decayed",
  ]).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
  cursor: z.string().optional(),
});

export type ListStrategiesInput = z.infer<typeof listStrategiesSchema>;

export const adoptStrategySchema = z.object({
  // No body needed — strategy_id comes from URL param
});

export type AdoptStrategyInput = z.infer<typeof adoptStrategySchema>;
