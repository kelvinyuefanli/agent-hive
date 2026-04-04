import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  db: {},
}));

const mockVerifyApiKey = vi.fn();
vi.mock("@/lib/safety/auth", () => ({
  verifyApiKey: (...args: unknown[]) => mockVerifyApiKey(...args),
}));

const mockCheckRateLimit = vi.fn();
vi.mock("@/lib/safety/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
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

import { withSafety } from "../../src/lib/safety/middleware";
import { AuthError, SecretDetectedError } from "../../src/lib/utils/errors";

// ── Helpers ──────────────────────────────────────────────────────────────────

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

const testSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("withSafety() middleware pipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyApiKey.mockResolvedValue({ org: FAKE_ORG, agent: FAKE_AGENT });
    mockCheckRateLimit.mockReturnValue(undefined);
  });

  it("calls rate limit, auth, and validate in order, then invokes handler", async () => {
    const callOrder: string[] = [];

    mockVerifyApiKey.mockImplementation(async () => {
      callOrder.push("auth");
      return { org: FAKE_ORG, agent: FAKE_AGENT };
    });
    mockCheckRateLimit.mockImplementation(() => {
      callOrder.push("rateLimit");
    });

    const handler = withSafety({
      schema: testSchema,
      requireAuth: true,
    })(async ({ body }) => {
      callOrder.push("handler");
      return NextResponse.json({ data: body });
    });

    const req = new NextRequest("http://localhost/api/v1/test", {
      method: "POST",
      headers: {
        "X-API-Key": "ah_test-key",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title: "Test", body: "Hello world" }),
    });

    const res = await handler(req, {});
    expect(res.status).toBe(200);

    // Rate limit runs first (by IP), then auth
    expect(callOrder).toEqual(["rateLimit", "auth", "handler"]);
  });

  it("rejects missing API key with 401", async () => {
    mockVerifyApiKey.mockRejectedValue(new AuthError("Missing API key"));

    const handler = withSafety({ requireAuth: true })(async () => {
      return NextResponse.json({ data: "ok" });
    });

    const req = new NextRequest("http://localhost/api/v1/test", {
      method: "GET",
    });

    const res = await handler(req, {});
    expect(res.status).toBe(401);

    const json = await res.json();
    expect(json.error.code).toBe("AUTH_FAILED");
  });

  it("rejects invalid body with 400 and field errors", async () => {
    const handler = withSafety({
      schema: testSchema,
      requireAuth: true,
    })(async () => {
      return NextResponse.json({ data: "ok" });
    });

    const req = new NextRequest("http://localhost/api/v1/test", {
      method: "POST",
      headers: {
        "X-API-Key": "ah_test-key",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title: "" }), // title too short, body missing
    });

    const res = await handler(req, {});
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_FAILED");
    expect(json.error.fields).toBeDefined();
    expect(json.error.fields.length).toBeGreaterThan(0);
  });

  it("rejects request containing secrets with 422 (SecretDetectedError)", async () => {
    const handler = withSafety({
      schema: testSchema,
      requireAuth: true,
      scanSecrets: true,
    })(async () => {
      return NextResponse.json({ data: "ok" });
    });

    // Post a body that contains an AWS key
    const req = new NextRequest("http://localhost/api/v1/test", {
      method: "POST",
      headers: {
        "X-API-Key": "ah_test-key",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "My config",
        body: "Here is my key: AKIAIOSFODNN7EXAMPLE",
      }),
    });

    const res = await handler(req, {});
    expect(res.status).toBe(422);

    const json = await res.json();
    expect(json.error.code).toBe("SECRET_DETECTED");
  });

  it("returns 500 with INTERNAL_ERROR code for unexpected errors", async () => {
    mockVerifyApiKey.mockResolvedValue({ org: FAKE_ORG, agent: FAKE_AGENT });

    const handler = withSafety({ requireAuth: true })(async () => {
      throw new Error("Something exploded");
    });

    const req = new NextRequest("http://localhost/api/v1/test", {
      method: "GET",
      headers: { "X-API-Key": "ah_test-key" },
    });

    const res = await handler(req, {});
    expect(res.status).toBe(500);

    const json = await res.json();
    expect(json.error.code).toBe("INTERNAL_ERROR");
  });
});
