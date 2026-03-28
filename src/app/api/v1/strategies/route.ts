import { withSafety } from "@/lib/safety/middleware";
import { listStrategiesSchema, type ListStrategiesInput } from "@/lib/schemas/strategies";
import { db } from "@/lib/db";
import { strategies } from "@/lib/db/schema";
import { sql } from "drizzle-orm";
import { successResponse } from "@/lib/utils/response";

export const GET = withSafety<ListStrategiesInput>({
  schema: listStrategiesSchema,
  requireAuth: true,
})(async ({ body }) => {
  const { tags, lifecycle_stage, limit, cursor } = body;

  const conditions: any[] = [];

  if (lifecycle_stage) {
    conditions.push(sql`lifecycle_stage = ${lifecycle_stage}`);
  } else {
    // Default: exclude decayed
    conditions.push(sql`lifecycle_stage != 'decayed'`);
  }

  if (tags) {
    const tagList = tags.split(",").map((t: string) => t.trim());
    conditions.push(
      sql`domain_tags && ARRAY[${sql.join(tagList.map((t: string) => sql`${t}`), sql`,`)}]::text[]`,
    );
  }

  if (cursor) {
    conditions.push(sql`id < ${cursor}::uuid`);
  }

  const whereClause = conditions.length > 0
    ? sql.join(conditions, sql` AND `)
    : sql`true`;

  const results = await db.execute(sql`
    SELECT *
    FROM strategies
    WHERE ${whereClause}
    ORDER BY fitness_score DESC, created_at DESC
    LIMIT ${limit + 1}
  `);

  const rows = Array.from(results as any) as Record<string, unknown>[];
  const hasMore = rows.length > limit;
  const resultStrategies = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore
    ? (resultStrategies[resultStrategies.length - 1] as any).id
    : undefined;

  return successResponse({
    strategies: resultStrategies,
    next_cursor: nextCursor,
    has_more: hasMore,
  });
});
