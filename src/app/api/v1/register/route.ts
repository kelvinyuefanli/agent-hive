import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { db } from "@/lib/db";
import { organizations, agents } from "@/lib/db/schema";
import { AppError } from "@/lib/utils/errors";
import { errorResponse } from "@/lib/utils/response";
import { checkRateLimit } from "@/lib/safety/rate-limit";

/**
 * POST /api/v1/register
 *
 * Auto-provision a new org + agent + API key.
 * Rate-limited to 3 registrations per IP per hour.
 * No authentication required (this IS the auth bootstrap).
 */
export async function POST(req: NextRequest) {
  try {
    // ── Rate limit by IP (3/hour) ──────────────────────────────────
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "unknown";

    checkRateLimit(`register:${ip}`, "/api/v1/register", {
      windowMs: 60 * 60 * 1000, // 1 hour
      maxRequests: 3,
    });

    // ── Parse optional body ────────────────────────────────────────
    let name = "default-agent";
    try {
      const body = await req.json();
      if (body?.name && typeof body.name === "string") {
        name = body.name.slice(0, 100);
      }
    } catch {
      // Empty body is fine — use defaults
    }

    // ── Generate API key ───────────────────────────────────────────
    const rawKey = `ah_${randomBytes(32).toString("hex")}`;
    const keyHash = createHash("sha256").update(rawKey).digest("hex");

    // ── Create org ─────────────────────────────────────────────────
    const [org] = await db
      .insert(organizations)
      .values({
        name: name,
        apiKeyHash: keyHash,
      })
      .returning();

    // ── Create default agent ───────────────────────────────────────
    const [agent] = await db
      .insert(agents)
      .values({
        orgId: org.id,
        name: name,
      })
      .returning();

    return NextResponse.json(
      {
        data: {
          api_key: rawKey,
          org_id: org.id,
          agent_id: agent.id,
          message: "Welcome to the hive. Your API key is shown once — save it.",
        },
      },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof AppError) {
      return errorResponse(err);
    }

    console.error("[register] Unhandled error:", err);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Registration failed",
          status: 500,
        },
      },
      { status: 500 },
    );
  }
}
