import { withSafety } from "@/lib/safety/middleware";
import { searchSchema, type SearchInput } from "@/lib/schemas/nodes";
import { db } from "@/lib/db";
import { knowledgeNodes, searchSignals, organizations } from "@/lib/db/schema";
import { successResponse, type ResponseMeta } from "@/lib/utils/response";
import { sql, eq } from "drizzle-orm";

export const GET = withSafety<SearchInput>({
  schema: searchSchema,
  requireAuth: true,
})(async ({ body, agent, org }) => {
  const { q, tags, trust_level, env, cursor, limit } = body;

  // Record search signal for demand tracking
  await db.insert(searchSignals).values({
    agentId: agent?.id ?? "anonymous",
    queryNormalized: q.toLowerCase().trim(),
    tags: tags ?? [],
    resultsCount: 0, // will update after search
  });

  // Build search conditions
  const conditions = [sql`search_vec @@ plainto_tsquery('english', ${q})`];

  if (tags && tags.length > 0) {
    conditions.push(
      sql`${knowledgeNodes.tags} && ARRAY[${sql.join(tags.map(t => sql`${t}`), sql`,`)}]::text[]`,
    );
  }

  if (trust_level) {
    conditions.push(sql`${knowledgeNodes.trustLevel} = ${trust_level}`);
  }

  if (env) {
    conditions.push(sql`${knowledgeNodes.envContext}->>'runtime' ILIKE ${'%' + env + '%'}
      OR ${knowledgeNodes.envContext}->>'os' ILIKE ${'%' + env + '%'}`);
  }

  if (cursor) {
    conditions.push(
      sql`${knowledgeNodes.createdAt} < (SELECT created_at FROM knowledge_nodes WHERE id = ${cursor})`,
    );
  }

  const whereClause = sql.join(conditions, sql` AND `);

  // Phase 1: Full-text search
  const results = await db.execute(sql`
    SELECT
      kn.*,
      ts_rank(search_vec, plainto_tsquery('english', ${q})) AS rank
    FROM knowledge_nodes kn
    WHERE ${whereClause}
    ORDER BY rank DESC, kn.score DESC
    LIMIT ${limit + 1}
  `);

  const rows = Array.from(results) as Record<string, unknown>[];
  const hasMore = rows.length > limit;
  const resultNodes = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore
    ? (resultNodes[resultNodes.length - 1] as Record<string, unknown>).id
    : undefined;

  // Phase 2: Batch fetch related edges for top results (gotchas, also_needed, contradictions)
  const nodeIds = resultNodes.map((n) => (n as Record<string, unknown>).id as string);

  let relatedEdges: Record<string, unknown>[] = [];
  if (nodeIds.length > 0) {
    const edgeResults = await db.execute(sql`
      WITH target_nodes AS (
        SELECT unnest(ARRAY[${sql.join(nodeIds.map(id => sql`${id}::uuid`), sql`,`)}]) AS node_id
      ),
      direct_edges AS (
        SELECT ke.* FROM knowledge_edges ke
        INNER JOIN target_nodes tn ON ke.source_id = tn.node_id OR ke.target_id = tn.node_id
        WHERE ke.relation IN ('contradicts', 'related_to', 'depends_on')
      ),
      two_hop AS (
        SELECT ke2.* FROM knowledge_edges ke2
        INNER JOIN direct_edges de ON ke2.source_id = de.target_id OR ke2.source_id = de.source_id
        WHERE ke2.relation IN ('contradicts', 'related_to')
        LIMIT 50
      )
      SELECT * FROM direct_edges
      UNION
      SELECT * FROM two_hop
    `);
    relatedEdges = Array.from(edgeResults) as Record<string, unknown>[];
  }

  // Demand signal: count of agents who searched similar terms
  const [demandSignal] = await db.execute(sql`
    SELECT COUNT(DISTINCT agent_id)::int AS agent_count
    FROM search_signals
    WHERE query_normalized = ${q.toLowerCase().trim()}
      AND created_at > NOW() - INTERVAL '7 days'
  `);

  // Contribution nudge: if agent has searched >= 5 times but created 0 nodes
  let meta: ResponseMeta | undefined;

  if (agent?.id) {
    const [searchCountResult] = await db.execute(sql`
      SELECT COUNT(*)::int AS search_count
      FROM search_signals
      WHERE agent_id = ${agent.id}
        AND created_at > NOW() - INTERVAL '7 days'
    `);
    const searchCount = (searchCountResult as Record<string, number>).search_count ?? 0;

    if (searchCount >= 5) {
      const [nodeCountResult] = await db.execute(sql`
        SELECT COUNT(*)::int AS node_count
        FROM knowledge_nodes
        WHERE agent_id = ${agent.id}::uuid
      `);
      const nodeCount = (nodeCountResult as Record<string, number>).node_count ?? 0;

      if (nodeCount === 0) {
        meta = {
          suggested_contributions: [
            "You've searched 5 times — share a gotcha you've discovered!",
            "Know something the graph doesn't? Create a node with create_node.",
          ],
        };
      }
    }
  }

  // First-search welcome logic
  if (org?.isFirstSearch) {
    const [stats] = await db.execute(sql`
      SELECT
        (SELECT COUNT(*)::int FROM knowledge_nodes) AS total_nodes,
        (SELECT COUNT(*)::int FROM knowledge_edges) AS total_edges,
        (SELECT COUNT(*)::int FROM agents) AS total_agents
    `);
    const { total_nodes, total_edges, total_agents } = stats as Record<string, number>;

    meta = {
      ...meta,
      welcome: true,
      graph_stats: { total_nodes, total_edges, total_agents },
    };

    await db
      .update(organizations)
      .set({ isFirstSearch: false })
      .where(eq(organizations.id, org.id));
  }

  return successResponse(
    {
      nodes: resultNodes,
      related_edges: relatedEdges,
      demand_signal: (demandSignal as Record<string, unknown>)?.agent_count ?? 0,
      next_cursor: nextCursor,
      has_more: hasMore,
    },
    meta,
  );
});
