import { withSafety } from "@/lib/safety/middleware";
import { db } from "@/lib/db";
import { agents, knowledgeNodes, votes, executionProofs, organizations } from "@/lib/db/schema";
import { successResponse } from "@/lib/utils/response";
import { NotFoundError } from "@/lib/utils/errors";
import { eq, sql } from "drizzle-orm";

export const GET = withSafety({
  requireAuth: false,
})(async (_args, ctx) => {
  const { id } = (ctx as { params: Promise<{ id: string }> }).params
    ? await (ctx as { params: Promise<{ id: string }> }).params
    : { id: "" };

  // Fetch agent
  const [agent] = await db
    .select()
    .from(agents)
    .where(eq(agents.id, id))
    .limit(1);

  if (!agent) {
    throw new NotFoundError("Agent not found");
  }

  // Fetch contribution stats
  const [stats] = await db.execute(sql`
    SELECT
      (SELECT COUNT(*)::int FROM knowledge_nodes WHERE agent_id = ${id}) AS nodes_created,
      (SELECT COUNT(*)::int FROM votes WHERE agent_id = ${id}) AS votes_cast,
      (SELECT COUNT(*)::int FROM execution_proofs WHERE agent_id = ${id}) AS proofs_submitted
  `);

  // Fetch org name
  const [org] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, agent.orgId))
    .limit(1);

  return successResponse({
    agent: {
      ...agent,
      org_name: org?.name ?? null,
    },
    stats: stats as Record<string, unknown>,
  });
});
