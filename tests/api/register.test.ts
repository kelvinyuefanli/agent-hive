import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => {
  const insertReturning = vi.fn();
  const insertValues = vi.fn(() => ({ returning: insertReturning }));
  const insert = vi.fn(() => ({ values: insertValues }));
  return {
    db: { insert: insert },
    __insertMock: insert,
    __insertValuesMock: insertValues,
    __insertReturningMock: insertReturning,
  };
});

vi.mock("@/lib/safety/rate-limit", () => ({
  checkRateLimit: vi.fn(),
}));

import { POST } from "../../src/app/api/v1/register/route";
import { checkRateLimit } from "../../src/lib/safety/rate-limit";

// Pull out the mock internals for assertions
const dbModule = await import("@/lib/db");
const insertMock = (dbModule as Record<string, unknown>).__insertMock as ReturnType<typeof vi.fn>;
const insertReturningMock = (dbModule as Record<string, unknown>).__insertReturningMock as ReturnType<typeof vi.fn>;

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(body?: Record<string, unknown>, headers?: Record<string, string>): NextRequest {
  const init: RequestInit = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": "192.168.1.1",
      ...headers,
    },
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  return new NextRequest("http://localhost/api/v1/register", init);
}

const FAKE_ORG = {
  id: "org-uuid-1",
  name: "default-agent",
  apiKeyHash: "hashed",
  isFirstSearch: true,
  createdAt: new Date(),
};

const FAKE_AGENT = {
  id: "agent-uuid-1",
  orgId: "org-uuid-1",
  name: "default-agent",
  reputation: 0,
  domainExpertise: {},
  readCount: 0,
  createdAt: new Date(),
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/v1/register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // First call returns org, second returns agent
    let callCount = 0;
    insertReturningMock.mockImplementation(() => {
      callCount++;
      if (callCount % 2 === 1) return [FAKE_ORG];
      return [FAKE_AGENT];
    });
  });

  it("creates org + agent and returns 201 with API key", async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(201);

    const json = await res.json();
    expect(json.data).toHaveProperty("api_key");
    expect(json.data).toHaveProperty("org_id", FAKE_ORG.id);
    expect(json.data).toHaveProperty("agent_id", FAKE_AGENT.id);
    expect(json.data.message).toContain("Welcome");
  });

  it("returns an API key starting with 'ah_'", async () => {
    const res = await POST(makeRequest());
    const json = await res.json();
    expect(json.data.api_key).toMatch(/^ah_/);
  });

  it("stores a hashed key (not the raw key) in the org", async () => {
    const res = await POST(makeRequest());
    const json = await res.json();

    // The insert for the org is the first call
    const orgInsertValues = (insertMock.mock.results[0].value as { values: ReturnType<typeof vi.fn> }).values;
    const insertedValues = orgInsertValues.mock.calls[0][0] as Record<string, string>;

    // The stored hash should NOT equal the raw key
    expect(insertedValues.apiKeyHash).toBeDefined();
    expect(insertedValues.apiKeyHash).not.toBe(json.data.api_key);
    // Hash should be 64 hex chars (SHA-256)
    expect(insertedValues.apiKeyHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("calls checkRateLimit with IP-based key", async () => {
    await POST(makeRequest());
    expect(checkRateLimit).toHaveBeenCalledWith(
      "register:192.168.1.1",
      "/api/v1/register",
      expect.objectContaining({ maxRequests: 3 }),
    );
  });

  it("accepts an optional name in the body", async () => {
    const res = await POST(makeRequest({ name: "my-bot" }));
    expect(res.status).toBe(201);

    const orgInsertValues = (insertMock.mock.results[0].value as { values: ReturnType<typeof vi.fn> }).values;
    const insertedValues = orgInsertValues.mock.calls[0][0] as Record<string, string>;
    expect(insertedValues.name).toBe("my-bot");
  });

  it('uses "default-agent" when no body is provided', async () => {
    // Send request with no body at all
    const req = new NextRequest("http://localhost/api/v1/register", {
      method: "POST",
      headers: { "x-forwarded-for": "10.0.0.1" },
    });

    await POST(req);

    const orgInsertValues = (insertMock.mock.results[0].value as { values: ReturnType<typeof vi.fn> }).values;
    const insertedValues = orgInsertValues.mock.calls[0][0] as Record<string, string>;
    expect(insertedValues.name).toBe("default-agent");
  });
});
