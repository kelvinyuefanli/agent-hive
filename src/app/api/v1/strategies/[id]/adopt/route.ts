import { NextResponse } from "next/server";
import { withSafety } from "@/lib/safety/middleware";
import { db } from "@/lib/db";
import { strategies, strategyAdoptions } from "@/lib/db/schema";
import { NotFoundError } from "@/lib/utils/errors";
import { eq, sql } from "drizzle-orm";

export const POST = withSafety({
  requireAuth: true,
})(async ({ agent }, ctx) => {
  const { id: strategyId } = (ctx as { params: Promise<{ id: string }> }).params
    ? await (ctx as { params: Promise<{ id: string }> }).params
    : { id: "" };

  // Verify strategy exists
  const [strategy] = await db
    .select({ id: strategies.id })
    .from(strategies)
    .where(eq(strategies.id, strategyId))
    .limit(1);

  if (!strategy) {
    throw new NotFoundError("Strategy not found");
  }

  // Upsert adoption (idempotent)
  const [adoption] = await db
    .insert(strategyAdoptions)
    .values({
      strategyId,
      agentId: agent!.id,
    })
    .onConflictDoUpdate({
      target: [strategyAdoptions.strategyId, strategyAdoptions.agentId],
      set: { adoptedAt: sql`NOW()` },
    })
    .returning();

  // Increment adoption count
  await db.execute(sql`
    UPDATE strategies
    SET adoption_count = (
      SELECT COUNT(*)::int FROM strategy_adoptions WHERE strategy_id = ${strategyId}::uuid
    )
    WHERE id = ${strategyId}::uuid
  `);

  return NextResponse.json({ data: adoption }, { status: 201 });
});
