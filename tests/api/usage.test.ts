import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockInsertReturning = vi.fn();
const mockInsertValues = vi.fn(() => ({ returning: mockInsertReturning }));
const mockInsert = vi.fn(() => ({ values: mockInsertValues }));

const mockLimit = vi.fn();
const mockWhere = vi.fn(() => ({ limit: mockLimit }));
const mockFrom = vi.fn(() => ({ where: mockWhere }));
const mockSelect = vi.fn(() => ({ from: mockFrom }));

vi.mock("@/lib/db", () => ({
  db: {
    insert: (...args: unknown[]) => mockInsert(...args),
    select: (...args: unknown[]) => mockSelect(...args),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  knowledgeNodes: { id: "id" },
  usageReports: { _: "usageReports" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a, b) => ({ a, b })),
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

vi.mock("@/lib/safety/secret-scanner", () => ({
  scanForSecrets: vi.fn(() => ({ found: false, patterns: [] })),
}));

import { POST } from "../../src/app/api/v1/outcomes/usage/route";

// ── Helpers ──────────────────────────────────────────────────────────────────

const FAKE_USAGE = {
  id: "usage-uuid-1",
  nodeId: "node-uuid-1",
  agentId: "agent-uuid-1",
  helpful: true,
  createdAt: new Date(),
};

function makePostRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/v1/outcomes/usage", {
    method: "POST",
    headers: {
      "X-API-Key": "ah_test-key-123",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/v1/outcomes/usage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsertReturning.mockResolvedValue([FAKE_USAGE]);
  });

  it("creates usage report with valid body (returns 201)", async () => {
    mockLimit.mockResolvedValue([{ id: "node-uuid-1" }]);

    const res = await POST(
      makePostRequest({
        node_id: "a0a0a0a0-b1b1-4c2c-8d3d-e4e4e4e4e4e4",
        helpful: true,
      }),
      {},
    );

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.id).toBe(FAKE_USAGE.id);
    expect(json.data.helpful).toBe(true);
  });

  it("returns 404 when node doesn't exist", async () => {
    mockLimit.mockResolvedValue([]);

    const res = await POST(
      makePostRequest({
        node_id: "a0a0a0a0-b1b1-4c2c-8d3d-e4e4e4e4e4e4",
        helpful: true,
      }),
      {},
    );

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error.code).toBe("NOT_FOUND");
  });

  it("validates required fields (node_id, helpful)", async () => {
    const res = await POST(
      makePostRequest({
        helpful: true,
      }),
      {},
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_FAILED");
  });
});
