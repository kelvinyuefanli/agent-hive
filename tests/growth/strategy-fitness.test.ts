import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("drizzle-orm", () => ({
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
    { raw: (s: string) => s },
  ),
}));

import { strategyFitness } from "../../src/lib/growth/jobs/strategy-fitness";

function makeTx() {
  return {
    select: vi.fn(),
    insert: vi.fn(),
    execute: vi.fn().mockResolvedValue([]),
  };
}

describe("strategyFitness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns {processed: 0, created: 0} when no strategies exist", async () => {
    const tx = makeTx();

    // First execute: query for strategies returns empty
    tx.execute.mockResolvedValueOnce([]);

    // Second execute: decay stale strategies
    tx.execute.mockResolvedValueOnce(undefined);

    // Third execute: promote canonical
    tx.execute.mockResolvedValueOnce(undefined);

    const result = await strategyFitness.process(tx);

    expect(result).toEqual({ processed: 0, created: 0 });
  });

  it("updates fitness score and lifecycle stage", async () => {
    const tx = makeTx();

    // First execute: returns a strategy with good metrics
    tx.execute.mockResolvedValueOnce([
      {
        id: "strategy-uuid-1",
        lifecycle_stage: "observed",
        adoption_count: 5,
        total_outcomes: 10,
        successful_outcomes: 8,
      },
    ]);

    // Second execute: update the strategy
    tx.execute.mockResolvedValueOnce(undefined);

    // Third execute: decay stale strategies
    tx.execute.mockResolvedValueOnce(undefined);

    // Fourth execute: promote canonical
    tx.execute.mockResolvedValueOnce(undefined);

    const result = await strategyFitness.process(tx);

    expect(result.processed).toBe(1);
    expect(result.created).toBe(0);
    // Verify the update was called (second execute call is the strategy update)
    expect(tx.execute).toHaveBeenCalledTimes(4);
  });

  it("handles gracefully when strategies table doesn't exist", async () => {
    const tx = makeTx();

    // First execute: throws error (table doesn't exist)
    tx.execute.mockRejectedValueOnce(new Error("relation \"strategies\" does not exist"));

    const result = await strategyFitness.process(tx);

    expect(result).toEqual({ processed: 0, created: 0 });
  });
});
