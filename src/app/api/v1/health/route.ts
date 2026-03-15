import { NextResponse } from "next/server";
import { withSafety } from "@/lib/safety/middleware";
import { db } from "@/lib/db";
import { knowledgeNodes, agents } from "@/lib/db/schema";
import { successResponse } from "@/lib/utils/response";
import { sql } from "drizzle-orm";

const startTime = Date.now();

export const GET = withSafety({
  requireAuth: false,
})(async () => {
  const timestamp = new Date().toISOString();
  const uptimeMs = Date.now() - startTime;

  try {
    // Database connectivity check + counts in a single query
    const [result] = await db.execute(sql`
      SELECT
        1 AS db_ok,
        (SELECT COUNT(*)::int FROM knowledge_nodes) AS node_count,
        (SELECT COUNT(*)::int FROM agents) AS agent_count
    `);

    const { node_count, agent_count } = result as Record<string, number>;

    return successResponse({
      status: "ok",
      timestamp,
      database: "connected",
      node_count,
      agent_count,
      uptime_ms: uptimeMs,
    });
  } catch (err) {
    console.error("[health] Database check failed:", err);
    return NextResponse.json(
      {
        data: {
          status: "degraded",
          timestamp,
          database: "unreachable",
          node_count: null,
          agent_count: null,
          uptime_ms: uptimeMs,
        },
      },
      { status: 503 },
    );
  }
});
