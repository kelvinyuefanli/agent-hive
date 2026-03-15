import { describe, it, expect } from 'vitest';
import { normalizeQuery } from '../../src/lib/growth/query-normalizer';

describe('normalizeQuery', () => {
  it('normalizes "How to verify Stripe webhooks in Python"', () => {
    const result = normalizeQuery('How to verify Stripe webhooks in Python');
    expect(result).toBe('python stripe verify webhooks');
  });

  it('normalizes "stripe webhook verification python"', () => {
    const result = normalizeQuery('stripe webhook verification python');
    expect(result).toBe('python stripe verification webhook');
  });

  it('is case insensitive', () => {
    const upper = normalizeQuery('PYTHON STRIPE');
    const lower = normalizeQuery('python stripe');
    expect(upper).toBe(lower);
  });

  it('removes stop words', () => {
    const result = normalizeQuery('how to do the thing');
    expect(result).toBe('thing');
  });

  it('returns empty string for empty query', () => {
    expect(normalizeQuery('')).toBe('');
  });

  it('returns the word for single non-stop word', () => {
    expect(normalizeQuery('javascript')).toBe('javascript');
  });

  it('returns empty string when all words are stop words', () => {
    const result = normalizeQuery('the a an is are was were');
    expect(result).toBe('');
  });

  it('handles unicode characters', () => {
    // NFKC normalization should handle compatibility characters
    const result = normalizeQuery('caf\u00E9 javascript');
    expect(result).toContain('javascript');
    expect(result).toContain('caf\u00E9');
  });

  it('sorts tokens alphabetically', () => {
    const result = normalizeQuery('zebra apple banana');
    expect(result).toBe('apple banana zebra');
  });

  it('strips punctuation via split', () => {
    const result = normalizeQuery('hello, world! how? great.');
    // "how" is a stop word
    expect(result).toBe('great hello world');
  });

  it('handles multiple spaces and whitespace', () => {
    const result = normalizeQuery('  python   stripe  ');
    expect(result).toBe('python stripe');
  });
});
