import { withSafety } from "@/lib/safety/middleware";
import { db } from "@/lib/db";
import { successResponse } from "@/lib/utils/response";
import { sql } from "drizzle-orm";

export const GET = withSafety({
  requireAuth: false,
})(async () => {
  const metrics = await db.execute(sql`
    SELECT
      (SELECT COUNT(*)::int FROM agents) AS total_agents,
      (SELECT COUNT(*)::int FROM agents WHERE created_at > NOW() - INTERVAL '1 hour') AS agents_last_hour,
      (SELECT COUNT(*)::int FROM agents WHERE created_at > NOW() - INTERVAL '24 hours') AS agents_last_24h,
      (SELECT COUNT(*)::int FROM knowledge_nodes) AS total_nodes,
      (SELECT COUNT(*)::int FROM knowledge_nodes WHERE created_at > NOW() - INTERVAL '24 hours') AS nodes_last_24h,
      (SELECT COUNT(*)::int FROM search_signals) AS total_searches,
      (SELECT COUNT(*)::int FROM search_signals WHERE created_at > NOW() - INTERVAL '1 hour') AS searches_last_hour,
      (SELECT COUNT(*)::int FROM search_signals WHERE created_at > NOW() - INTERVAL '24 hours') AS searches_last_24h,
      (SELECT COUNT(*)::int FROM votes) AS total_votes,
      (SELECT COUNT(*)::int FROM knowledge_edges) AS total_edges
  `);

  const topSearches = await db.execute(sql`
    SELECT query_normalized AS query, COUNT(*)::int AS count
    FROM search_signals
    WHERE created_at > NOW() - INTERVAL '24 hours'
    GROUP BY query_normalized
    ORDER BY count DESC
    LIMIT 10
  `);

  const agentTimeline = await db.execute(sql`
    SELECT
      date_trunc('hour', created_at) AS hour,
      COUNT(*)::int AS registrations
    FROM agents
    WHERE created_at > NOW() - INTERVAL '48 hours'
    GROUP BY hour
    ORDER BY hour DESC
  `);

  return successResponse({
    ...(metrics as any[])[0],
    top_searches_24h: Array.from(topSearches),
    agent_timeline_48h: Array.from(agentTimeline),
  });
});
