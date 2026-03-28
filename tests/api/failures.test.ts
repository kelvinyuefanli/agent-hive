import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockInsertReturning = vi.fn();
const mockInsertValues = vi.fn(() => ({ returning: mockInsertReturning }));
const mockInsert = vi.fn(() => ({ values: mockInsertValues }));

vi.mock("@/lib/db", () => ({
  db: {
    insert: (...args: unknown[]) => mockInsert(...args),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  failureReports: { _: "failureReports" },
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

import { POST } from "../../src/app/api/v1/failures/route";
import { scanForSecrets } from "@/lib/safety/secret-scanner";

// ── Helpers ──────────────────────────────────────────────────────────────────

const FAKE_FAILURE = {
  id: "failure-uuid-1",
  agentId: "agent-uuid-1",
  errorType: "api_error",
  service: "stripe",
  message: "Connection timeout after 30s",
  environment: null,
  createdAt: new Date(),
};

function makePostRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/v1/failures", {
    method: "POST",
    headers: {
      "X-API-Key": "ah_test-key-123",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/v1/failures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsertReturning.mockResolvedValue([FAKE_FAILURE]);
  });

  it("creates failure report with valid body (returns 201)", async () => {
    const res = await POST(
      makePostRequest({
        error_type: "api_error",
        service: "stripe",
        message: "Connection timeout after 30s",
      }),
      {},
    );

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.id).toBe(FAKE_FAILURE.id);
    expect(json.data.errorType).toBe("api_error");
  });

  it("validates required fields (error_type, service, message)", async () => {
    const res = await POST(
      makePostRequest({
        error_type: "api_error",
      }),
      {},
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_FAILED");
  });

  it("secret scans message field", async () => {
    vi.mocked(scanForSecrets).mockReturnValueOnce({ found: false, patterns: [] });
    // The middleware scans the whole body first, then the handler scans message specifically
    vi.mocked(scanForSecrets).mockReturnValueOnce({
      found: true,
      patterns: ["aws_key"],
    });

    const res = await POST(
      makePostRequest({
        error_type: "api_error",
        service: "stripe",
        message: "AKIAIOSFODNN7EXAMPLE",
      }),
      {},
    );

    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error.code).toBe("SECRET_DETECTED");
  });

  it("rejects invalid error_type enum value", async () => {
    const res = await POST(
      makePostRequest({
        error_type: "invalid_error_type",
        service: "stripe",
        message: "Some error",
      }),
      {},
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_FAILED");
  });
});
