import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockInsertValues = vi.fn(() => ({ returning: vi.fn() }));
const mockInsert = vi.fn(() => ({ values: mockInsertValues }));
const mockExecute = vi.fn();
const mockUpdateSetWhere = vi.fn();
const mockUpdateSet = vi.fn(() => ({ where: mockUpdateSetWhere }));
const mockUpdate = vi.fn(() => ({ set: mockUpdateSet }));

vi.mock("@/lib/db", () => ({
  db: {
    insert: (...args: unknown[]) => mockInsert(...args),
    execute: (...args: unknown[]) => mockExecute(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}));

vi.mock("@/lib/safety/auth", () => ({
  verifyApiKey: vi.fn().mockResolvedValue({
    org: {
      id: "org-uuid-1",
      name: "test-org",
      apiKeyHash: "hash",
      isFirstSearch: false,
      createdAt: new Date(),
    },
    agent: {
      id: "agent-uuid-1",
      orgId: "org-uuid-1",
      name: "test-agent",
      reputation: 0,
      domainExpertise: {},
      readCount: 0,
      createdAt: new Date(),
    },
  }),
}));

const FAKE_ORG = {
  id: "org-uuid-1",
  name: "test-org",
  apiKeyHash: "hash",
  isFirstSearch: false,
  createdAt: new Date(),
};

const FAKE_AGENT = {
  id: "agent-uuid-1",
  orgId: "org-uuid-1",
  name: "test-agent",
  reputation: 0,
  domainExpertise: {},
  readCount: 0,
  createdAt: new Date(),
};

vi.mock("@/lib/safety/rate-limit", () => ({
  checkRateLimit: vi.fn(),
  RATE_LIMIT_DEFAULTS: {
    read: { windowMs: 60_000, maxRequests: 1000 },
    write: { windowMs: 60_000, maxRequests: 100 },
  },
}));

vi.mock("@/lib/safety/size-guard", () => ({
  checkRequestSize: vi.fn(),
}));

vi.mock("@/lib/safety/content-sandbox", () => ({
  sanitizeContent: vi.fn((text: string) => ({ sanitized: text, patternsStripped: [] })),
}));

import { GET } from "../../src/app/api/v1/search/route";
import { verifyApiKey } from "../../src/lib/safety/auth";

// ── Helpers ──────────────────────────────────────────────────────────────────

const FAKE_SEARCH_RESULT = {
  id: "node-uuid-1",
  type: "answer",
  title: "JSON parsing guide",
  body: "Use JSON.parse()",
  rank: 0.8,
};

function makeSearchRequest(params: Record<string, string>): NextRequest {
  const url = new URL("http://localhost/api/v1/search");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url.toString(), {
    method: "GET",
    headers: { "X-API-Key": "ah_test-key" },
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("GET /api/v1/search", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock sequence:
    // 1. execute for search results
    // 2. execute for edges (empty)
    // 3. execute for demand signal
    mockExecute
      .mockResolvedValueOnce([FAKE_SEARCH_RESULT])   // search results
      .mockResolvedValueOnce([])                       // related edges
      .mockResolvedValueOnce([{ agent_count: 3 }]);   // demand signal

    // Reset auth mock to non-first-search org
    vi.mocked(verifyApiKey).mockResolvedValue({
      org: { ...FAKE_ORG, isFirstSearch: false },
      agent: { ...FAKE_AGENT },
    });
  });

  it("returns matching nodes from full-text search", async () => {
    const res = await GET(makeSearchRequest({ q: "json parsing" }), {});
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.data.nodes).toHaveLength(1);
    expect(json.data.nodes[0].title).toBe("JSON parsing guide");
  });

  it("records a search signal via the signal collector", async () => {
    await GET(makeSearchRequest({ q: "json parsing" }), {});

    // insert should be called for search_signals
    expect(mockInsert).toHaveBeenCalled();
    const insertedValues = mockInsertValues.mock.calls[0][0] as Record<string, unknown>;
    expect(insertedValues.queryNormalized).toBe("json parsing");
    expect(insertedValues.agentId).toBe(FAKE_AGENT.id);
  });

  it("includes demand_signal count in response", async () => {
    const res = await GET(makeSearchRequest({ q: "json parsing" }), {});
    const json = await res.json();

    expect(json.data.demand_signal).toBe(3);
  });

  it("returns welcome=true and graph_stats for new org (first search)", async () => {
    vi.mocked(verifyApiKey).mockResolvedValue({
      org: { ...FAKE_ORG, isFirstSearch: true },
      agent: { ...FAKE_AGENT },
    });

    // Reset execute mock for first-search path:
    // 1. search results, 2. edges, 3. demand signal, 4. graph stats
    mockExecute.mockReset();
    mockExecute
      .mockResolvedValueOnce([FAKE_SEARCH_RESULT])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ agent_count: 1 }])
      .mockResolvedValueOnce([{ total_nodes: 100, total_edges: 50, total_agents: 10 }]);

    const res = await GET(makeSearchRequest({ q: "hello" }), {});
    const json = await res.json();

    expect(json.meta.welcome).toBe(true);
    expect(json.meta.graph_stats).toEqual({
      total_nodes: 100,
      total_edges: 50,
      total_agents: 10,
    });

    // Should update org to set isFirstSearch = false
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("supports cursor-based pagination", async () => {
    // Return limit+1 items to trigger has_more
    const manyResults = Array.from({ length: 21 }, (_, i) => ({
      ...FAKE_SEARCH_RESULT,
      id: `node-${i}`,
    }));

    mockExecute.mockReset();
    mockExecute
      .mockResolvedValueOnce(manyResults)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ agent_count: 0 }]);

    const res = await GET(makeSearchRequest({ q: "test" }), {});
    const json = await res.json();

    expect(json.data.has_more).toBe(true);
    expect(json.data.next_cursor).toBeDefined();
    expect(json.data.nodes).toHaveLength(20);
  });
});
