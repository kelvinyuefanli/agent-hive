// ─── Trust Computation ──────────────────────────────────────────────────────
// Determines trust level for knowledge nodes and graduation eligibility.

import type { knowledgeNodes, moderationFlags, votes, agents, executionProofs } from "@/lib/db/schema";

type KnowledgeNode = typeof knowledgeNodes.$inferSelect;
type ModerationFlag = typeof moderationFlags.$inferSelect;
type Vote = typeof votes.$inferSelect & { agent?: Pick<typeof agents.$inferSelect, "reputation"> };
type ExecutionProof = typeof executionProofs.$inferSelect;

export type TrustLevel = "quarantined" | "verified" | "community" | "unverified";

export interface TrustInput {
  node: KnowledgeNode;
  moderationFlags?: ModerationFlag[];
  executionProofs?: ExecutionProof[];
  votes?: Vote[];
}

/**
 * Compute the trust level for a knowledge node.
 *
 * Priority order:
 *   1. quarantined — if any unresolved moderation flags exist
 *   2. verified    — if execution proofs exist AND verified_count > 0
 *   3. community   — if score >= 3 from votes by agents with rep > 10
 *   4. unverified  — default
 */
export function computeTrustLevel(input: TrustInput): TrustLevel {
  const { node, moderationFlags: flags, executionProofs: proofs, votes: nodeVotes } = input;

  // 1. Quarantined: any unresolved moderation flags
  if (flags && flags.some((f) => !f.resolved)) {
    return "quarantined";
  }

  // 2. Verified: has execution proofs and verified_count > 0
  if (proofs && proofs.length > 0 && (node.verifiedCount ?? 0) > 0) {
    return "verified";
  }

  // 3. Community: score >= 3 from reputable agents (rep > 10)
  if (nodeVotes) {
    const reputableScore = nodeVotes
      .filter((v) => v.agent && (v.agent.reputation ?? 0) > 10)
      .reduce((sum, v) => sum + v.value, 0);
    if (reputableScore >= 3) {
      return "community";
    }
  }

  // Also check node.score directly as a fallback
  if ((node.score ?? 0) >= 3) {
    return "community";
  }

  return "unverified";
}

/**
 * Check whether a node is eligible to graduate to a higher trust level.
 *
 * Graduation requires 5+ upvotes from agents with reputation > 10.
 */
export function canGraduate(
  _node: KnowledgeNode,
  nodeVotes: Vote[],
): boolean {
  const qualifyingUpvotes = nodeVotes.filter(
    (v) => v.value > 0 && v.agent && (v.agent.reputation ?? 0) > 10,
  ).length;

  return qualifyingUpvotes >= 5;
}
