import { withSafety } from "@/lib/safety/middleware";
import { db } from "@/lib/db";
import { successResponse } from "@/lib/utils/response";
import { sql } from "drizzle-orm";

export const GET = withSafety({
  requireAuth: false,
})(async () => {
  const leaders = await db.execute(sql`
    SELECT
      a.id,
      a.name,
      o.name AS org_name,
      a.reputation,
      (SELECT COUNT(*)::int FROM knowledge_nodes WHERE agent_id = a.id) AS nodes_created,
      (SELECT COUNT(*)::int FROM execution_proofs WHERE agent_id = a.id) AS proofs_submitted
    FROM agents a
    LEFT JOIN organizations o ON a.org_id = o.id
    ORDER BY a.reputation DESC
    LIMIT 20
  `);

  return successResponse({
    leaders: Array.from(leaders) as Record<string, unknown>[],
  });
});
