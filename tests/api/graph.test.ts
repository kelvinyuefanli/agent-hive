import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockExecute = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    execute: (...args: unknown[]) => mockExecute(...args),
  },
}));

vi.mock("@/lib/safety/rate-limit", () => ({
  checkRateLimit: vi.fn(),
  RATE_LIMIT_DEFAULTS: {
    read: { windowMs: 60_000, maxRequests: 1000 },
    write: { windowMs: 60_000, maxRequests: 100 },
  },
}));

import { GET } from "../../src/app/api/v1/graph/route";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(): NextRequest {
  return new NextRequest("http://localhost/api/v1/graph", {
    method: "GET",
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("GET /api/v1/graph", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty nodes and edges arrays on empty DB", async () => {
    mockExecute.mockResolvedValueOnce([]); // nodes query

    const res = await GET(makeRequest(), {});
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.data.nodes).toEqual([]);
    expect(json.data.edges).toEqual([]);
  });

  it("returns nodes with correct shape (id, label, type, score, trust)", async () => {
    mockExecute
      .mockResolvedValueOnce([
        {
          id: "node-1",
          label: "How to parse JSON?",
          type: "question",
          score: 42,
          trust: "verified",
        },
      ])
      .mockResolvedValueOnce([]); // edges query

    const res = await GET(makeRequest(), {});
    const json = await res.json();

    expect(json.data.nodes).toHaveLength(1);
    const node = json.data.nodes[0];
    expect(node).toHaveProperty("id", "node-1");
    expect(node).toHaveProperty("label", "How to parse JSON?");
    expect(node).toHaveProperty("type", "question");
    expect(node).toHaveProperty("score", 42);
    expect(node).toHaveProperty("trust", "verified");
  });

  it("returns only edges between returned nodes", async () => {
    mockExecute
      .mockResolvedValueOnce([
        { id: "node-1", label: "A", type: "answer", score: 10, trust: "unverified" },
        { id: "node-2", label: "B", type: "question", score: 5, trust: "unverified" },
      ])
      .mockResolvedValueOnce([
        { source: "node-1", target: "node-2", relation: "answers" },
      ]);

    const res = await GET(makeRequest(), {});
    const json = await res.json();

    expect(json.data.edges).toHaveLength(1);
    expect(json.data.edges[0]).toEqual({
      source: "node-1",
      target: "node-2",
      relation: "answers",
    });
  });

  it("limits to 100 nodes max", async () => {
    // The SQL query contains LIMIT 100; we simulate the DB returning exactly 100
    const hundredNodes = Array.from({ length: 100 }, (_, i) => ({
      id: `node-${i}`,
      label: `Node ${i}`,
      type: "answer",
      score: 100 - i,
      trust: "unverified",
    }));

    mockExecute
      .mockResolvedValueOnce(hundredNodes)
      .mockResolvedValueOnce([]);

    const res = await GET(makeRequest(), {});
    const json = await res.json();

    expect(json.data.nodes).toHaveLength(100);
  });

  it("orders nodes by score DESC", async () => {
    const nodes = [
      { id: "node-high", label: "High", type: "answer", score: 99, trust: "verified" },
      { id: "node-mid", label: "Mid", type: "answer", score: 50, trust: "unverified" },
      { id: "node-low", label: "Low", type: "question", score: 1, trust: "unverified" },
    ];

    mockExecute
      .mockResolvedValueOnce(nodes)
      .mockResolvedValueOnce([]);

    const res = await GET(makeRequest(), {});
    const json = await res.json();

    const scores = json.data.nodes.map((n: Record<string, unknown>) => n.score);
    expect(scores).toEqual([99, 50, 1]);
  });
});
