import { db } from "@/lib/db";
import { searchSignals, readSignals } from "@/lib/db/schema";
import { sql } from "drizzle-orm";
import { checkCircuitBreaker } from "./circuit-breaker";
import { demandDetection } from "./jobs/demand-detection";
import { coOccurrence } from "./jobs/co-occurrence";
import { freshness } from "./jobs/freshness";
import { trustCascade } from "./jobs/trust-cascade";
import { domainExpertise } from "./jobs/domain-expertise";
import { outcomeMining } from "./jobs/outcome-mining";
import { strategyGenesis } from "./jobs/strategy-genesis";
import { strategyFitness } from "./jobs/strategy-fitness";
import type { EnricherJob } from "./jobs/demand-detection";

const ENRICHER_LOCK_ID = 42_000_001;
const SIGNAL_TTL_HOURS = 24;
const DELETE_BATCH_SIZE = 5000;
const OUTCOME_TTL_HOURS = 168; // 7 days

interface JobConfig {
  job: EnricherJob;
  envVar: string;
  shortName: string;
}

const jobConfigs: JobConfig[] = [
  { job: demandDetection, envVar: "ENABLE_DEMAND_DETECTION", shortName: "demand" },
  { job: coOccurrence, envVar: "ENABLE_CO_OCCURRENCE", shortName: "co_occurrence" },
  { job: freshness, envVar: "ENABLE_FRESHNESS", shortName: "freshness" },
  { job: trustCascade, envVar: "ENABLE_TRUST_CASCADE", shortName: "trust_cascade" },
  { job: domainExpertise, envVar: "ENABLE_DOMAIN_EXPERTISE", shortName: "domain_expertise" },
  { job: outcomeMining, envVar: "ENABLE_OUTCOME_MINING", shortName: "outcome_mining" },
  { job: strategyGenesis, envVar: "ENABLE_STRATEGY_GENESIS", shortName: "strategy_genesis" },
  { job: strategyFitness, envVar: "ENABLE_STRATEGY_FITNESS", shortName: "strategy_fitness" },
];

function isJobEnabled(envVar: string): boolean {
  return (process.env[envVar] ?? "true") === "true";
}

export async function runEnricherCycle(): Promise<void> {
  const startTime = Date.now();

  // 1. Acquire advisory lock
  const lockResult = await db.execute(
    sql`SELECT pg_try_advisory_lock(${ENRICHER_LOCK_ID}) AS acquired`,
  );

  const acquired = lockResult[0]?.acquired;
  if (!acquired) {
    console.log("[enricher] Enricher already running, skipping cycle");
    return;
  }

  try {
    // 2. Check circuit breaker (graceful if schema incomplete)
    let breaker = { tripped: false, reason: undefined as string | undefined };
    try {
      breaker = await checkCircuitBreaker();
    } catch (error) {
      console.warn("[enricher] Circuit breaker check failed (schema may be incomplete):", error);
    }
    if (breaker.tripped) {
      const durationMs = Date.now() - startTime;
      console.log(
        JSON.stringify({
          event: "enricher_cycle",
          duration_ms: durationMs,
          circuit_breaker: "paused",
          jobs_run: [],
          jobs_skipped: jobConfigs.map((c) => c.shortName),
          signals_swept: 0,
        }),
      );
      return;
    }

    // 3. Determine which jobs to run based on feature flags
    const jobsRun: string[] = [];
    const jobsSkipped: string[] = [];

    for (const config of jobConfigs) {
      if (isJobEnabled(config.envVar)) {
        jobsRun.push(config.shortName);
      } else {
        jobsSkipped.push(config.shortName);
      }
    }

    // 4. Run enabled jobs in a single transaction
    const results: Record<string, { processed: number; created: number }> = {};

    await db.transaction(async (tx) => {
      for (const config of jobConfigs) {
        if (!isJobEnabled(config.envVar)) continue;
        try {
          const result = await config.job.process(tx);
          results[config.job.name] = result;
        } catch (error) {
          console.warn(`[enricher] Job ${config.shortName} failed (skipping):`, error);
          results[config.job.name] = { processed: 0, created: 0 };
        }
      }

      // Batched TTL sweep: delete signals older than 24h in batches
      let totalSearchDeleted = 0;
      let totalReadDeleted = 0;

      // Batched delete for search_signals
      let deleted: number;
      do {
        const result = await tx.execute(sql`
          WITH deleted AS (
            DELETE FROM search_signals
            WHERE id IN (
              SELECT id FROM search_signals
              WHERE created_at < NOW() - INTERVAL '${sql.raw(String(SIGNAL_TTL_HOURS))} hours'
              LIMIT ${DELETE_BATCH_SIZE}
            )
            RETURNING id
          )
          SELECT count(*)::int AS cnt FROM deleted
        `);
        deleted = Number((result as unknown as Array<{ cnt: number }>)[0]?.cnt ?? 0);
        totalSearchDeleted += deleted;
      } while (deleted >= DELETE_BATCH_SIZE);

      // Batched delete for read_signals
      do {
        const result = await tx.execute(sql`
          WITH deleted AS (
            DELETE FROM read_signals
            WHERE id IN (
              SELECT id FROM read_signals
              WHERE created_at < NOW() - INTERVAL '${sql.raw(String(SIGNAL_TTL_HOURS))} hours'
              LIMIT ${DELETE_BATCH_SIZE}
            )
            RETURNING id
          )
          SELECT count(*)::int AS cnt FROM deleted
        `);
        deleted = Number((result as unknown as Array<{ cnt: number }>)[0]?.cnt ?? 0);
        totalReadDeleted += deleted;
      } while (deleted >= DELETE_BATCH_SIZE);

      // Batched delete for new tables (7-day TTL) — graceful if tables don't exist yet
      let totalOutcomeDeleted = 0;
      let totalUsageDeleted = 0;
      let totalFailureDeleted = 0;

      for (const table of ["outcome_reports", "usage_reports", "failure_reports"]) {
        try {
          let tableDeleted = 0;
          do {
            const result = await tx.execute(sql`
              WITH deleted AS (
                DELETE FROM ${sql.raw(table)}
                WHERE id IN (
                  SELECT id FROM ${sql.raw(table)}
                  WHERE created_at < NOW() - INTERVAL '${sql.raw(String(OUTCOME_TTL_HOURS))} hours'
                  LIMIT ${DELETE_BATCH_SIZE}
                )
                RETURNING id
              )
              SELECT count(*)::int AS cnt FROM deleted
            `);
            deleted = Number((result as unknown as Array<{ cnt: number }>)[0]?.cnt ?? 0);
            tableDeleted += deleted;
          } while (deleted >= DELETE_BATCH_SIZE);
          if (table === "outcome_reports") totalOutcomeDeleted = tableDeleted;
          else if (table === "usage_reports") totalUsageDeleted = tableDeleted;
          else totalFailureDeleted = tableDeleted;
        } catch {
          // Table may not exist yet — skip silently
        }
      }

      // Store sweep count for logging
      (results as any).__signalsSwept = totalSearchDeleted + totalReadDeleted + totalOutcomeDeleted + totalUsageDeleted + totalFailureDeleted;
    });

    // 5. Structured JSON log
    const durationMs = Date.now() - startTime;
    const signalsSwept = (results as any).__signalsSwept ?? 0;

    console.log(
      JSON.stringify({
        event: "enricher_cycle",
        duration_ms: durationMs,
        circuit_breaker: "open",
        jobs_run: jobsRun,
        jobs_skipped: jobsSkipped,
        signals_swept: signalsSwept,
      }),
    );
  } finally {
    // 6. Release advisory lock
    await db.execute(sql`SELECT pg_advisory_unlock(${ENRICHER_LOCK_ID})`);
  }
}
