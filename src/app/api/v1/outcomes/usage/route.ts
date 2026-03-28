import { NextResponse } from "next/server";
import { withSafety } from "@/lib/safety/middleware";
import { createUsageSchema, type CreateUsageInput } from "@/lib/schemas/outcomes";
import { db } from "@/lib/db";
import { knowledgeNodes, usageReports } from "@/lib/db/schema";
import { NotFoundError } from "@/lib/utils/errors";
import { eq } from "drizzle-orm";

export const POST = withSafety<CreateUsageInput>({
  schema: createUsageSchema,
  requireAuth: true,
})(async ({ body, agent }) => {
  // Verify node exists
  const [node] = await db
    .select({ id: knowledgeNodes.id })
    .from(knowledgeNodes)
    .where(eq(knowledgeNodes.id, body.node_id))
    .limit(1);

  if (!node) {
    throw new NotFoundError("Node not found");
  }

  const [usage] = await db
    .insert(usageReports)
    .values({
      nodeId: body.node_id,
      agentId: agent!.id,
      helpful: body.helpful,
    })
    .returning();

  return NextResponse.json({ data: usage }, { status: 201 });
});
