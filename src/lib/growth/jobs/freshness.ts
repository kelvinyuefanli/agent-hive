import { sql } from "drizzle-orm";
import { readSignals, knowledgeNodes } from "@/lib/db/schema";
import type { EnricherJob } from "./demand-detection";

export const freshness: EnricherJob = {
  name: "freshness",

  async process(tx): Promise<{ processed: number; created: number }> {
    // 1. Get all unique node_ids from read_signals
    const signals = await tx.select().from(readSignals).limit(50000);

    if (signals.length === 0) {
      return { processed: 0, created: 0 };
    }

    const uniqueNodeIds = [...new Set(signals.map((s: any) => s.nodeId))];

    // 2. Batch UPDATE knowledge_nodes SET last_read_at = NOW()
    if (uniqueNodeIds.length > 0) {
      await tx.execute(sql`
        UPDATE knowledge_nodes
        SET last_read_at = NOW(), updated_at = NOW()
        WHERE id = ANY(${uniqueNodeIds}::uuid[])
      `);
    }

    let processed = uniqueNodeIds.length;

    // Process usage reports: boost/penalize freshness based on helpfulness
    let usageRows: Array<{ node_id: string; helpful: boolean; agent_count: number }> = [];
    try {
      const usageSignals = await tx.execute(sql`
        SELECT node_id, helpful, COUNT(DISTINCT agent_id)::int AS agent_count
        FROM usage_reports
        WHERE created_at > NOW() - INTERVAL '24 hours'
        GROUP BY node_id, helpful
      `);
      usageRows = Array.from(usageSignals as any) as typeof usageRows;
    } catch {
      // usage_reports table may not exist yet during migration
    }

    for (const row of usageRows) {
      if (row.helpful) {
        // Boost freshness for helpful nodes (+0.1 per report, cap at 1.0)
        await tx.execute(sql`
          UPDATE knowledge_nodes
          SET freshness = LEAST(1.0, freshness + 0.1),
              updated_at = NOW()
          WHERE id = ${row.node_id}::uuid
        `);
        // Promote to community trust if 3+ helpful reports from different agents
        if (row.agent_count >= 3) {
          await tx.execute(sql`
            UPDATE knowledge_nodes
            SET trust_level = 'community'
            WHERE id = ${row.node_id}::uuid
              AND trust_level = 'unverified'
          `);
        }
      } else {
        // Penalize freshness for unhelpful nodes (-0.05, floor at 0.0)
        await tx.execute(sql`
          UPDATE knowledge_nodes
          SET freshness = GREATEST(0.0, freshness - 0.05),
              updated_at = NOW()
          WHERE id = ${row.node_id}::uuid
        `);
      }
      processed++;
    }

    return { processed, created: 0 };
  },
};
