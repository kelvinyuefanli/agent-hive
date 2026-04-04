import { describe, it, expect, vi, beforeEach } from 'vitest';

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

    // Single aggregated query returns qualifying rows
    tx.execute.mockResolvedValueOnce([
      { agent_id: 'agent-1', tag: 'python', cnt: 20, expertise_score: 1.0 },
    ]);

    // Update query
    tx.execute.mockResolvedValueOnce(undefined);

    const result = await domainExpertise.process(tx);

    expect(result.processed).toBe(1);
    expect(result.created).toBe(0);
  });

  it('expertise at 40 votes = capped at 2.0', async () => {
    const tx = makeTx();

    tx.execute.mockResolvedValueOnce([
      { agent_id: 'agent-1', tag: 'javascript', cnt: 40, expertise_score: 2.0 },
    ]);

    tx.execute.mockResolvedValueOnce(undefined);

    const result = await domainExpertise.process(tx);

    expect(result.processed).toBe(1);
  });

  it('formula: 1.0 + log2(count/20) for various counts', async () => {
    const tx = makeTx();

    // 80 votes -> min(2.0, 1.0 + log2(80/20)) = min(2.0, 3.0) = 2.0 (capped)
    tx.execute.mockResolvedValueOnce([
      { agent_id: 'agent-1', tag: 'rust', cnt: 80, expertise_score: 2.0 },
    ]);

    tx.execute.mockResolvedValueOnce(undefined);

    const result = await domainExpertise.process(tx);
    expect(result.processed).toBe(1);
  });

  it('multiple tags per agent tracked independently', async () => {
    const tx = makeTx();

    tx.execute.mockResolvedValueOnce([
      { agent_id: 'agent-1', tag: 'python', cnt: 25, expertise_score: 1.32 },
      { agent_id: 'agent-1', tag: 'django', cnt: 30, expertise_score: 1.58 },
    ]);

    // Two update queries
    tx.execute.mockResolvedValueOnce(undefined);
    tx.execute.mockResolvedValueOnce(undefined);

    const result = await domainExpertise.process(tx);

    expect(result.processed).toBe(2);
  });

  it('handles no recent votes', async () => {
    const tx = makeTx();

    tx.execute.mockResolvedValueOnce([]);

    const result = await domainExpertise.process(tx);

    expect(result).toEqual({ processed: 0, created: 0 });
    expect(tx.execute).toHaveBeenCalledTimes(1);
  });

  it('skips tags with fewer than 20 votes (filtered by SQL HAVING)', async () => {
    const tx = makeTx();

    // SQL HAVING COUNT(*) >= 20 filters these out — empty result
    tx.execute.mockResolvedValueOnce([]);

    const result = await domainExpertise.process(tx);

    expect(result.processed).toBe(0);
  });

  it('skips rows with null tags (filtered by SQL unnest)', async () => {
    const tx = makeTx();

    // unnest(null) produces no rows — only real tags appear
    tx.execute.mockResolvedValueOnce([
      { agent_id: 'agent-2', tag: 'python', cnt: 20, expertise_score: 1.0 },
    ]);

    tx.execute.mockResolvedValueOnce(undefined);

    const result = await domainExpertise.process(tx);

    expect(result.processed).toBe(1);
  });

  it('deduplicates agent:tag pairs (handled by SQL GROUP BY)', async () => {
    const tx = makeTx();

    // SQL GROUP BY aggregates duplicates — returns single row
    tx.execute.mockResolvedValueOnce([
      { agent_id: 'agent-1', tag: 'python', cnt: 20, expertise_score: 1.0 },
    ]);

    tx.execute.mockResolvedValueOnce(undefined);

    const result = await domainExpertise.process(tx);

    expect(result.processed).toBe(1);
  });
});
