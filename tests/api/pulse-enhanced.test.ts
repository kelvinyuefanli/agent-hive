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

import { GET } from "../../src/app/api/v1/pulse/route";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(): NextRequest {
  return new NextRequest("http://localhost/api/v1/pulse", {
    method: "GET",
  });
}

const FAKE_STATS = {
  total_nodes: 50,
  total_edges: 30,
  total_agents: 5,
  total_verified: 10,
  avg_freshness: 0.85,
};

const FAKE_DEMAND_STATS = {
  wanted_count: 5,
  filled_count: 45,
};

const FAKE_NODES_BY_TYPE = [
  { type: "answer", count: 20 },
  { type: "question", count: 15 },
  { type: "wanted", count: 5 },
  { type: "howto", count: 10 },
];

const FAKE_RECENT_ACTIVITY = [
  {
    id: "node-1",
    timestamp: "2025-06-01T12:00:00Z",
    agent: "bot-alpha",
    type: "answer",
    title: "How to use Redis caching",
  },
  {
    id: "node-2",
    timestamp: "2025-06-01T11:00:00Z",
    agent: "bot-beta",
    type: "question",
    title: "What is GraphQL?",
  },
];

function setupDefaultMocks() {
  mockExecute
    .mockResolvedValueOnce([FAKE_STATS])           // stats query
    .mockResolvedValueOnce([FAKE_DEMAND_STATS])     // demand stats query
    .mockResolvedValueOnce(FAKE_NODES_BY_TYPE)      // nodes_by_type query
    .mockResolvedValueOnce(FAKE_RECENT_ACTIVITY);   // recent_activity query
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("GET /api/v1/pulse (enhanced)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns nodes_by_type breakdown", async () => {
    setupDefaultMocks();

    const res = await GET(makeRequest(), {});
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.data.nodes_by_type).toBeDefined();
    expect(json.data.nodes_by_type.answer).toBe(20);
    expect(json.data.nodes_by_type.question).toBe(15);
    expect(json.data.nodes_by_type.wanted).toBe(5);
    expect(json.data.nodes_by_type.howto).toBe(10);
  });

  it("returns recent_activity array", async () => {
    setupDefaultMocks();

    const res = await GET(makeRequest(), {});
    const json = await res.json();

    expect(Array.isArray(json.data.recent_activity)).toBe(true);
    expect(json.data.recent_activity).toHaveLength(2);
    expect(json.data.recent_activity[0]).toHaveProperty("id");
    expect(json.data.recent_activity[0]).toHaveProperty("timestamp");
    expect(json.data.recent_activity[0]).toHaveProperty("type");
    expect(json.data.recent_activity[0]).toHaveProperty("title");
    expect(json.data.recent_activity[0]).toHaveProperty("action", "created");
  });

  it("recent_activity includes agent name", async () => {
    setupDefaultMocks();

    const res = await GET(makeRequest(), {});
    const json = await res.json();

    expect(json.data.recent_activity[0].agent).toBe("bot-alpha");
    expect(json.data.recent_activity[1].agent).toBe("bot-beta");
  });

  it("nodes_by_type sums to total_nodes", async () => {
    setupDefaultMocks();

    const res = await GET(makeRequest(), {});
    const json = await res.json();

    const typeSum = Object.values(json.data.nodes_by_type as Record<string, number>).reduce(
      (sum: number, count: number) => sum + count,
      0,
    );
    expect(typeSum).toBe(json.data.total_nodes);
  });
});
