import { describe, it, expect } from 'vitest';
import { computeTrustLevel, canGraduate } from '../../src/lib/safety/trust';

// Helper to create minimal node object
function makeNode(overrides: Record<string, unknown> = {}) {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    type: 'answer' as const,
    title: 'Test node',
    body: 'Test body',
    agentId: '00000000-0000-0000-0000-000000000002',
    envContext: null,
    tags: [],
    score: 0,
    verifiedCount: 0,
    demandScore: 0,
    lastReadAt: null,
    freshness: 1.0,
    provenanceTrust: 0.0,
    trustLevel: 'unverified' as const,
    searchVec: '' as unknown,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeVote(value: number, reputation: number) {
  return {
    id: crypto.randomUUID(),
    nodeId: '00000000-0000-0000-0000-000000000001',
    agentId: crypto.randomUUID(),
    value,
    createdAt: new Date(),
    agent: { reputation },
  };
}

function makeFlag(resolved: boolean) {
  return {
    id: crypto.randomUUID(),
    nodeId: '00000000-0000-0000-0000-000000000001',
    agentId: crypto.randomUUID(),
    reason: 'Test flag',
    resolved,
    createdAt: new Date(),
  };
}

function makeProof() {
  return {
    id: crypto.randomUUID(),
    nodeId: '00000000-0000-0000-0000-000000000001',
    agentId: crypto.randomUUID(),
    envInfo: {},
    stdout: 'ok',
    exitCode: 0,
    success: true,
    createdAt: new Date(),
  };
}

describe('computeTrustLevel', () => {
  it('returns "unverified" for a new node with no data', () => {
    const node = makeNode();
    const result = computeTrustLevel({ node });
    expect(result).toBe('unverified');
  });

  it('returns "quarantined" when unresolved moderation flags exist', () => {
    const node = makeNode();
    const result = computeTrustLevel({
      node,
      moderationFlags: [makeFlag(false)],
    });
    expect(result).toBe('quarantined');
  });

  it('does not quarantine when all flags are resolved', () => {
    const node = makeNode();
    const result = computeTrustLevel({
      node,
      moderationFlags: [makeFlag(true)],
    });
    expect(result).not.toBe('quarantined');
  });

  it('returns "verified" when execution proofs exist and verifiedCount > 0', () => {
    const node = makeNode({ verifiedCount: 1 });
    const result = computeTrustLevel({
      node,
      executionProofs: [makeProof()],
    });
    expect(result).toBe('verified');
  });

  it('does not return "verified" when proofs exist but verifiedCount is 0', () => {
    const node = makeNode({ verifiedCount: 0 });
    const result = computeTrustLevel({
      node,
      executionProofs: [makeProof()],
    });
    expect(result).not.toBe('verified');
  });

  it('returns "community" when reputable vote score >= 3', () => {
    const node = makeNode();
    const votes = [
      makeVote(1, 20),
      makeVote(1, 15),
      makeVote(1, 30),
    ];
    const result = computeTrustLevel({ node, votes });
    expect(result).toBe('community');
  });

  it('does not return "community" when votes are from low-rep agents', () => {
    const node = makeNode();
    const votes = [
      makeVote(1, 5),
      makeVote(1, 3),
      makeVote(1, 8),
    ];
    const result = computeTrustLevel({ node, votes });
    // Score from rep>10 agents is 0, falls through to node.score check
    expect(result).toBe('unverified');
  });

  it('returns "community" via node.score fallback when score >= 3', () => {
    const node = makeNode({ score: 5 });
    const result = computeTrustLevel({ node });
    expect(result).toBe('community');
  });

  it('quarantined takes priority over verified', () => {
    const node = makeNode({ verifiedCount: 1 });
    const result = computeTrustLevel({
      node,
      moderationFlags: [makeFlag(false)],
      executionProofs: [makeProof()],
    });
    expect(result).toBe('quarantined');
  });

  it('verified takes priority over community', () => {
    const node = makeNode({ verifiedCount: 1, score: 10 });
    const result = computeTrustLevel({
      node,
      executionProofs: [makeProof()],
      votes: [makeVote(1, 20), makeVote(1, 20), makeVote(1, 20)],
    });
    expect(result).toBe('verified');
  });
});

describe('canGraduate', () => {
  it('returns false with only 4 qualifying upvotes', () => {
    const node = makeNode();
    const votes = Array.from({ length: 4 }, () => makeVote(1, 20));
    expect(canGraduate(node, votes)).toBe(false);
  });

  it('returns true with 5 qualifying upvotes from rep>10 agents', () => {
    const node = makeNode();
    const votes = Array.from({ length: 5 }, () => makeVote(1, 20));
    expect(canGraduate(node, votes)).toBe(true);
  });

  it('returns false with 5 votes from rep<10 agents', () => {
    const node = makeNode();
    const votes = Array.from({ length: 5 }, () => makeVote(1, 5));
    expect(canGraduate(node, votes)).toBe(false);
  });

  it('returns false when votes are downvotes (value <= 0)', () => {
    const node = makeNode();
    const votes = Array.from({ length: 5 }, () => makeVote(-1, 20));
    expect(canGraduate(node, votes)).toBe(false);
  });

  it('returns true with more than 5 qualifying upvotes', () => {
    const node = makeNode();
    const votes = Array.from({ length: 10 }, () => makeVote(1, 50));
    expect(canGraduate(node, votes)).toBe(true);
  });

  it('returns false with empty votes array', () => {
    const node = makeNode();
    expect(canGraduate(node, [])).toBe(false);
  });

  it('only counts upvotes from high-rep agents', () => {
    const node = makeNode();
    const votes = [
      makeVote(1, 5),   // low rep, doesn't count
      makeVote(1, 20),  // counts
      makeVote(1, 15),  // counts
      makeVote(-1, 50), // downvote, doesn't count
      makeVote(1, 12),  // counts
      makeVote(1, 100), // counts
      makeVote(1, 11),  // counts -> 5 qualifying
    ];
    expect(canGraduate(node, votes)).toBe(true);
  });
});
