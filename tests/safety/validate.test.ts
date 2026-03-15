import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { validateBody } from '../../src/lib/safety/validate';
import { ValidationError } from '../../src/lib/utils/errors';

const testSchema = z.object({
  name: z.string().min(1),
  age: z.number().int().positive(),
  email: z.string().email().optional(),
});

describe('validateBody', () => {
  it('returns parsed data for valid input', () => {
    const input = { name: 'Alice', age: 30 };
    const result = validateBody(testSchema, input);
    expect(result).toEqual({ name: 'Alice', age: 30 });
  });

  it('strips extra fields not in schema', () => {
    const input = { name: 'Bob', age: 25, extraField: 'should be stripped' };
    const result = validateBody(testSchema, input);
    expect(result).toEqual({ name: 'Bob', age: 25 });
    expect((result as Record<string, unknown>).extraField).toBeUndefined();
  });

  it('throws ValidationError for missing required fields', () => {
    const input = { name: 'Charlie' }; // missing age
    expect(() => validateBody(testSchema, input)).toThrow(ValidationError);
  });

  it('throws ValidationError with field errors for invalid data', () => {
    const input = { name: '', age: -5 }; // empty name, negative age

    try {
      validateBody(testSchema, input);
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      const validationError = err as ValidationError;
      expect(validationError.fields.length).toBeGreaterThan(0);
      expect(validationError.status).toBe(400);
      expect(validationError.code).toBe('VALIDATION_FAILED');
    }
  });

  it('includes correct field paths in error', () => {
    const nestedSchema = z.object({
      user: z.object({
        name: z.string(),
        age: z.number(),
      }),
    });

    try {
      validateBody(nestedSchema, { user: { name: 123, age: 'not a number' } });
      expect.unreachable('Should have thrown');
    } catch (err) {
      const validationError = err as ValidationError;
      expect(validationError.fields.some(f => f.path.includes('user'))).toBe(true);
    }
  });

  it('throws ValidationError for completely wrong input type', () => {
    expect(() => validateBody(testSchema, 'not an object')).toThrow(ValidationError);
    expect(() => validateBody(testSchema, null)).toThrow(ValidationError);
    expect(() => validateBody(testSchema, undefined)).toThrow(ValidationError);
  });

  it('validates optional fields when provided', () => {
    const input = { name: 'Dave', age: 40, email: 'not-an-email' };
    expect(() => validateBody(testSchema, input)).toThrow(ValidationError);
  });

  it('accepts valid optional fields', () => {
    const input = { name: 'Eve', age: 28, email: 'eve@example.com' };
    const result = validateBody(testSchema, input);
    expect(result).toEqual({ name: 'Eve', age: 28, email: 'eve@example.com' });
  });
});
