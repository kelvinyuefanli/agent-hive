import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/lib/db/schema', () => ({
  knowledgeEdges: {
    relation: 'relation',
    createdAt: 'created_at',
  },
  knowledgeNodes: {
    id: 'id',
  },
}));

vi.mock('drizzle-orm', () => ({
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
    { raw: (s: string) => s }
  ),
}));

import { trustCascade } from '../../src/lib/growth/jobs/trust-cascade';

function makeTx() {
  return {
    select: vi.fn(),
    execute: vi.fn().mockResolvedValue(undefined),
  };
}

describe('trustCascade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('boosts provenance_trust by 0.1 per derived_from edge', async () => {
    const tx = makeTx();

    const recentEdges = [
      { sourceId: 'nodeA', targetId: 'nodeB', relation: 'derived_from' },
    ];

    // select from knowledgeEdges
    tx.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(recentEdges),
      }),
    });

    // select from knowledgeNodes for nodeA
    tx.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ id: 'nodeA', provenanceTrust: 0 }]),
      }),
    });

    const result = await trustCascade.process(tx);

    expect(result.processed).toBe(1);
    expect(result.created).toBe(0);
    expect(tx.execute).toHaveBeenCalledTimes(1);
  });

  it('caps total provenance_trust at 0.3', async () => {
    const tx = makeTx();

    const recentEdges = [
      { sourceId: 'nodeA', targetId: 'nodeB', relation: 'derived_from' },
    ];

    tx.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(recentEdges),
      }),
    });

    // Node already at 0.25 trust, so boost should be min(0.1, 0.3 - 0.25) = 0.05
    tx.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ id: 'nodeA', provenanceTrust: 0.25 }]),
      }),
    });

    const result = await trustCascade.process(tx);

    expect(result.processed).toBe(1);
    expect(tx.execute).toHaveBeenCalledTimes(1);
  });

  it('no boost when already at cap (0.3)', async () => {
    const tx = makeTx();

    const recentEdges = [
      { sourceId: 'nodeA', targetId: 'nodeB', relation: 'derived_from' },
    ];

    tx.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(recentEdges),
      }),
    });

    // Node already at 0.3 trust
    tx.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ id: 'nodeA', provenanceTrust: 0.3 }]),
      }),
    });

    const result = await trustCascade.process(tx);

    // boost = min(0.1, 0.3 - 0.3) = 0, so no update
    expect(result.processed).toBe(0);
    expect(tx.execute).not.toHaveBeenCalled();
  });

  it('cycle detection: skips already-visited source nodes', async () => {
    const tx = makeTx();

    // Two edges with the same sourceId (simulating A->B and A->C)
    const recentEdges = [
      { sourceId: 'nodeA', targetId: 'nodeB', relation: 'derived_from' },
      { sourceId: 'nodeA', targetId: 'nodeC', relation: 'derived_from' },
    ];

    tx.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(recentEdges),
      }),
    });

    // Only one lookup for nodeA (second is skipped due to visited set)
    tx.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ id: 'nodeA', provenanceTrust: 0 }]),
      }),
    });

    const result = await trustCascade.process(tx);

    // Only processed once despite two edges from same source
    expect(result.processed).toBe(1);
    // select called twice: once for edges, once for nodeA lookup
    expect(tx.select).toHaveBeenCalledTimes(2);
  });

  it('handles empty recent edges', async () => {
    const tx = makeTx();

    tx.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    });

    const result = await trustCascade.process(tx);

    expect(result).toEqual({ processed: 0, created: 0 });
    expect(tx.execute).not.toHaveBeenCalled();
  });

  it('skips source nodes that do not exist in knowledge_nodes', async () => {
    const tx = makeTx();

    const recentEdges = [
      { sourceId: 'nonexistent', targetId: 'nodeB', relation: 'derived_from' },
    ];

    tx.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(recentEdges),
      }),
    });

    // Node not found
    tx.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    });

    const result = await trustCascade.process(tx);

    expect(result.processed).toBe(0);
    expect(tx.execute).not.toHaveBeenCalled();
  });

  it('processes multiple distinct source nodes independently', async () => {
    const tx = makeTx();

    const recentEdges = [
      { sourceId: 'nodeA', targetId: 'nodeX', relation: 'derived_from' },
      { sourceId: 'nodeB', targetId: 'nodeY', relation: 'derived_from' },
    ];

    tx.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(recentEdges),
      }),
    });

    // nodeA lookup
    tx.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ id: 'nodeA', provenanceTrust: 0 }]),
      }),
    });

    // nodeB lookup
    tx.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ id: 'nodeB', provenanceTrust: 0.1 }]),
      }),
    });

    const result = await trustCascade.process(tx);

    expect(result.processed).toBe(2);
    expect(tx.execute).toHaveBeenCalledTimes(2);
  });
});
