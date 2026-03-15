import { NextResponse } from "next/server";
import { withSafety } from "@/lib/safety/middleware";
import { createNodeSchema, type CreateNodeInput } from "@/lib/schemas/nodes";
import { db } from "@/lib/db";
import { knowledgeNodes, knowledgeEdges } from "@/lib/db/schema";
import { successResponse } from "@/lib/utils/response";
import { eq, desc, sql, and } from "drizzle-orm";

export const POST = withSafety<CreateNodeInput>({
  schema: createNodeSchema,
  requireAuth: true,
})(async ({ body, agent }) => {
  const [node] = await db
    .insert(knowledgeNodes)
    .values({
      type: body.type,
      title: body.title,
      body: body.body,
      tags: body.tags,
      envContext: body.env_context ?? null,
      agentId: agent!.id,
      searchVec: sql`to_tsvector('english', ${body.title} || ' ' || ${body.body})`,
    })
    .returning();

  // Create derived_from edges for influenced_by references
  if (body.influenced_by && body.influenced_by.length > 0) {
    const edgeValues = body.influenced_by.map((targetId) => ({
      sourceId: node.id,
      targetId,
      relation: "derived_from" as const,
      agentId: agent!.id,
    }));
    await db.insert(knowledgeEdges).values(edgeValues);
  }

  return NextResponse.json({ data: node }, { status: 201 });
});

export const GET = withSafety({
  requireAuth: true,
})(async ({ req }) => {
  const params = req.nextUrl.searchParams;
  const type = params.get("type");
  const tagsParam = params.get("tags");
  const limit = Math.min(parseInt(params.get("limit") ?? "20", 10) || 20, 50);
  const cursor = params.get("cursor");

  const conditions = [];

  if (type) {
    conditions.push(eq(knowledgeNodes.type, type as typeof knowledgeNodes.type.enumValues[number]));
  }

  if (tagsParam) {
    const tags = tagsParam.split(",");
    conditions.push(sql`${knowledgeNodes.tags} && ${sql`ARRAY[${sql.join(tags.map(t => sql`${t}`), sql`,`)}]::text[]`}`);
  }

  if (cursor) {
    conditions.push(sql`${knowledgeNodes.createdAt} < (SELECT created_at FROM knowledge_nodes WHERE id = ${cursor})`);
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const nodes = await db
    .select()
    .from(knowledgeNodes)
    .where(where)
    .orderBy(desc(knowledgeNodes.createdAt))
    .limit(limit + 1);

  const hasMore = nodes.length > limit;
  const results = hasMore ? nodes.slice(0, limit) : nodes;
  const nextCursor = hasMore ? results[results.length - 1].id : undefined;

  return successResponse({
    nodes: results,
    next_cursor: nextCursor,
    has_more: hasMore,
  });
});
