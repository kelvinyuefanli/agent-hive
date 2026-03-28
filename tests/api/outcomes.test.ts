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
  outcomeReports: { _: "outcomeReports" },
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

import { POST } from "../../src/app/api/v1/outcomes/route";
import { scanForSecrets } from "@/lib/safety/secret-scanner";

// ── Helpers ──────────────────────────────────────────────────────────────────

const FAKE_OUTCOME = {
  id: "outcome-uuid-1",
  agentId: "agent-uuid-1",
  actionType: "code_generation",
  domainTags: ["typescript"],
  success: true,
  durationMs: null,
  errorSummary: null,
  environment: null,
  nodeId: null,
  strategyId: null,
  createdAt: new Date(),
};

function makePostRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/v1/outcomes", {
    method: "POST",
    headers: {
      "X-API-Key": "ah_test-key-123",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/v1/outcomes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsertReturning.mockResolvedValue([FAKE_OUTCOME]);
  });

  it("creates outcome report with valid body (returns 201)", async () => {
    const res = await POST(
      makePostRequest({
        action_type: "code_generation",
        success: true,
        domain_tags: ["typescript"],
      }),
      {},
    );

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.id).toBe(FAKE_OUTCOME.id);
    expect(json.data.actionType).toBe("code_generation");
  });

  it("validates required fields (action_type, success)", async () => {
    const res = await POST(
      makePostRequest({
        domain_tags: ["typescript"],
      }),
      {},
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_FAILED");
  });

  it("rejects invalid action_type enum value", async () => {
    const res = await POST(
      makePostRequest({
        action_type: "invalid_type",
        success: true,
      }),
      {},
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_FAILED");
  });

  it("secret scans error_summary field", async () => {
    vi.mocked(scanForSecrets).mockReturnValueOnce({ found: false, patterns: [] });
    // The middleware scans the whole body first, then the handler scans error_summary specifically
    vi.mocked(scanForSecrets).mockReturnValueOnce({
      found: true,
      patterns: ["aws_key"],
    });

    const res = await POST(
      makePostRequest({
        action_type: "code_generation",
        success: false,
        error_summary: "AKIAIOSFODNN7EXAMPLE",
      }),
      {},
    );

    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error.code).toBe("SECRET_DETECTED");
  });

  it("verifies node exists when node_id is provided", async () => {
    const nodeId = "a0a0a0a0-b1b1-4c2c-8d3d-e4e4e4e4e4e4";
    mockLimit.mockResolvedValue([{ id: nodeId }]);
    mockInsertReturning.mockResolvedValue([{ ...FAKE_OUTCOME, nodeId }]);

    const res = await POST(
      makePostRequest({
        action_type: "code_generation",
        success: true,
        node_id: nodeId,
      }),
      {},
    );

    expect(res.status).toBe(201);
    expect(mockSelect).toHaveBeenCalled();
  });

  it("returns 404 when node_id references non-existent node", async () => {
    mockLimit.mockResolvedValue([]);

    const res = await POST(
      makePostRequest({
        action_type: "code_generation",
        success: true,
        node_id: "a0a0a0a0-b1b1-4c2c-8d3d-e4e4e4e4e4e4",
      }),
      {},
    );

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error.code).toBe("NOT_FOUND");
  });
});
