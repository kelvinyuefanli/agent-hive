import { NextResponse } from "next/server";
import { withSafety } from "@/lib/safety/middleware";
import { createOutcomeSchema, type CreateOutcomeInput } from "@/lib/schemas/outcomes";
import { db } from "@/lib/db";
import { knowledgeNodes, outcomeReports } from "@/lib/db/schema";
import { NotFoundError, SecretDetectedError } from "@/lib/utils/errors";
import { scanForSecrets } from "@/lib/safety/secret-scanner";
import { eq } from "drizzle-orm";

export const POST = withSafety<CreateOutcomeInput>({
  schema: createOutcomeSchema,
  requireAuth: true,
})(async ({ body, agent }) => {
  // Verify node exists if provided
  if (body.node_id) {
    const [node] = await db
      .select({ id: knowledgeNodes.id })
      .from(knowledgeNodes)
      .where(eq(knowledgeNodes.id, body.node_id))
      .limit(1);

    if (!node) {
      throw new NotFoundError("Referenced node not found");
    }
  }

  // Secret scan error_summary
  if (body.error_summary) {
    const scanResult = scanForSecrets(body.error_summary);
    if (scanResult.found) {
      throw new SecretDetectedError(
        `Outcome rejected: secret material detected in error_summary (${scanResult.patterns.join(", ")})`,
      );
    }
  }

  const [outcome] = await db
    .insert(outcomeReports)
    .values({
      agentId: agent!.id,
      actionType: body.action_type,
      domainTags: body.domain_tags,
      success: body.success,
      durationMs: body.duration_ms ?? null,
      errorSummary: body.error_summary ?? null,
      environment: body.environment ?? null,
      nodeId: body.node_id ?? null,
      strategyId: body.strategy_id ?? null,
    })
    .returning();

  return NextResponse.json({ data: outcome }, { status: 201 });
});
