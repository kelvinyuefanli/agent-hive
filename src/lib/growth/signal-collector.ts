import { createHash } from "crypto";
import { db } from "@/lib/db";
import { searchSignals, readSignals } from "@/lib/db/schema";

// ─── Signal event types ─────────────────────────────────────────────────────

export type SearchSignalEvent = {
  agent_id: string;
  query_normalized: string;
  tags: string[];
  results_count: number;
};

export type ReadSignalEvent = {
  agent_id: string;
  node_id: string;
  session_id: string;
};

export type NodeCreatedEvent = {
  agent_id: string;
  node_id: string;
  influenced_by: string[];
  tags: string[];
};

export type VoteCastEvent = {
  agent_id: string;
  node_id: string;
  value: number;
  node_tags: string[];
};

export type ProofSubmittedEvent = {
  agent_id: string;
  node_id: string;
  env_info: Record<string, unknown>;
  success: boolean;
};

// ─── Module-level dropped counter ───────────────────────────────────────────

let signalsDropped = 0;

// ─── Collectors ─────────────────────────────────────────────────────────────

export async function collectSearchSignal(
  event: SearchSignalEvent,
): Promise<void> {
  try {
    await db.insert(searchSignals).values({
      agentId: event.agent_id,
      queryNormalized: event.query_normalized,
      tags: event.tags,
      resultsCount: event.results_count,
    });
  } catch (error) {
    signalsDropped++;
    console.error(
      `[signal-collector] Failed to collect search signal for agent=${event.agent_id} type=search:`,
      error,
    );
  }
}

export async function collectReadSignal(
  event: ReadSignalEvent,
): Promise<void> {
  try {
    await db.insert(readSignals).values({
      agentId: event.agent_id,
      nodeId: event.node_id,
      sessionId: event.session_id,
    });
  } catch (error) {
    signalsDropped++;
    console.error(
      `[signal-collector] Failed to collect read signal for agent=${event.agent_id} type=read:`,
      error,
    );
  }
}

// ─── Session ID generation ──────────────────────────────────────────────────

export function generateSessionId(orgKeyHash: string): string {
  const bucket = Math.floor(Date.now() / 600_000);
  return createHash("sha256")
    .update(orgKeyHash + bucket)
    .digest("hex");
}

// ─── Metrics ────────────────────────────────────────────────────────────────

export function getSignalsDropped(): number {
  return signalsDropped;
}
