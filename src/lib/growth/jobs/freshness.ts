import { sql } from "drizzle-orm";
import { readSignals, knowledgeNodes } from "@/lib/db/schema";
import type { EnricherJob } from "./demand-detection";

export const freshness: EnricherJob = {
  name: "freshness",

  async process(tx): Promise<{ processed: number; created: number }> {
    // 1. Get all unique node_ids from read_signals
    const signals = await tx.select().from(readSignals);

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

    return { processed: uniqueNodeIds.length, created: 0 };
  },
};
