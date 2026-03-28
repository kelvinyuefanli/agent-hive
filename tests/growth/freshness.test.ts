import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/lib/db/schema', () => ({
  readSignals: { _: 'readSignals' },
  knowledgeNodes: { _: 'knowledgeNodes' },
}));

vi.mock('drizzle-orm', () => ({
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
    { raw: (s: string) => s }
  ),
}));

import { freshness } from '../../src/lib/growth/jobs/freshness';

function makeTx() {
  return {
    select: vi.fn(),
    execute: vi.fn().mockResolvedValue(undefined),
  };
}

describe('freshness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates last_read_at on nodes with recent read signals', async () => {
    const tx = makeTx();

    const signals = [
      { nodeId: 'node-1' },
      { nodeId: 'node-2' },
      { nodeId: 'node-1' }, // duplicate
      { nodeId: 'node-3' },
    ];

    tx.select.mockReturnValueOnce({
      from: vi.fn().mockResolvedValue(signals),
    });

    const result = await freshness.process(tx);

    expect(result.processed).toBe(3); // 3 unique node IDs
    expect(result.created).toBe(0);
    // 1 for batch node update + 1 for usage_reports query (which may fail gracefully)
    expect(tx.execute).toHaveBeenCalled();
  });

  it('skips when no read signals exist', async () => {
    const tx = makeTx();

    tx.select.mockReturnValueOnce({
      from: vi.fn().mockResolvedValue([]),
    });

    const result = await freshness.process(tx);

    expect(result).toEqual({ processed: 0, created: 0 });
    expect(tx.execute).not.toHaveBeenCalled();
  });

  it('returns correct processed count for unique nodes', async () => {
    const tx = makeTx();

    const signals = [
      { nodeId: 'node-A' },
      { nodeId: 'node-A' },
      { nodeId: 'node-A' },
      { nodeId: 'node-B' },
      { nodeId: 'node-C' },
      { nodeId: 'node-C' },
    ];

    tx.select.mockReturnValueOnce({
      from: vi.fn().mockResolvedValue(signals),
    });

    const result = await freshness.process(tx);

    expect(result.processed).toBe(3); // A, B, C
    expect(result.created).toBe(0);
  });

  it('always returns created: 0 (freshness never creates nodes)', async () => {
    const tx = makeTx();

    const signals = [{ nodeId: 'node-1' }, { nodeId: 'node-2' }];

    tx.select.mockReturnValueOnce({
      from: vi.fn().mockResolvedValue(signals),
    });

    const result = await freshness.process(tx);

    expect(result.created).toBe(0);
  });
});
