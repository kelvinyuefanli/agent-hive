import { sql } from "drizzle-orm";
import { knowledgeEdges, knowledgeNodes } from "@/lib/db/schema";
import type { EnricherJob } from "./demand-detection";

export const trustCascade: EnricherJob = {
  name: "trust-cascade",

  async process(tx: any): Promise<{ processed: number; created: number }> {
    // 1. Get derived_from edges created in the last 120 seconds
    const recentEdges = await tx
      .select()
      .from(knowledgeEdges)
      .where(
        sql`${knowledgeEdges.relation} = 'derived_from' AND ${knowledgeEdges.createdAt} > NOW() - INTERVAL '120 seconds'`,
      );

    if (recentEdges.length === 0) {
      return { processed: 0, created: 0 };
    }

    // 2. For each source node referenced by derived_from edges
    const sourceIdSet = new Set<string>();
    for (const e of recentEdges) {
      sourceIdSet.add((e as any).sourceId as string);
    }
    let processed = 0;
    const visited = new Set<string>();

    for (const sourceId of sourceIdSet) {
      // Cycle detection: skip if already boosted in this run
      if (visited.has(sourceId)) continue;
      visited.add(sourceId);
      // Get current provenance_trust
      const nodes = await tx
        .select()
        .from(knowledgeNodes)
        .where(sql`${knowledgeNodes.id} = ${sourceId}`);

      if (nodes.length === 0) continue;

      const currentTrust = nodes[0].provenanceTrust ?? 0;
      const remainingCap = 0.3 - currentTrust;
      const boost = Math.min(0.1, remainingCap);

      if (boost > 0) {
        await tx.execute(sql`
          UPDATE knowledge_nodes
          SET provenance_trust = provenance_trust + ${boost}
          WHERE id = ${sourceId}
        `);
        processed++;
      }
    }

    return { processed, created: 0 };
  },
};
