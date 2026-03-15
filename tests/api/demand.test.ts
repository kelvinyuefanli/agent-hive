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

import { GET } from "../../src/app/api/v1/demand/route";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(): NextRequest {
  return new NextRequest("http://localhost/api/v1/demand", {
    method: "GET",
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("GET /api/v1/demand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty signals array when no wanted nodes exist", async () => {
    mockExecute.mockResolvedValueOnce([]);

    const res = await GET(makeRequest(), {});
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.data.signals).toEqual([]);
  });

  it("returns wanted nodes with search_count and unique_agents", async () => {
    mockExecute.mockResolvedValueOnce([
      {
        id: "node-1",
        query: "How to use Redis?",
        tags: ["redis"],
        created: "2025-01-01T00:00:00Z",
        search_count: 5,
        unique_agents: 3,
        status: "open",
      },
    ]);

    const res = await GET(makeRequest(), {});
    const json = await res.json();

    expect(json.data.signals).toHaveLength(1);
    expect(json.data.signals[0].search_count).toBe(5);
    expect(json.data.signals[0].unique_agents).toBe(3);
  });

  it('marks status as "filled" when matching non-wanted nodes exist by tags', async () => {
    mockExecute.mockResolvedValueOnce([
      {
        id: "node-1",
        query: "Redis caching patterns",
        tags: ["redis", "caching"],
        created: "2025-01-01T00:00:00Z",
        search_count: 2,
        unique_agents: 1,
        status: "filled",
      },
    ]);

    const res = await GET(makeRequest(), {});
    const json = await res.json();

    expect(json.data.signals[0].status).toBe("filled");
  });

  it('marks status as "open" when no matching nodes exist', async () => {
    mockExecute.mockResolvedValueOnce([
      {
        id: "node-2",
        query: "Quantum computing basics",
        tags: ["quantum"],
        created: "2025-01-01T00:00:00Z",
        search_count: 0,
        unique_agents: 0,
        status: "open",
      },
    ]);

    const res = await GET(makeRequest(), {});
    const json = await res.json();

    expect(json.data.signals[0].status).toBe("open");
  });

  it("returns correct tags from wanted nodes", async () => {
    mockExecute.mockResolvedValueOnce([
      {
        id: "node-3",
        query: "GraphQL vs REST",
        tags: ["graphql", "rest", "api-design"],
        created: "2025-01-01T00:00:00Z",
        search_count: 1,
        unique_agents: 1,
        status: "open",
      },
    ]);

    const res = await GET(makeRequest(), {});
    const json = await res.json();

    expect(json.data.signals[0].tags).toEqual(["graphql", "rest", "api-design"]);
  });
});
