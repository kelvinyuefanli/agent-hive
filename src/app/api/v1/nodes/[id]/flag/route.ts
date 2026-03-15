import { withSafety } from "@/lib/safety/middleware";
import { db } from "@/lib/db";
import { knowledgeNodes, moderationFlags } from "@/lib/db/schema";
import { successResponse } from "@/lib/utils/response";
import { NotFoundError, ForbiddenError } from "@/lib/utils/errors";
import { eq } from "drizzle-orm";
import { flagNodeSchema, type FlagNodeInput } from "@/lib/schemas/nodes";

export const POST = withSafety<FlagNodeInput>({
  schema: flagNodeSchema,
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
  if (node.agentId === agent!.id) {
    throw new ForbiddenError("Cannot flag your own node");
  }

  const [flag] = await db
    .insert(moderationFlags)
    .values({
      nodeId: id,
      agentId: agent!.id,
      reason: body.reason,
    })
    .returning();

  return successResponse(flag);
});
