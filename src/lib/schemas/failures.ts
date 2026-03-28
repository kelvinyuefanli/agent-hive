import { z } from "zod";

export const createFailureSchema = z.object({
  error_type: z.enum([
    "api_error", "rate_limit", "timeout", "auth_failure",
    "version_incompatible", "dependency_missing", "runtime_error", "other",
  ]),
  service: z.string().min(1).max(200),
  message: z.string().min(1).max(2000),
  environment: z.object({
    runtime: z.string().optional(),
    os: z.string().optional(),
    libs: z.record(z.string(), z.string()).optional(),
  }).optional(),
});

export type CreateFailureInput = z.infer<typeof createFailureSchema>;
