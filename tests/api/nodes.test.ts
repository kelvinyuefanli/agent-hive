import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockInsertReturning = vi.fn();
const mockInsertValues = vi.fn(() => ({ returning: mockInsertReturning }));
const mockInsert = vi.fn(() => ({ values: mockInsertValues }));

const mockLimit = vi.fn();
const mockOrderBy = vi.fn(() => ({ limit: mockLimit }));
const mockWhere = vi.fn(() => ({ orderBy: mockOrderBy }));
const mockFrom = vi.fn(() => ({ where: mockWhere }));
const mockSelect = vi.fn(() => ({ from: mockFrom }));

vi.mock("@/lib/db", () => ({
  db: {
    insert: (...args: unknown[]) => mockInsert(...args),
    select: (...args: unknown[]) => mockSelect(...args),
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

import { POST, GET } from "../../src/app/api/v1/nodes/route";

// ── Helpers ──────────────────────────────────────────────────────────────────

const FAKE_NODE = {
  id: "node-uuid-1",
  type: "question",
  title: "How to parse JSON?",
  body: "What is the best way to parse JSON in TypeScript?",
  tags: ["typescript", "json"],
  envContext: null,
  agentId: "agent-uuid-1",
  score: 0,
  verifiedCount: 0,
  demandScore: 0,
  freshness: 1.0,
  trustLevel: "unverified",
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makePostRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/v1/nodes", {
    method: "POST",
    headers: {
      "X-API-Key": "ah_test-key-123",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function makeGetRequest(params: Record<string, string> = {}): NextRequest {
  const url = new URL("http://localhost/api/v1/nodes");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url.toString(), {
    method: "GET",
    headers: { "X-API-Key": "ah_test-key-123" },
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/v1/nodes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsertReturning.mockResolvedValue([FAKE_NODE]);
  });

  it("creates a node and returns 201", async () => {
    const res = await POST(
      makePostRequest({
        type: "question",
        title: "How to parse JSON?",
        body: "What is the best way to parse JSON in TypeScript?",
        tags: ["typescript", "json"],
      }),
      {},
    );

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.id).toBe(FAKE_NODE.id);
    expect(json.data.title).toBe(FAKE_NODE.title);
  });

  it("creates derived_from edges when influenced_by is provided", async () => {
    const targetId = "a0a0a0a0-b1b1-4c2c-8d3d-e4e4e4e4e4e4";
    mockInsertReturning.mockResolvedValue([FAKE_NODE]);

    const res = await POST(
      makePostRequest({
        type: "answer",
        title: "JSON parse method",
        body: "Use JSON.parse() to parse JSON strings in JavaScript.",
        influenced_by: [targetId],
      }),
      {},
    );

    expect(res.status).toBe(201);
    // insert should be called twice: once for node, once for edges
    expect(mockInsert).toHaveBeenCalledTimes(2);
  });

  it("rejects request when required title is missing (Zod validation)", async () => {
    const res = await POST(
      makePostRequest({
        type: "question",
        body: "Body without title",
      }),
      {},
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_FAILED");
  });
});

describe("GET /api/v1/nodes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns paginated nodes", async () => {
    mockLimit.mockResolvedValue([FAKE_NODE]);

    const res = await GET(makeGetRequest(), {});
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.data.nodes).toHaveLength(1);
    expect(json.data.has_more).toBe(false);
  });

  it("supports cursor-based pagination", async () => {
    // Return limit+1 nodes to trigger has_more
    const nodes = Array.from({ length: 3 }, (_, i) => ({
      ...FAKE_NODE,
      id: `node-uuid-${i}`,
    }));
    mockLimit.mockResolvedValue(nodes);

    const res = await GET(makeGetRequest({ limit: "2", cursor: "node-uuid-0" }), {});
    const json = await res.json();

    expect(json.data.has_more).toBe(true);
    expect(json.data.next_cursor).toBeDefined();
    expect(json.data.nodes).toHaveLength(2);
  });

  it("filters by type query parameter", async () => {
    mockLimit.mockResolvedValue([]);

    await GET(makeGetRequest({ type: "question" }), {});

    // where() should have been called (the conditions include type filter)
    expect(mockWhere).toHaveBeenCalled();
  });
});
