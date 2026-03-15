import { createHash } from "crypto";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { organizations, agents } from "@/lib/db/schema";
import { AuthError } from "@/lib/utils/errors";

export interface AuthResult {
  org: typeof organizations.$inferSelect;
  agent: typeof agents.$inferSelect | null;
}

/**
 * Verify API key from request headers and return the associated org + agent.
 *
 * Accepts:
 *   - Authorization: Bearer <key>
 *   - X-API-Key: <key>
 *
 * The key is SHA-256 hashed and looked up in the organizations table.
 */
export async function verifyApiKey(request: NextRequest): Promise<AuthResult> {
  const authHeader = request.headers.get("authorization");
  const apiKeyHeader = request.headers.get("x-api-key");

  let rawKey: string | null = null;

  if (authHeader?.startsWith("Bearer ")) {
    rawKey = authHeader.slice(7).trim();
  } else if (apiKeyHeader) {
    rawKey = apiKeyHeader.trim();
  }

  if (!rawKey) {
    throw new AuthError("Missing API key");
  }

  const keyPrefix = rawKey.slice(0, 8);
  const endpoint = request.nextUrl.pathname;
  console.log(
    `[auth] key_prefix=${keyPrefix} endpoint=${endpoint}`,
  );

  const keyHash = createHash("sha256").update(rawKey).digest("hex");

  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.apiKeyHash, keyHash))
    .limit(1);

  if (!org) {
    throw new AuthError("Invalid API key");
  }

  // Look up the first agent for this org (agent identity may be refined later)
  const [agent] = await db
    .select()
    .from(agents)
    .where(eq(agents.orgId, org.id))
    .limit(1);

  return { org, agent: agent ?? null };
}
