import { sql } from "drizzle-orm";
import type { EnricherJob } from "./demand-detection";

const DECAY_FITNESS_THRESHOLD = 0.2;
const VALIDATION_FITNESS_THRESHOLD = 0.6;
const VALIDATION_ADOPTION_THRESHOLD = 3;
const EXPLORATION_WEIGHT = 0.1;

export const strategyFitness: EnricherJob = {
  name: "strategy-fitness",

  async process(tx): Promise<{ processed: number; created: number }> {
    // 1. Calculate fitness for all active strategies
    let strategyRows: Array<{
      id: string;
      lifecycle_stage: string;
      adoption_count: number;
      total_outcomes: number;
      successful_outcomes: number;
    }> = [];

    try {
      const result = await tx.execute(sql`
        SELECT
          s.id,
          s.lifecycle_stage,
          COUNT(DISTINCT sa.id)::int AS adoption_count,
          COUNT(DISTINCT or2.id)::int AS total_outcomes,
          COUNT(DISTINCT or2.id) FILTER (WHERE or2.success = true)::int AS successful_outcomes
        FROM strategies s
        LEFT JOIN strategy_adoptions sa ON sa.strategy_id = s.id
        LEFT JOIN outcome_reports or2 ON or2.strategy_id = s.id
        WHERE s.lifecycle_stage NOT IN ('decayed')
        GROUP BY s.id, s.lifecycle_stage
      `);
      strategyRows = Array.from(result as any) as typeof strategyRows;
    } catch {
      return { processed: 0, created: 0 };
    }

    let processed = 0;

    for (const row of strategyRows) {
      const successRate = row.total_outcomes > 0
        ? row.successful_outcomes / row.total_outcomes
        : 0;

      // Confidence-weighted fitness (same formula as co-occurrence)
      const rawFitness = (row.adoption_count / (row.adoption_count + 10)) * successRate;

      // DGM-H exploration bonus: penalize over-breeding
      const explorationBonus = EXPLORATION_WEIGHT * (1 / (1 + row.adoption_count));
      const effectiveFitness = rawFitness + explorationBonus;

      // Determine lifecycle transition
      let newStage = row.lifecycle_stage;
      if (effectiveFitness >= VALIDATION_FITNESS_THRESHOLD && row.adoption_count >= VALIDATION_ADOPTION_THRESHOLD) {
        if (row.lifecycle_stage === "observed" || row.lifecycle_stage === "candidate") {
          newStage = "validated";
        }
      } else if (row.lifecycle_stage === "observed" && row.adoption_count >= 2) {
        newStage = "candidate";
      }

      // Update strategy
      await tx.execute(sql`
        UPDATE strategies
        SET fitness_score = ${effectiveFitness},
            adoption_count = ${row.adoption_count},
            success_rate = ${successRate},
            lifecycle_stage = ${newStage},
            updated_at = NOW()
        WHERE id = ${row.id}::uuid
      `);

      processed++;
    }

    // 2. Decay stale strategies (fitness < 0.2, not updated in 7 days)
    try {
      await tx.execute(sql`
        UPDATE strategies
        SET lifecycle_stage = 'decayed', updated_at = NOW()
        WHERE lifecycle_stage NOT IN ('decayed', 'canonical')
          AND fitness_score < ${DECAY_FITNESS_THRESHOLD}
          AND updated_at < NOW() - INTERVAL '7 days'
      `);
    } catch {
      // strategies table may not exist yet
    }

    // 3. Promote highest-fitness validated strategy per domain to canonical
    try {
      await tx.execute(sql`
        WITH ranked AS (
          SELECT id, domain_tags[1] AS domain,
                 ROW_NUMBER() OVER (PARTITION BY domain_tags[1] ORDER BY fitness_score DESC) AS rn
          FROM strategies
          WHERE lifecycle_stage = 'validated'
            AND array_length(domain_tags, 1) > 0
        )
        UPDATE strategies
        SET lifecycle_stage = 'canonical', updated_at = NOW()
        WHERE id IN (SELECT id FROM ranked WHERE rn = 1)
          AND lifecycle_stage = 'validated'
      `);
    } catch {
      // May fail if no validated strategies yet
    }

    return { processed, created: 0 };
  },
};
