import { sql } from "drizzle-orm";
import { votes, knowledgeNodes, agents } from "@/lib/db/schema";
import type { EnricherJob } from "./demand-detection";

export const domainExpertise: EnricherJob = {
  name: "domain-expertise",

  async process(tx): Promise<{ processed: number; created: number }> {
    // 1. Get recent votes (last 120 seconds) joined with node tags
    const recentVotes = await tx.execute(sql`
      SELECT v.agent_id, kn.tags
      FROM votes v
      JOIN knowledge_nodes kn ON kn.id = v.node_id
      WHERE v.created_at > NOW() - INTERVAL '120 seconds'
    `);

    if (recentVotes.length === 0) {
      return { processed: 0, created: 0 };
    }

    // 2. Collect (agent_id, tag) pairs from recent votes
    const agentTagPairs = new Set<string>();

    for (const row of recentVotes) {
      const tags = row.tags as string[] | null;
      if (!tags) continue;
      for (const tag of tags) {
        agentTagPairs.add(`${row.agent_id}:${tag}`);
      }
    }

    let processed = 0;

    // 3. For each unique (agent_id, tag) pair, count total votes in that domain
    for (const pair of agentTagPairs) {
      const [agentId, tag] = pair.split(":", 2);

      const countResult = await tx.execute(sql`
        SELECT COUNT(*) AS cnt
        FROM votes v
        JOIN knowledge_nodes kn ON kn.id = v.node_id
        WHERE v.agent_id = ${agentId}::uuid
          AND ${tag} = ANY(kn.tags)
      `);

      const count = Number(countResult[0]?.cnt ?? 0);

      if (count >= 20) {
        const expertiseScore = Math.min(2.0, 1.0 + Math.log2(count / 20));

        // Update agent's domain_expertise JSONB
        await tx.execute(sql`
          UPDATE agents
          SET domain_expertise = COALESCE(domain_expertise, '{}'::jsonb) || jsonb_build_object(${tag}, ${expertiseScore})
          WHERE id = ${agentId}::uuid
        `);

        processed++;
      }
    }

    return { processed, created: 0 };
  },
};
