import { NextResponse } from "next/server";
import { withSafety } from "@/lib/safety/middleware";
import { db } from "@/lib/db";
import { knowledgeNodes, knowledgeEdges, votes, executionProofs, moderationFlags } from "@/lib/db/schema";
import { successResponse } from "@/lib/utils/response";
import { NotFoundError, ForbiddenError } from "@/lib/utils/errors";
import { eq, sql, or } from "drizzle-orm";
import { updateNodeSchema, type UpdateNodeInput } from "@/lib/schemas/nodes";

export const GET = withSafety({
  requireAuth: true,
})(async ({ req }, ctx) => {
  const { id } = (ctx as { params: Promise<{ id: string }> }).params
    ? await (ctx as { params: Promise<{ id: string }> }).params
    : { id: "" };

  // Fetch the node
  const [node] = await db
    .select()
    .from(knowledgeNodes)
    .where(eq(knowledgeNodes.id, id))
    .limit(1);

  if (!node) {
    throw new NotFoundError("Node not found");
  }

  // Fetch related edges (direct connections)
  const edges = await db
    .select()
    .from(knowledgeEdges)
    .where(or(eq(knowledgeEdges.sourceId, id), eq(knowledgeEdges.targetId, id)));

  // 2-hop CTE for gotchas and contradictions
  const gotchaRows = await db.execute(sql`
    WITH direct AS (
      SELECT target_id AS node_id FROM knowledge_edges
      WHERE source_id = ${id} AND relation IN ('contradicts')
      UNION
      SELECT source_id AS node_id FROM knowledge_edges
      WHERE target_id = ${id} AND relation IN ('contradicts')
    ),
    two_hop AS (
      SELECT ke.target_id AS node_id FROM knowledge_edges ke
      INNER JOIN direct d ON ke.source_id = d.node_id
      WHERE ke.relation IN ('contradicts')
      UNION
      SELECT ke.source_id AS node_id FROM knowledge_edges ke
      INNER JOIN direct d ON ke.target_id = d.node_id
      WHERE ke.relation IN ('contradicts')
    ),
    all_gotcha_ids AS (
      SELECT node_id FROM direct
      UNION
      SELECT node_id FROM two_hop
    )
    SELECT kn.* FROM knowledge_nodes kn
    INNER JOIN all_gotcha_ids g ON kn.id = g.node_id
    WHERE kn.type IN ('gotcha', 'answer', 'doc', 'snippet', 'question')
      AND kn.id != ${id}
  `);

  // 2-hop for also_needed (related_to edges)
  const alsoNeededRows = await db.execute(sql`
    WITH direct AS (
      SELECT target_id AS node_id FROM knowledge_edges
      WHERE source_id = ${id} AND relation = 'related_to'
      UNION
      SELECT source_id AS node_id FROM knowledge_edges
      WHERE target_id = ${id} AND relation = 'related_to'
    )
    SELECT kn.* FROM knowledge_nodes kn
    INNER JOIN direct d ON kn.id = d.node_id
    WHERE kn.id != ${id}
    LIMIT 10
  `);

  // works_on: env badges computed from successful proofs
  const worksOnRows = await db.execute(sql`
    SELECT
      CONCAT(env_info->>'runtime', ' ', env_info->>'runtime_version', ' + ', env_info->>'os') AS env,
      COUNT(*)::int AS count
    FROM execution_proofs
    WHERE node_id = ${id} AND success = true
    GROUP BY env_info->>'runtime', env_info->>'runtime_version', env_info->>'os'
  `);

  const [proofCount] = await db.execute(sql`
    SELECT COUNT(*)::int AS count FROM execution_proofs WHERE node_id = ${id}
  `);

  return successResponse(
    {
      node,
      edges,
      gotchas: Array.from(gotchaRows),
      also_needed: Array.from(alsoNeededRows),
      works_on: Array.from(worksOnRows),
      proofs_count: (proofCount as Record<string, unknown>)?.count ?? 0,
    },
    {
      trust_level: node.trustLevel ?? "unverified",
      freshness: node.freshness ?? 1.0,
    },
  );
});

// ─── PATCH: Update a node (only by the creating agent) ─────────────────────

export const PATCH = withSafety<UpdateNodeInput>({
  schema: updateNodeSchema,
  requireAuth: true,
})(async ({ body, agent }, ctx) => {
  const { id } = (ctx as { params: Promise<{ id: string }> }).params
    ? await (ctx as { params: Promise<{ id: string }> }).params
    : { id: "" };

  const [node] = await db
    .select()
    .from(knowledgeNodes)
    .where(eq(knowledgeNodes.id, id))
    .limit(1);

  if (!node) throw new NotFoundError("Node not found");
  if (node.agentId !== agent!.id) {
    throw new ForbiddenError("Only the creating agent can edit this node");
  }

  const updates: Record<string, unknown> = {};
  if (body.title !== undefined) updates.title = body.title;
  if (body.body !== undefined) updates.body = body.body;
  if (body.tags !== undefined) updates.tags = body.tags;

  if (Object.keys(updates).length === 0) {
    return successResponse(node);
  }

  // Rebuild search vector if title or body changed
  if (body.title !== undefined || body.body !== undefined) {
    const newTitle = body.title ?? node.title;
    const newBody = body.body ?? node.body;
    (updates as any).searchVec = sql`to_tsvector('english', ${newTitle} || ' ' || ${newBody})`;
  }

  const [updated] = await db
    .update(knowledgeNodes)
    .set(updates)
    .where(eq(knowledgeNodes.id, id))
    .returning();

  return successResponse(updated);
});

// ─── DELETE: Remove a node (only by the creating agent) ────────────────────

export const DELETE = withSafety({
  requireAuth: true,
})(async ({ agent }, ctx) => {
  const { id } = (ctx as { params: Promise<{ id: string }> }).params
    ? await (ctx as { params: Promise<{ id: string }> }).params
    : { id: "" };

  const [node] = await db
    .select()
    .from(knowledgeNodes)
    .where(eq(knowledgeNodes.id, id))
    .limit(1);

  if (!node) throw new NotFoundError("Node not found");
  if (node.agentId !== agent!.id) {
    throw new ForbiddenError("Only the creating agent can delete this node");
  }

  // Delete related data first (edges, votes, proofs, flags)
  await db.delete(knowledgeEdges).where(
    or(eq(knowledgeEdges.sourceId, id), eq(knowledgeEdges.targetId, id))
  );
  await db.delete(votes).where(eq(votes.nodeId, id));
  await db.delete(executionProofs).where(eq(executionProofs.nodeId, id));
  await db.delete(moderationFlags).where(eq(moderationFlags.nodeId, id));
  await db.delete(knowledgeNodes).where(eq(knowledgeNodes.id, id));

  return NextResponse.json({ data: { deleted: true, id } });
});
