import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/lib/db/schema", () => ({
  knowledgeNodes: {
    id: "id",
    type: "type",
    title: "title",
    score: "score",
  },
  strategies: {
    id: "id",
    sourcePatternId: "source_pattern_id",
  },
}));

vi.mock("drizzle-orm", () => ({
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
    { raw: (s: string) => s },
  ),
}));

import { strategyGenesis } from "../../src/lib/growth/jobs/strategy-genesis";

function makeTx() {
  return {
    select: vi.fn(),
    insert: vi.fn(),
    execute: vi.fn().mockResolvedValue([]),
  };
}

describe("strategyGenesis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns {processed: 0, created: 0} when no qualifying patterns exist", async () => {
    const tx = makeTx();

    // First execute: query for pattern nodes returns empty
    tx.execute.mockResolvedValueOnce([]);

    const result = await strategyGenesis.process(tx);

    expect(result).toEqual({ processed: 0, created: 0 });
  });

  it("creates strategy from pattern with score >= 3", async () => {
    const tx = makeTx();

    // First execute: returns qualifying pattern
    tx.execute.mockResolvedValueOnce([
      {
        id: "pattern-uuid-1",
        title: "Detected: code_generation in typescript — 85% high success rate",
        body: "Auto-detected pattern from 20 outcome reports. Success rate: 85% (17/20 agents succeeded). Action type: code_generation, domain: typescript.",
        tags: ["typescript", "code_generation"],
      },
    ]);

    // Second execute: insert strategy succeeds
    tx.execute.mockResolvedValueOnce(undefined);

    const result = await strategyGenesis.process(tx);

    expect(result.processed).toBe(1);
    expect(result.created).toBe(1);
  });

  it("extractSteps handles null/undefined body gracefully", async () => {
    const tx = makeTx();

    // Pattern with null body
    tx.execute.mockResolvedValueOnce([
      {
        id: "pattern-uuid-2",
        title: "Some pattern",
        body: null,
        tags: ["typescript"],
      },
    ]);

    // Insert strategy succeeds
    tx.execute.mockResolvedValueOnce(undefined);

    const result = await strategyGenesis.process(tx);

    // Should not crash — extractSteps returns fallback
    expect(result.processed).toBe(1);
    expect(result.created).toBe(1);
  });

  it("skips patterns that already have linked strategies", async () => {
    const tx = makeTx();

    // The SQL query uses LEFT JOIN ... WHERE s.id IS NULL, so
    // patterns with linked strategies are excluded at the query level.
    // Return empty to simulate all patterns already having strategies.
    tx.execute.mockResolvedValueOnce([]);

    const result = await strategyGenesis.process(tx);

    expect(result).toEqual({ processed: 0, created: 0 });
  });
});
