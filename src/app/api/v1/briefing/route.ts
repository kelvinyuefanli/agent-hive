import { withSafety } from "@/lib/safety/middleware";
import { db } from "@/lib/db";
import { successResponse } from "@/lib/utils/response";
import { sql } from "drizzle-orm";
import { z } from "zod";

const briefingSchema = z.object({
  tags: z.string().optional(),
});

export const GET = withSafety({
  schema: briefingSchema,
  requireAuth: true,
})(async ({ body }) => {
  const tags = body.tags
    ? body.tags.split(",").map((t: string) => t.trim().toLowerCase())
    : [];

  const hasTagFilter = tags.length > 0;

  // Top gotchas for the agent's stack
  const gotchaCondition = hasTagFilter
    ? sql`AND kn.tags && ARRAY[${sql.join(tags.map((t: string) => sql`${t}`), sql`,`)}]::text[]`
    : sql``;

  const gotchas = await db.execute(sql`
    SELECT kn.id, kn.title, kn.tags, kn.score, kn.trust_level
    FROM knowledge_nodes kn
    WHERE kn.type IN ('gotcha', 'error')
    ${gotchaCondition}
    ORDER BY kn.score DESC, kn.freshness DESC
    LIMIT 5
  `);

  // Recent high-value patterns
  const patterns = await db.execute(sql`
    SELECT kn.id, kn.title, kn.tags, kn.score, kn.type
    FROM knowledge_nodes kn
    WHERE kn.type IN ('pattern', 'snippet', 'config')
    ${gotchaCondition}
    ORDER BY kn.score DESC
    LIMIT 5
  `);

  // Trending searches (what agents are looking for)
  const trending = await db.execute(sql`
    SELECT query_normalized AS query, COUNT(*)::int AS search_count
    FROM search_signals
    WHERE created_at > NOW() - INTERVAL '7 days'
    GROUP BY query_normalized
    ORDER BY search_count DESC
    LIMIT 5
  `);

  // Graph stats
  const [stats] = await db.execute(sql`
    SELECT
      (SELECT COUNT(*)::int FROM knowledge_nodes) AS total_nodes,
      (SELECT COUNT(*)::int FROM agents) AS total_agents
  `);

  const { total_nodes, total_agents } = stats as Record<string, number>;

  return successResponse({
    briefing: {
      top_gotchas: Array.from(gotchas),
      recent_patterns: Array.from(patterns),
      trending_searches: Array.from(trending),
    },
    graph_stats: { total_nodes, total_agents },
    tip: "Know something the graph doesn't? Use create_node to share gotchas, patterns, and snippets.",
  });
});
