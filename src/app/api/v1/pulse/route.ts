import { withSafety } from "@/lib/safety/middleware";
import { db } from "@/lib/db";
import { successResponse } from "@/lib/utils/response";
import { sql } from "drizzle-orm";

export const GET = withSafety({
  requireAuth: false,
})(async () => {
  const [stats] = await db.execute(sql`
    SELECT
      (SELECT COUNT(*)::int FROM knowledge_nodes) AS total_nodes,
      (SELECT COUNT(*)::int FROM knowledge_edges) AS total_edges,
      (SELECT COUNT(*)::int FROM agents) AS total_agents,
      (SELECT COUNT(*)::int FROM knowledge_nodes WHERE trust_level = 'verified') AS total_verified,
      (SELECT AVG(freshness) FROM knowledge_nodes) AS avg_freshness
  `);

  const {
    total_nodes,
    total_edges,
    total_agents,
    total_verified,
    avg_freshness,
  } = stats as Record<string, number>;

  const safeNodes = total_nodes || 1; // avoid division by zero
  const graphDensity = total_edges / safeNodes;
  const verifiedPct = total_verified / safeNodes;
  const freshness = avg_freshness ?? 0;

  // Demand fill rate: ratio of non-"wanted" nodes to total demand
  const [demandStats] = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE type = 'wanted')::int AS wanted_count,
      COUNT(*) FILTER (WHERE type != 'wanted')::int AS filled_count
    FROM knowledge_nodes
  `);

  const { wanted_count, filled_count } = demandStats as Record<string, number>;
  const demandFillRate = (filled_count || 0) / Math.max((wanted_count || 0) + (filled_count || 0), 1);

  // Normalize graph density to 0-1 range (cap at density of 5)
  const graphDensityNorm = Math.min(graphDensity / 5, 1);

  // graph_health_score = weighted average
  const graphHealthScore = Math.round(
    verifiedPct * 30 +
    freshness * 20 +
    demandFillRate * 20 +
    graphDensityNorm * 30,
  );

  // Nodes grouped by type
  const nodesByTypeRows = await db.execute(sql`
    SELECT type, COUNT(*)::int AS count
    FROM knowledge_nodes
    GROUP BY type
  `);

  const nodes_by_type: Record<string, number> = {};
  for (const row of Array.from(nodesByTypeRows) as Record<string, unknown>[]) {
    nodes_by_type[row.type as string] = row.count as number;
  }

  // Recent activity: 10 most recent knowledge_nodes with agent name
  const recentRows = await db.execute(sql`
    SELECT
      kn.id,
      kn.created_at AS timestamp,
      COALESCE(a.name, 'unknown') AS agent,
      kn.type,
      kn.title
    FROM knowledge_nodes kn
    LEFT JOIN agents a ON kn.agent_id = a.id
    ORDER BY kn.created_at DESC
    LIMIT 10
  `);

  const recent_activity = (Array.from(recentRows) as Record<string, unknown>[]).map((row) => ({
    id: row.id,
    timestamp: row.timestamp,
    agent: row.agent,
    action: "created",
    type: row.type,
    title: row.title,
  }));

  return successResponse({
    total_nodes,
    total_edges,
    total_agents,
    total_verified,
    graph_density: Math.round(graphDensity * 1000) / 1000,
    graph_health_score: Math.min(Math.max(graphHealthScore, 0), 100),
    nodes_by_type,
    recent_activity,
  });
});
