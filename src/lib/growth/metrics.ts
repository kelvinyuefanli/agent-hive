import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export async function computeGraphDensity(): Promise<number> {
  const result = await db.execute(sql`
    SELECT
      (SELECT COUNT(*)::float FROM knowledge_edges) /
      NULLIF((SELECT COUNT(*)::float FROM knowledge_nodes), 0)
      AS density
  `);
  return Number(result[0]?.density ?? 0);
}

export async function computeGenerationDepth(): Promise<number> {
  const result = await db.execute(sql`
    WITH RECURSIVE chain AS (
      SELECT
        target_id AS node_id,
        source_id AS parent_id,
        1 AS depth
      FROM knowledge_edges
      WHERE relation = 'derived_from'

      UNION ALL

      SELECT
        c.node_id,
        e.source_id AS parent_id,
        c.depth + 1
      FROM chain c
      JOIN knowledge_edges e
        ON e.target_id = c.parent_id
        AND e.relation = 'derived_from'
      WHERE c.depth < 10
    )
    SELECT COALESCE(AVG(max_depth), 0) AS avg_depth
    FROM (
      SELECT node_id, MAX(depth) AS max_depth
      FROM chain
      GROUP BY node_id
    ) depths
  `);
  return Number(result[0]?.avg_depth ?? 0);
}

export async function computeSpawnRate(): Promise<number> {
  const result = await db.execute(sql`
    SELECT
      COUNT(DISTINCT target_id)::float /
      NULLIF((SELECT COUNT(*)::float FROM knowledge_nodes), 0)
      AS spawn_rate
    FROM knowledge_edges
    WHERE relation = 'derived_from'
  `);
  return Number(result[0]?.spawn_rate ?? 0);
}

export async function computeVerificationVelocity(): Promise<number> {
  const result = await db.execute(sql`
    SELECT
      (SELECT COUNT(*)::float FROM execution_proofs WHERE created_at > NOW() - INTERVAL '24 hours') /
      NULLIF((SELECT COUNT(*)::float FROM knowledge_nodes), 0)
      AS velocity
  `);
  return Number(result[0]?.velocity ?? 0);
}

export async function computeDemandFillRate(): Promise<number> {
  const result = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (
        WHERE EXISTS (
          SELECT 1 FROM knowledge_edges ke
          WHERE ke.target_id = kn.id AND ke.relation = 'answers'
        )
      )::float /
      NULLIF(COUNT(*)::float, 0)
      AS fill_rate
    FROM knowledge_nodes kn
    WHERE kn.type = 'wanted'
      AND kn.created_at > NOW() - INTERVAL '7 days'
  `);
  return Number(result[0]?.fill_rate ?? 0);
}

export async function computeImplicitEdgeRatio(): Promise<number> {
  const result = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE auto_generated = true)::float /
      NULLIF(COUNT(*) FILTER (WHERE auto_generated = false)::float, 0)
      AS ratio
    FROM knowledge_edges
  `);
  return Number(result[0]?.ratio ?? 0);
}

export async function computeGraphHealthScore(): Promise<number> {
  const [density, depth, spawn, velocity, fillRate, edgeRatio] =
    await Promise.all([
      computeGraphDensity(),
      computeGenerationDepth(),
      computeSpawnRate(),
      computeVerificationVelocity(),
      computeDemandFillRate(),
      computeImplicitEdgeRatio(),
    ]);

  // Weighted composite score (0-100)
  // Each metric is normalized to roughly 0-1 range, then weighted
  const weights = {
    density: 20,       // edges per node, capped at ~5
    depth: 15,         // avg chain depth, capped at ~5
    spawn: 15,         // fraction of nodes derived
    velocity: 15,      // proofs per node per day
    fillRate: 20,      // fraction of demands answered
    edgeRatio: 15,     // implicit / explicit edges
  };

  const normalizedDensity = Math.min(density / 5, 1);
  const normalizedDepth = Math.min(depth / 5, 1);
  const normalizedSpawn = Math.min(spawn, 1);
  const normalizedVelocity = Math.min(velocity * 10, 1);
  const normalizedFillRate = Math.min(fillRate, 1);
  const normalizedEdgeRatio = Math.min(edgeRatio / 2, 1);

  const score =
    normalizedDensity * weights.density +
    normalizedDepth * weights.depth +
    normalizedSpawn * weights.spawn +
    normalizedVelocity * weights.velocity +
    normalizedFillRate * weights.fillRate +
    normalizedEdgeRatio * weights.edgeRatio;

  return Math.round(Math.max(0, Math.min(100, score)));
}
