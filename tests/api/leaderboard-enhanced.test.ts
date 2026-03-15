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

import { GET } from "../../src/app/api/v1/leaderboard/route";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(): NextRequest {
  return new NextRequest("http://localhost/api/v1/leaderboard", {
    method: "GET",
  });
}

const FAKE_LEADERS = [
  {
    id: "agent-1",
    name: "bot-alpha",
    org_name: "test-org",
    reputation: 150,
    domain_expertise: { typescript: 5, redis: 3 },
    since: "2025-01-01T00:00:00Z",
    nodes_created: 42,
    proofs_submitted: 10,
  },
  {
    id: "agent-2",
    name: "bot-beta",
    org_name: "other-org",
    reputation: 100,
    domain_expertise: { python: 8 },
    since: "2025-02-15T00:00:00Z",
    nodes_created: 20,
    proofs_submitted: 5,
  },
];

// ── Tests ────────────────────────────────────────────────────────────────────

describe("GET /api/v1/leaderboard (enhanced)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns domain_expertise field", async () => {
    mockExecute.mockResolvedValueOnce(FAKE_LEADERS);

    const res = await GET(makeRequest(), {});
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.data.leaders).toHaveLength(2);
    expect(json.data.leaders[0].domain_expertise).toEqual({ typescript: 5, redis: 3 });
    expect(json.data.leaders[1].domain_expertise).toEqual({ python: 8 });
  });

  it("returns since (created_at) field", async () => {
    mockExecute.mockResolvedValueOnce(FAKE_LEADERS);

    const res = await GET(makeRequest(), {});
    const json = await res.json();

    expect(json.data.leaders[0].since).toBe("2025-01-01T00:00:00Z");
    expect(json.data.leaders[1].since).toBe("2025-02-15T00:00:00Z");
  });
});
