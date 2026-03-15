import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the db module before importing
vi.mock('../../src/lib/db', () => ({
  db: {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

vi.mock('../../src/lib/db/schema', () => ({
  searchSignals: {},
  readSignals: {},
}));

import { db } from '../../src/lib/db';
import {
  generateSessionId,
  getSignalsDropped,
  collectSearchSignal,
  collectReadSignal,
} from '../../src/lib/growth/signal-collector';

describe('generateSessionId', () => {
  it('returns a hex string', () => {
    const id = generateSessionId('test-key-hash');
    expect(id).toMatch(/^[a-f0-9]{64}$/);
  });

  it('returns same ID for same key within same 10-min window', () => {
    const id1 = generateSessionId('same-key');
    const id2 = generateSessionId('same-key');
    expect(id1).toBe(id2);
  });

  it('returns different ID for different keys', () => {
    const id1 = generateSessionId('key-a');
    const id2 = generateSessionId('key-b');
    expect(id1).not.toBe(id2);
  });

  it('returns different ID across time windows', () => {
    vi.useFakeTimers();

    const id1 = generateSessionId('time-test-key');

    // Advance past the 10-minute bucket boundary
    vi.advanceTimersByTime(600_001);

    const id2 = generateSessionId('time-test-key');
    expect(id1).not.toBe(id2);

    vi.useRealTimers();
  });
});

describe('collectSearchSignal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inserts a search signal into the database', async () => {
    const insertMock = vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });
    (db.insert as ReturnType<typeof vi.fn>).mockImplementation(insertMock);

    await collectSearchSignal({
      agent_id: 'agent-1',
      query_normalized: 'python stripe',
      tags: ['python', 'stripe'],
      results_count: 5,
    });

    expect(db.insert).toHaveBeenCalled();
  });

  it('does not throw on db error (error is caught)', async () => {
    const insertMock = vi.fn().mockReturnValue({
      values: vi.fn().mockRejectedValue(new Error('DB connection failed')),
    });
    (db.insert as ReturnType<typeof vi.fn>).mockImplementation(insertMock);

    // Should not throw
    await expect(
      collectSearchSignal({
        agent_id: 'agent-1',
        query_normalized: 'test',
        tags: [],
        results_count: 0,
      })
    ).resolves.toBeUndefined();
  });
});

describe('collectReadSignal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inserts a read signal into the database', async () => {
    const insertMock = vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });
    (db.insert as ReturnType<typeof vi.fn>).mockImplementation(insertMock);

    await collectReadSignal({
      agent_id: 'agent-1',
      node_id: '00000000-0000-0000-0000-000000000001',
      session_id: 'session-abc',
    });

    expect(db.insert).toHaveBeenCalled();
  });

  it('does not throw on db error (error is caught)', async () => {
    const insertMock = vi.fn().mockReturnValue({
      values: vi.fn().mockRejectedValue(new Error('DB connection failed')),
    });
    (db.insert as ReturnType<typeof vi.fn>).mockImplementation(insertMock);

    await expect(
      collectReadSignal({
        agent_id: 'agent-1',
        node_id: '00000000-0000-0000-0000-000000000001',
        session_id: 'session-abc',
      })
    ).resolves.toBeUndefined();
  });
});

describe('getSignalsDropped', () => {
  it('returns the counter value', () => {
    const count = getSignalsDropped();
    expect(typeof count).toBe('number');
    expect(count).toBeGreaterThanOrEqual(0);
  });
});
