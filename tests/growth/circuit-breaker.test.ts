import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the db module before importing the circuit breaker
vi.mock('../../src/lib/db', () => ({
  db: {
    select: vi.fn(),
    execute: vi.fn(),
  },
}));

vi.mock('../../src/lib/db/schema', () => ({
  circuitBreakerStats: {
    date: 'date',
    isPaused: 'is_paused',
  },
}));

vi.mock('drizzle-orm', () => ({
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
    { raw: (s: string) => s }
  ),
  eq: (col: unknown, val: unknown) => ({ col, val }),
}));

import { db } from '../../src/lib/db';
import { checkCircuitBreaker, resetCircuitBreaker } from '../../src/lib/growth/circuit-breaker';

describe('checkCircuitBreaker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns not tripped when today total is below 2x average', async () => {
    // Mock: today's stats with moderate counts
    const selectMock = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{
          demandNodesCreated: 5,
          coOccurEdgesCreated: 3,
          isPaused: false,
        }]),
      }),
    });
    (db.select as ReturnType<typeof vi.fn>).mockImplementation(selectMock);

    // Mock: trailing 7-day average is 10 (so threshold = 20, today = 8)
    (db.execute as ReturnType<typeof vi.fn>).mockResolvedValue([{ avg_daily: 10 }]);

    const result = await checkCircuitBreaker();
    expect(result.tripped).toBe(false);
  });

  it('returns tripped when today total exceeds 2x average', async () => {
    const selectMock = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{
          demandNodesCreated: 30,
          coOccurEdgesCreated: 25,
          isPaused: false,
        }]),
      }),
    });
    (db.select as ReturnType<typeof vi.fn>).mockImplementation(selectMock);

    // Average is 10, today total is 55 > 20
    (db.execute as ReturnType<typeof vi.fn>).mockResolvedValue([{ avg_daily: 10 }]);

    const result = await checkCircuitBreaker();
    expect(result.tripped).toBe(true);
    expect(result.reason).toContain('exceeds 2x');
  });

  it('returns tripped when manually paused', async () => {
    const selectMock = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{
          demandNodesCreated: 0,
          coOccurEdgesCreated: 0,
          isPaused: true,
        }]),
      }),
    });
    (db.select as ReturnType<typeof vi.fn>).mockImplementation(selectMock);

    const result = await checkCircuitBreaker();
    expect(result.tripped).toBe(true);
    expect(result.reason).toContain('manually paused');
  });

  it('returns not tripped when no historical data exists (avgDaily = 0)', async () => {
    const selectMock = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{
          demandNodesCreated: 5,
          coOccurEdgesCreated: 3,
          isPaused: false,
        }]),
      }),
    });
    (db.select as ReturnType<typeof vi.fn>).mockImplementation(selectMock);

    // No historical data
    (db.execute as ReturnType<typeof vi.fn>).mockResolvedValue([{ avg_daily: 0 }]);

    const result = await checkCircuitBreaker();
    expect(result.tripped).toBe(false);
  });

  it('returns not tripped when no today stats exist', async () => {
    const selectMock = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),  // no rows
      }),
    });
    (db.select as ReturnType<typeof vi.fn>).mockImplementation(selectMock);

    (db.execute as ReturnType<typeof vi.fn>).mockResolvedValue([{ avg_daily: 0 }]);

    const result = await checkCircuitBreaker();
    expect(result.tripped).toBe(false);
  });
});

describe('resetCircuitBreaker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls db.execute to reset pause flag', async () => {
    (db.execute as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await resetCircuitBreaker();

    expect(db.execute).toHaveBeenCalled();
  });
});
