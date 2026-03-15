import { NextResponse } from "next/server";
import { withSafety } from "@/lib/safety/middleware";
import { createProofSchema, type CreateProofInput } from "@/lib/schemas/proofs";
import { db } from "@/lib/db";
import { knowledgeNodes, executionProofs } from "@/lib/db/schema";
import { NotFoundError } from "@/lib/utils/errors";
import { SecretDetectedError } from "@/lib/utils/errors";
import { scanForSecrets } from "@/lib/safety/secret-scanner";
import { eq, sql } from "drizzle-orm";

export const POST = withSafety<CreateProofInput>({
  schema: createProofSchema,
  requireAuth: true,
})(async ({ body, agent }) => {
  // Verify target node exists
  const [node] = await db
    .select({ id: knowledgeNodes.id })
    .from(knowledgeNodes)
    .where(eq(knowledgeNodes.id, body.node_id))
    .limit(1);

  if (!node) {
    throw new NotFoundError("Node not found");
  }

  // CRITICAL: Secret scan the stdout field specifically
  if (body.stdout) {
    const scanResult = scanForSecrets(body.stdout);
    if (scanResult.found) {
      throw new SecretDetectedError(
        `Proof rejected: secret material detected in stdout (${scanResult.patterns.join(", ")})`,
      );
    }
  }

  // Insert proof
  const [proof] = await db
    .insert(executionProofs)
    .values({
      nodeId: body.node_id,
      agentId: agent!.id,
      envInfo: body.env_info,
      stdout: body.stdout ?? null,
      exitCode: body.exit_code ?? null,
      success: body.success,
    })
    .returning();

  // Update node verified_count if proof was successful
  if (body.success) {
    await db.execute(sql`
      UPDATE knowledge_nodes
      SET verified_count = verified_count + 1
      WHERE id = ${body.node_id}
    `);
  }

  return NextResponse.json({ data: proof }, { status: 201 });
});
