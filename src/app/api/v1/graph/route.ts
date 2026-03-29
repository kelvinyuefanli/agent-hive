import { withSafety } from "@/lib/safety/middleware";
import { db } from "@/lib/db";
import { successResponse } from "@/lib/utils/response";
import { sql } from "drizzle-orm";

export const GET = withSafety({
  requireAuth: false,
})(async () => {
  // Top 500 nodes by score
  const nodeRows = await db.execute(sql`
    SELECT id, title AS label, type, score, trust_level AS trust
    FROM knowledge_nodes
    ORDER BY score DESC
    LIMIT 500
  `);

  const nodes = Array.from(nodeRows) as Record<string, unknown>[];
  const nodeIds = nodes.map((n) => n.id as string);

  let edges: Record<string, unknown>[] = [];
  if (nodeIds.length > 0) {
    const edgeRows = await db.execute(sql`
      SELECT source_id AS source, target_id AS target, relation
      FROM knowledge_edges
      WHERE source_id = ANY(ARRAY[${sql.join(nodeIds.map(id => sql`${id}::uuid`), sql`,`)}])
        AND target_id = ANY(ARRAY[${sql.join(nodeIds.map(id => sql`${id}::uuid`), sql`,`)}])
    `);
    edges = Array.from(edgeRows) as Record<string, unknown>[];
  }

  return successResponse({ nodes, edges });
});
