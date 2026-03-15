import { describe, it, expect } from 'vitest';
import { scanForSecrets } from '../../src/lib/safety/secret-scanner';
import secretPatterns from '../fixtures/attacks/secret-patterns.json';

describe('scanForSecrets', () => {
  describe('fixture-driven tests against secret-patterns.json', () => {
    for (const entry of secretPatterns) {
      it(`${entry.should_detect ? 'detects' : 'ignores'}: ${entry.description}`, () => {
        const result = scanForSecrets(entry.payload);
        if (entry.should_detect) {
          expect(result.found).toBe(true);
          expect(result.patterns.length).toBeGreaterThan(0);
          expect(result.patterns).toContain(entry.pattern_name);
        } else {
          expect(result.found).toBe(false);
          expect(result.patterns).toEqual([]);
        }
      });
    }
  });

  // These patterns are constructed dynamically to avoid triggering
  // GitHub's push protection scanner on committed test fixtures.
  describe('dynamically constructed secret patterns', () => {
    it('detects Stripe live secret key', () => {
      const prefix = 'sk_' + 'live_';
      const payload = `stripe_key = ${prefix}51ABCDefGHIJKlmnopQRSTUVwx`;
      const result = scanForSecrets(payload);
      expect(result.found).toBe(true);
      expect(result.patterns).toContain('Stripe Secret Key');
    });

    it('detects Slack bot token', () => {
      const prefix = 'xox' + 'b-';
      const payload = `SLACK_BOT_TOKEN=${prefix}123456789012-abcdefghijkl`;
      const result = scanForSecrets(payload);
      expect(result.found).toBe(true);
      expect(result.patterns).toContain('Slack Token');
    });
  });

  describe('edge cases', () => {
    it('returns no matches for empty string', () => {
      const result = scanForSecrets('');
      expect(result.found).toBe(false);
      expect(result.patterns).toEqual([]);
    });

    it('handles very long string (100KB) without error', () => {
      const longText = 'a'.repeat(100 * 1024);
      const result = scanForSecrets(longText);
      expect(result.found).toBe(false);
      expect(result.patterns).toEqual([]);
    });

    it('detects multiple secret types in one string', () => {
      const text = [
        'AWS key: AKIAIOSFODNN7EXAMPLE',
        'GitHub: ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef1234',
        'JWT: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
      ].join('\n');

      const result = scanForSecrets(text);
      expect(result.found).toBe(true);
      expect(result.patterns).toContain('AWS Access Key');
      expect(result.patterns).toContain('GitHub Token');
      expect(result.patterns).toContain('JWT Token');
      expect(result.patterns.length).toBeGreaterThanOrEqual(3);
    });
  });
});
