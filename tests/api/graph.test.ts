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

// The new query returns nodes and edges in a single UNION ALL result
function makeNodeRow(id: string, label: string, type: string, score: number, trust: string) {
  return { _kind: "node", id, label, type, score, trust, source: null, target: null, relation: null };
}

function makeEdgeRow(source: string, target: string, relation: string) {
  return { _kind: "edge", id: null, label: null, type: null, score: null, trust: null, source, target, relation };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("GET /api/v1/graph", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty nodes and edges arrays on empty DB", async () => {
    mockExecute.mockResolvedValueOnce([]);

    const res = await GET(makeRequest(), {});
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.data.nodes).toEqual([]);
    expect(json.data.edges).toEqual([]);
  });

  it("returns nodes with correct shape (id, label, type, score, trust)", async () => {
    mockExecute.mockResolvedValueOnce([
      makeNodeRow("node-1", "How to parse JSON?", "question", 42, "verified"),
    ]);

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
    mockExecute.mockResolvedValueOnce([
      makeNodeRow("node-1", "A", "answer", 10, "unverified"),
      makeNodeRow("node-2", "B", "question", 5, "unverified"),
      makeEdgeRow("node-1", "node-2", "answers"),
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

  it("returns 200 nodes from combined result", async () => {
    const rows = Array.from({ length: 200 }, (_, i) =>
      makeNodeRow(`node-${i}`, `Node ${i}`, "answer", 200 - i, "unverified"),
    );

    mockExecute.mockResolvedValueOnce(rows);

    const res = await GET(makeRequest(), {});
    const json = await res.json();

    expect(json.data.nodes).toHaveLength(200);
  });

  it("orders nodes by score DESC", async () => {
    mockExecute.mockResolvedValueOnce([
      makeNodeRow("node-high", "High", "answer", 99, "verified"),
      makeNodeRow("node-mid", "Mid", "answer", 50, "unverified"),
      makeNodeRow("node-low", "Low", "question", 1, "unverified"),
    ]);

    const res = await GET(makeRequest(), {});
    const json = await res.json();

    const scores = json.data.nodes.map((n: Record<string, unknown>) => n.score);
    expect(scores).toEqual([99, 50, 1]);
  });
});
