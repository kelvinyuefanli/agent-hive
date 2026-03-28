import { sql } from "drizzle-orm";
import { knowledgeNodes, strategies } from "@/lib/db/schema";
import type { EnricherJob } from "./demand-detection";

const MIN_PATTERN_SCORE = 3;

export const strategyGenesis: EnricherJob = {
  name: "strategy-genesis",

  async process(tx): Promise<{ processed: number; created: number }> {
    // Find pattern nodes with score >= 3 that don't yet have a linked strategy
    let patternRows: Array<{
      id: string;
      title: string;
      body: string;
      tags: string[];
    }> = [];

    try {
      const result = await tx.execute(sql`
        SELECT kn.id, kn.title, kn.body, kn.tags
        FROM knowledge_nodes kn
        LEFT JOIN strategies s ON s.source_pattern_id = kn.id
        WHERE kn.type = 'pattern'
          AND kn.score >= ${MIN_PATTERN_SCORE}
          AND s.id IS NULL
        LIMIT 20
      `);
      patternRows = Array.from(result as any) as typeof patternRows;
    } catch {
      return { processed: 0, created: 0 };
    }

    let created = 0;

    for (const pattern of patternRows) {
      // Extract structured strategy from pattern
      const steps = extractSteps(pattern.body);

      try {
        await tx.execute(sql`
          INSERT INTO strategies (
            title, context_pattern, steps, domain_tags,
            lifecycle_stage, fitness_score, source_pattern_id
          )
          VALUES (
            ${pattern.title},
            ${'When performing: ' + pattern.title},
            ${JSON.stringify(steps)}::jsonb,
            ${sql`${pattern.tags}::text[]`},
            'observed',
            0.0,
            ${pattern.id}::uuid
          )
        `);
        created++;
      } catch {
        // Duplicate or constraint violation — skip
      }
    }

    return { processed: patternRows.length, created };
  },
};

function extractSteps(body: string | undefined | null): string[] {
  if (!body) return ["Follow the detected pattern"];
  // Try to extract numbered steps from the body
  const numbered = body.match(/\d+\.\s+[^\n]+/g);
  if (numbered && numbered.length >= 2) {
    return numbered.map((s) => s.replace(/^\d+\.\s+/, "").trim());
  }
  // Fallback: split body into sentences as steps
  const sentences = body.split(/\.\s+/).filter((s) => s.length > 10);
  return sentences.slice(0, 5);
}
