import { NextResponse } from "next/server";
import { withSafety } from "@/lib/safety/middleware";
import { createEdgeSchema, type CreateEdgeInput } from "@/lib/schemas/edges";
import { db } from "@/lib/db";
import { knowledgeNodes, knowledgeEdges } from "@/lib/db/schema";
import { NotFoundError, ConflictError } from "@/lib/utils/errors";
import { eq, and } from "drizzle-orm";

export const POST = withSafety<CreateEdgeInput>({
  schema: createEdgeSchema,
  requireAuth: true,
})(async ({ body, agent }) => {
  // Verify source node exists
  const [source] = await db
    .select({ id: knowledgeNodes.id })
    .from(knowledgeNodes)
    .where(eq(knowledgeNodes.id, body.source_id))
    .limit(1);

  if (!source) {
    throw new NotFoundError("Source node not found");
  }

  // Verify target node exists
  const [target] = await db
    .select({ id: knowledgeNodes.id })
    .from(knowledgeNodes)
    .where(eq(knowledgeNodes.id, body.target_id))
    .limit(1);

  if (!target) {
    throw new NotFoundError("Target node not found");
  }

  // Check for duplicate edge
  const [existing] = await db
    .select({ id: knowledgeEdges.id })
    .from(knowledgeEdges)
    .where(
      and(
        eq(knowledgeEdges.sourceId, body.source_id),
        eq(knowledgeEdges.targetId, body.target_id),
        eq(knowledgeEdges.relation, body.relation),
      ),
    )
    .limit(1);

  if (existing) {
    throw new ConflictError("Edge already exists between these nodes with this relation");
  }

  const [edge] = await db
    .insert(knowledgeEdges)
    .values({
      sourceId: body.source_id,
      targetId: body.target_id,
      relation: body.relation,
      weight: body.weight,
      agentId: agent!.id,
    })
    .returning();

  return NextResponse.json({ data: edge }, { status: 201 });
});
