// ─── Safety Middleware ──────────────────────────────────────────────────────
// THE MOST IMPORTANT FILE. Every API route passes through this pipeline.
//
// Order of checks:
//   1. Rate limiting
//   2. Authentication
//   3. Size guard (POST/PUT)
//   4. Zod body validation
//   5. Secret scanning
//   6. Content sanitization
//   7. Handler execution
//   8. Error handling

import { NextRequest, NextResponse } from "next/server";
import type { ZodType } from "zod";
import { AppError } from "@/lib/utils/errors";
import { errorResponse } from "@/lib/utils/response";
import { verifyApiKey, type AuthResult } from "./auth";
import {
  checkRateLimit,
  RATE_LIMIT_DEFAULTS,
  type RateLimitConfig,
} from "./rate-limit";
import { checkRequestSize } from "./size-guard";
import { scanForSecrets } from "./secret-scanner";
import { sanitizeContent } from "./content-sandbox";
import { validateBody } from "./validate";
import { SecretDetectedError } from "@/lib/utils/errors";

export interface SafetyConfig {
  /** Zod schema for body validation (optional for GET requests). */
  schema?: ZodType;
  /** Rate limit configuration. Defaults based on HTTP method. */
  rateLimit?: RateLimitConfig;
  /** Whether authentication is required. Default: true. */
  requireAuth?: boolean;
  /** Whether to scan request body for secrets. Default: true for POST/PUT. */
  scanSecrets?: boolean;
  /** Whether to sanitize content. Default: true for POST/PUT. */
  sanitizeContent?: boolean;
}

export interface SafeHandlerArgs<T = unknown> {
  req: NextRequest;
  body: T;
  org: AuthResult["org"] | null;
  agent: AuthResult["agent"] | null;
}

export type SafeHandler<T = unknown> = (
  args: SafeHandlerArgs<T>,
  ctx: unknown,
) => Promise<NextResponse>;

/**
 * Wrap an API route handler with the full safety pipeline.
 *
 * Usage:
 * ```ts
 * export const POST = withSafety({
 *   schema: myZodSchema,
 *   requireAuth: true,
 * })((args) => {
 *   // args.body is typed & validated
 *   // args.org / args.agent are populated
 *   return successResponse(args.body);
 * });
 * ```
 */
export function withSafety<T = unknown>(config: SafetyConfig = {}) {
  const {
    schema,
    rateLimit,
    requireAuth = true,
    scanSecrets,
    sanitizeContent: sanitize,
  } = config;

  return (handler: SafeHandler<T>) =>
    async (req: NextRequest, ctx: unknown): Promise<NextResponse> => {
      try {
        const method = req.method.toUpperCase();
        const isMutating = method === "POST" || method === "PUT" || method === "PATCH";

        // Resolve per-request defaults
        const shouldScanSecrets = scanSecrets ?? isMutating;
        const shouldSanitize = sanitize ?? isMutating;
        const effectiveRateLimit =
          rateLimit ?? (isMutating ? RATE_LIMIT_DEFAULTS.write : RATE_LIMIT_DEFAULTS.read);

        // ── 1. Rate limit ──────────────────────────────────────────────
        // We need an org identifier; for unauthenticated routes we use IP.
        let orgId = "anonymous";
        let org: AuthResult["org"] | null = null;
        let agent: AuthResult["agent"] | null = null;

        if (requireAuth) {
          // ── 2. Auth check ────────────────────────────────────────────
          const authResult = await verifyApiKey(req);
          org = authResult.org;
          agent = authResult.agent;
          orgId = org.id;
        }

        checkRateLimit(orgId, req.nextUrl.pathname, effectiveRateLimit);

        // ── 3. Size guard (mutating requests) ──────────────────────────
        if (isMutating) {
          checkRequestSize(req);
        }

        // ── 4. Body parsing & Zod validation ───────────────────────────
        let body: T = undefined as T;

        if (schema && isMutating) {
          let rawBody: unknown;
          try {
            rawBody = await req.json();
          } catch {
            throw new AppError("Invalid JSON body", "VALIDATION_FAILED", 400);
          }
          body = validateBody<T>(schema as ZodType<T>, rawBody);
        } else if (schema && !isMutating) {
          // For GET with schema, validate search params as an object
          const params = Object.fromEntries(req.nextUrl.searchParams.entries());
          body = validateBody<T>(schema as ZodType<T>, params);
        }

        // ── 5. Secret scanning ─────────────────────────────────────────
        if (shouldScanSecrets && body != null) {
          const textToScan = typeof body === "string" ? body : JSON.stringify(body);
          const scanResult = scanForSecrets(textToScan);
          if (scanResult.found) {
            console.error(
              `[secret-scanner] Blocked request to ${req.nextUrl.pathname}: detected patterns [${scanResult.patterns.join(", ")}]`,
            );
            throw new SecretDetectedError(
              `Request blocked: secret material detected (${scanResult.patterns.join(", ")})`,
            );
          }
        }

        // ── 6. Content sanitization ────────────────────────────────────
        if (shouldSanitize && body != null && typeof body === "object") {
          sanitizeObjectStrings(body as Record<string, unknown>);
        }

        // ── 7. Call the handler ────────────────────────────────────────
        return await handler({ req, body, org, agent }, ctx);
      } catch (err) {
        // ── 8. Error handling ──────────────────────────────────────────
        if (err instanceof AppError) {
          return errorResponse(err);
        }

        // ── 9. Unknown errors → 500 ───────────────────────────────────
        console.error("[safety-middleware] Unhandled error:", err);
        return NextResponse.json(
          {
            error: {
              code: "INTERNAL_ERROR",
              message: "An unexpected error occurred",
              status: 500,
            },
          },
          { status: 500 },
        );
      }
    };
}

/**
 * Recursively sanitize all string values in an object.
 * Mutates the object in place for efficiency.
 */
function sanitizeObjectStrings(obj: Record<string, unknown>): void {
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    if (typeof value === "string") {
      const { sanitized, patternsStripped } = sanitizeContent(value);
      if (patternsStripped.length > 0) {
        console.warn(
          `[content-sandbox] Stripped patterns from field "${key}": [${patternsStripped.join(", ")}]`,
        );
      }
      obj[key] = sanitized;
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      sanitizeObjectStrings(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        if (typeof value[i] === "string") {
          const { sanitized, patternsStripped } = sanitizeContent(value[i]);
          if (patternsStripped.length > 0) {
            console.warn(
              `[content-sandbox] Stripped patterns from field "${key}[${i}]": [${patternsStripped.join(", ")}]`,
            );
          }
          value[i] = sanitized;
        } else if (value[i] && typeof value[i] === "object") {
          sanitizeObjectStrings(value[i] as Record<string, unknown>);
        }
      }
    }
  }
}
