import { sql } from "drizzle-orm";
import type { EnricherJob } from "./demand-detection";

export const domainExpertise: EnricherJob = {
  name: "domain-expertise",

  async process(tx): Promise<{ processed: number; created: number }> {
    // Single aggregated query: count votes per (agent, tag) for recent voters
    const results = await tx.execute(sql`
      WITH recent_voters AS (
        SELECT DISTINCT agent_id
        FROM votes
        WHERE created_at > NOW() - INTERVAL '120 seconds'
      ),
      tag_counts AS (
        SELECT v.agent_id, unnest(kn.tags) AS tag, COUNT(*)::int AS cnt
        FROM votes v
        JOIN knowledge_nodes kn ON kn.id = v.node_id
        WHERE v.agent_id IN (SELECT agent_id FROM recent_voters)
        GROUP BY v.agent_id, unnest(kn.tags)
        HAVING COUNT(*) >= 20
      )
      SELECT agent_id, tag, cnt,
             LEAST(2.0, 1.0 + LOG(2, cnt::float / 20.0))::float AS expertise_score
      FROM tag_counts
    `);

    const rows = Array.from(results as any) as Array<{
      agent_id: string;
      tag: string;
      expertise_score: number;
    }>;

    if (rows.length === 0) {
      return { processed: 0, created: 0 };
    }

    // Batch update all agents
    for (const row of rows) {
      await tx.execute(sql`
        UPDATE agents
        SET domain_expertise = COALESCE(domain_expertise, '{}'::jsonb) || jsonb_build_object(${row.tag}, ${row.expertise_score})
        WHERE id = ${row.agent_id}::uuid
      `);
    }

    return { processed: rows.length, created: 0 };
  },
};
