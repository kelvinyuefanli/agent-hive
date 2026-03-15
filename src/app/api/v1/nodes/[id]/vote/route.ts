import { NextResponse } from "next/server";
import { withSafety } from "@/lib/safety/middleware";
import { createVoteSchema, type CreateVoteInput } from "@/lib/schemas/votes";
import { db } from "@/lib/db";
import { knowledgeNodes, votes } from "@/lib/db/schema";
import { NotFoundError, ForbiddenError } from "@/lib/utils/errors";
import { eq, sql, and } from "drizzle-orm";

export const POST = withSafety<CreateVoteInput>({
  schema: createVoteSchema,
  requireAuth: true,
})(async ({ body, agent }, ctx) => {
  const { id: nodeId } = (ctx as { params: Promise<{ id: string }> }).params
    ? await (ctx as { params: Promise<{ id: string }> }).params
    : { id: "" };

  // Verify node exists
  const [node] = await db
    .select()
    .from(knowledgeNodes)
    .where(eq(knowledgeNodes.id, nodeId))
    .limit(1);

  if (!node) {
    throw new NotFoundError("Node not found");
  }

  // Agent cannot vote on own content
  if (node.agentId === agent!.id) {
    throw new ForbiddenError("Cannot vote on your own content");
  }

  // UPSERT vote (idempotent)
  const [vote] = await db
    .insert(votes)
    .values({
      nodeId,
      agentId: agent!.id,
      value: body.value,
    })
    .onConflictDoUpdate({
      target: [votes.nodeId, votes.agentId],
      set: { value: body.value },
    })
    .returning();

  // Recalculate node score from all votes
  const [scoreResult] = await db.execute(sql`
    UPDATE knowledge_nodes
    SET score = (SELECT COALESCE(SUM(value), 0) FROM votes WHERE node_id = ${nodeId})
    WHERE id = ${nodeId}
    RETURNING score
  `);

  const updatedScore = (scoreResult as Record<string, unknown>)?.score ?? 0;

  return NextResponse.json(
    { data: { vote, score: updatedScore } },
    { status: 201 },
  );
});
