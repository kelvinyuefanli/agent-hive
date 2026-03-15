import type { ZodType } from "zod";
import { ValidationError } from "@/lib/utils/errors";

/**
 * Parse and validate a request body against a Zod schema.
 *
 * On success: returns the parsed (typed) data.
 * On failure: throws a ValidationError with field-level details.
 */
export function validateBody<T>(schema: ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);

  if (result.success) {
    return result.data;
  }

  const fields = result.error.issues.map((issue) => ({
    path: issue.path.map(String).join("."),
    message: issue.message,
  }));

  throw new ValidationError("Request body validation failed", fields);
}
