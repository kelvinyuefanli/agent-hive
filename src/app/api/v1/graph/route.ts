import { withSafety } from "@/lib/safety/middleware";
import { db } from "@/lib/db";
import { successResponse } from "@/lib/utils/response";
import { sql } from "drizzle-orm";

export const GET = withSafety({
  requireAuth: false,
})(async () => {
  // Single query: top 200 nodes + their interconnecting edges (capped at 2000)
  const result = await db.execute(sql`
    WITH top_nodes AS (
      SELECT id, title AS label, type, score, trust_level AS trust
      FROM knowledge_nodes
      ORDER BY score DESC
      LIMIT 200
    ),
    top_edges AS (
      SELECT e.source_id AS source, e.target_id AS target, e.relation
      FROM knowledge_edges e
      INNER JOIN top_nodes s ON e.source_id = s.id
      INNER JOIN top_nodes t ON e.target_id = t.id
      LIMIT 2000
    )
    SELECT 'node' AS _kind, id, label, type, score, trust, NULL AS source, NULL AS target, NULL AS relation FROM top_nodes
    UNION ALL
    SELECT 'edge' AS _kind, NULL, NULL, NULL, NULL, NULL, source, target, relation FROM top_edges
  `);

  const rows = Array.from(result) as Record<string, unknown>[];
  const nodes = rows.filter((r) => r._kind === "node").map(({ _kind, source, target, relation, ...n }) => n);
  const edges = rows.filter((r) => r._kind === "edge").map(({ _kind, id, label, type, score, trust, ...e }) => e);

  return successResponse({ nodes, edges });
});
