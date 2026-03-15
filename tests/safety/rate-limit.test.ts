import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkRateLimit } from '../../src/lib/safety/rate-limit';
import { RateLimitError } from '../../src/lib/utils/errors';

describe('checkRateLimit', () => {
  beforeEach(() => {
    // Reset the internal windows map by advancing time to a new window
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows requests under the limit', () => {
    const config = { windowMs: 60_000, maxRequests: 5 };
    // Use unique keys per test to avoid cross-test contamination
    const orgId = `org-under-${Date.now()}`;
    expect(() => checkRateLimit(orgId, '/test', config)).not.toThrow();
    expect(() => checkRateLimit(orgId, '/test', config)).not.toThrow();
    expect(() => checkRateLimit(orgId, '/test', config)).not.toThrow();
  });

  it('throws RateLimitError when limit is exceeded', () => {
    const config = { windowMs: 60_000, maxRequests: 3 };
    const orgId = `org-exceed-${Date.now()}`;

    // 3 requests allowed (1st starts window, count goes to 1, 2, 3)
    checkRateLimit(orgId, '/test', config);
    checkRateLimit(orgId, '/test', config);
    checkRateLimit(orgId, '/test', config);

    // 4th should throw
    expect(() => checkRateLimit(orgId, '/test', config)).toThrow(RateLimitError);
  });

  it('includes retryAfter in the error', () => {
    const config = { windowMs: 60_000, maxRequests: 1 };
    const orgId = `org-retry-${Date.now()}`;

    checkRateLimit(orgId, '/test', config);

    try {
      checkRateLimit(orgId, '/test', config);
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(RateLimitError);
      expect((err as RateLimitError).retryAfter).toBeGreaterThan(0);
    }
  });

  it('resets after the window passes', () => {
    const config = { windowMs: 10_000, maxRequests: 1 };
    const orgId = `org-reset-${Date.now()}`;

    checkRateLimit(orgId, '/test', config);

    // Advance past the window
    vi.advanceTimersByTime(11_000);

    // Should not throw — new window
    expect(() => checkRateLimit(orgId, '/test', config)).not.toThrow();
  });

  it('isolates different keys', () => {
    const config = { windowMs: 60_000, maxRequests: 1 };
    const orgA = `org-a-${Date.now()}`;
    const orgB = `org-b-${Date.now()}`;

    checkRateLimit(orgA, '/test', config);

    // orgB should be independent
    expect(() => checkRateLimit(orgB, '/test', config)).not.toThrow();
  });

  it('isolates different endpoints for same org', () => {
    const config = { windowMs: 60_000, maxRequests: 1 };
    const orgId = `org-endpoints-${Date.now()}`;

    checkRateLimit(orgId, '/endpoint-a', config);

    // Different endpoint should be independent
    expect(() => checkRateLimit(orgId, '/endpoint-b', config)).not.toThrow();
  });
});
