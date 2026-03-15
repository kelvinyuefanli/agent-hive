import { withSafety } from "@/lib/safety/middleware";
import { db } from "@/lib/db";
import { successResponse } from "@/lib/utils/response";
import { sql } from "drizzle-orm";

export const GET = withSafety({
  requireAuth: false,
})(async () => {
  // Get all wanted nodes with aggregated search signal counts
  const wantedRows = await db.execute(sql`
    SELECT
      kn.id,
      kn.title AS query,
      kn.tags,
      kn.created_at AS created,
      COALESCE(ss.search_count, 0)::int AS search_count,
      COALESCE(ss.unique_agents, 0)::int AS unique_agents,
      CASE
        WHEN EXISTS (
          SELECT 1 FROM knowledge_nodes other
          WHERE other.type != 'wanted'
            AND other.tags && kn.tags
            AND array_length(kn.tags, 1) > 0
        ) THEN 'filled'
        ELSE 'open'
      END AS status
    FROM knowledge_nodes kn
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)::int AS search_count,
        COUNT(DISTINCT agent_id)::int AS unique_agents
      FROM search_signals
      WHERE query_normalized = LOWER(TRIM(kn.title))
    ) ss ON true
    WHERE kn.type = 'wanted'
    ORDER BY kn.created_at DESC
  `);

  const signals = (Array.from(wantedRows) as Record<string, unknown>[]).map((row) => ({
    id: row.id,
    query: row.query,
    search_count: row.search_count,
    unique_agents: row.unique_agents,
    created: row.created,
    status: row.status,
    tags: row.tags ?? [],
  }));

  return successResponse({ signals });
});
