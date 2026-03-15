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

  return successResponse({
    total_nodes,
    total_edges,
    total_agents,
    total_verified,
    graph_density: Math.round(graphDensity * 1000) / 1000,
    graph_health_score: Math.min(Math.max(graphHealthScore, 0), 100),
  });
});
