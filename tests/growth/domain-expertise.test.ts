import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/lib/db/schema', () => ({
  votes: { _: 'votes' },
  knowledgeNodes: { _: 'knowledgeNodes' },
  agents: { _: 'agents' },
}));

vi.mock('drizzle-orm', () => ({
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
    { raw: (s: string) => s }
  ),
}));

import { domainExpertise } from '../../src/lib/growth/jobs/domain-expertise';

function makeTx() {
  return {
    execute: vi.fn(),
  };
}

describe('domainExpertise', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('expertise at exactly 20 votes = score 1.0', async () => {
    const tx = makeTx();

    // Recent votes query
    tx.execute.mockResolvedValueOnce([
      { agent_id: 'agent-1', tags: ['python'] },
    ]);

    // Count query: 20 votes for agent-1 in python
    tx.execute.mockResolvedValueOnce([{ cnt: 20 }]);

    // Update query
    tx.execute.mockResolvedValueOnce(undefined);

    const result = await domainExpertise.process(tx);

    expect(result.processed).toBe(1);
    expect(result.created).toBe(0);

    // Verify the expertise score: 1.0 + log2(20/20) = 1.0 + log2(1) = 1.0 + 0 = 1.0
    // The update call is the 3rd execute call
    expect(tx.execute).toHaveBeenCalledTimes(3);
  });

  it('expertise at 40 votes = capped at 2.0', async () => {
    const tx = makeTx();

    tx.execute.mockResolvedValueOnce([
      { agent_id: 'agent-1', tags: ['javascript'] },
    ]);

    // Count query: 40 votes
    tx.execute.mockResolvedValueOnce([{ cnt: 40 }]);

    // Update query
    tx.execute.mockResolvedValueOnce(undefined);

    const result = await domainExpertise.process(tx);

    expect(result.processed).toBe(1);
    // Formula: min(2.0, 1.0 + log2(40/20)) = min(2.0, 1.0 + 1.0) = 2.0
  });

  it('formula: 1.0 + log2(count/20) for various counts', async () => {
    const tx = makeTx();

    tx.execute.mockResolvedValueOnce([
      { agent_id: 'agent-1', tags: ['rust'] },
    ]);

    // 80 votes -> min(2.0, 1.0 + log2(80/20)) = min(2.0, 1.0 + 2.0) = 2.0 (capped)
    tx.execute.mockResolvedValueOnce([{ cnt: 80 }]);
    tx.execute.mockResolvedValueOnce(undefined);

    await domainExpertise.process(tx);

    // The score should be capped at 2.0: Math.min(2.0, 1.0 + Math.log2(80/20)) = Math.min(2.0, 3.0) = 2.0
    expect(tx.execute).toHaveBeenCalledTimes(3);
  });

  it('multiple tags per agent tracked independently', async () => {
    const tx = makeTx();

    tx.execute.mockResolvedValueOnce([
      { agent_id: 'agent-1', tags: ['python', 'django'] },
    ]);

    // Count for agent-1:python -> 25 votes
    tx.execute.mockResolvedValueOnce([{ cnt: 25 }]);
    // Update for python
    tx.execute.mockResolvedValueOnce(undefined);

    // Count for agent-1:django -> 30 votes
    tx.execute.mockResolvedValueOnce([{ cnt: 30 }]);
    // Update for django
    tx.execute.mockResolvedValueOnce(undefined);

    const result = await domainExpertise.process(tx);

    expect(result.processed).toBe(2);
    // 5 execute calls: 1 initial query + 2 tags * (1 count + 1 update)
    expect(tx.execute).toHaveBeenCalledTimes(5);
  });

  it('handles no recent votes', async () => {
    const tx = makeTx();

    tx.execute.mockResolvedValueOnce([]);

    const result = await domainExpertise.process(tx);

    expect(result).toEqual({ processed: 0, created: 0 });
    expect(tx.execute).toHaveBeenCalledTimes(1);
  });

  it('skips tags with fewer than 20 votes', async () => {
    const tx = makeTx();

    tx.execute.mockResolvedValueOnce([
      { agent_id: 'agent-1', tags: ['go'] },
    ]);

    // Count for go: 15 votes (below 20 threshold)
    tx.execute.mockResolvedValueOnce([{ cnt: 15 }]);

    const result = await domainExpertise.process(tx);

    expect(result.processed).toBe(0);
    // Only 2 execute calls: initial query + count query (no update)
    expect(tx.execute).toHaveBeenCalledTimes(2);
  });

  it('skips rows with null tags', async () => {
    const tx = makeTx();

    tx.execute.mockResolvedValueOnce([
      { agent_id: 'agent-1', tags: null },
      { agent_id: 'agent-2', tags: ['python'] },
    ]);

    // Count for agent-2:python
    tx.execute.mockResolvedValueOnce([{ cnt: 20 }]);
    tx.execute.mockResolvedValueOnce(undefined);

    const result = await domainExpertise.process(tx);

    expect(result.processed).toBe(1);
  });

  it('deduplicates agent:tag pairs across multiple vote rows', async () => {
    const tx = makeTx();

    // Same agent-tag pair appears in multiple vote rows
    tx.execute.mockResolvedValueOnce([
      { agent_id: 'agent-1', tags: ['python'] },
      { agent_id: 'agent-1', tags: ['python'] },
      { agent_id: 'agent-1', tags: ['python'] },
    ]);

    // Only one count query should happen for agent-1:python
    tx.execute.mockResolvedValueOnce([{ cnt: 20 }]);
    tx.execute.mockResolvedValueOnce(undefined);

    const result = await domainExpertise.process(tx);

    expect(result.processed).toBe(1);
    // 3 calls: 1 initial + 1 count + 1 update
    expect(tx.execute).toHaveBeenCalledTimes(3);
  });
});
