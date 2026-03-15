import { describe, it, expect } from 'vitest';
import {
  AppError,
  AuthError,
  ValidationError,
  NotFoundError,
  RateLimitError,
  ConflictError,
  ForbiddenError,
  SecretDetectedError,
  PayloadTooLargeError,
  ServiceUnavailableError,
} from '../../src/lib/utils/errors';

describe('AppError', () => {
  it('has correct properties', () => {
    const err = new AppError('test message', 'TEST_CODE', 500);
    expect(err.message).toBe('test message');
    expect(err.code).toBe('TEST_CODE');
    expect(err.status).toBe(500);
    expect(err.name).toBe('AppError');
  });

  it('is an instance of Error', () => {
    const err = new AppError('test', 'TEST', 500);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
  });

  it('toJSON returns proper format', () => {
    const err = new AppError('test message', 'TEST_CODE', 500);
    expect(err.toJSON()).toEqual({
      error: {
        code: 'TEST_CODE',
        message: 'test message',
        status: 500,
      },
    });
  });
});

describe('AuthError', () => {
  it('has status 401 and code AUTH_FAILED', () => {
    const err = new AuthError();
    expect(err.status).toBe(401);
    expect(err.code).toBe('AUTH_FAILED');
    expect(err.message).toBe('Authentication failed');
    expect(err.name).toBe('AuthError');
  });

  it('accepts custom message', () => {
    const err = new AuthError('Invalid token');
    expect(err.message).toBe('Invalid token');
  });

  it('is instance of AppError', () => {
    const err = new AuthError();
    expect(err).toBeInstanceOf(AppError);
  });
});

describe('ValidationError', () => {
  it('has status 400 and code VALIDATION_FAILED', () => {
    const err = new ValidationError();
    expect(err.status).toBe(400);
    expect(err.code).toBe('VALIDATION_FAILED');
    expect(err.name).toBe('ValidationError');
  });

  it('includes fields in the error', () => {
    const fields = [
      { path: 'name', message: 'Required' },
      { path: 'email', message: 'Invalid email' },
    ];
    const err = new ValidationError('Validation failed', fields);
    expect(err.fields).toEqual(fields);
  });

  it('toJSON includes fields', () => {
    const fields = [{ path: 'age', message: 'Must be positive' }];
    const err = new ValidationError('Bad input', fields);
    const json = err.toJSON();
    expect(json.error.fields).toEqual(fields);
    expect(json.error.code).toBe('VALIDATION_FAILED');
    expect(json.error.status).toBe(400);
  });

  it('defaults to empty fields array', () => {
    const err = new ValidationError();
    expect(err.fields).toEqual([]);
  });
});

describe('NotFoundError', () => {
  it('has status 404 and code NOT_FOUND', () => {
    const err = new NotFoundError();
    expect(err.status).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toBe('Resource not found');
  });

  it('accepts custom message', () => {
    const err = new NotFoundError('Node not found');
    expect(err.message).toBe('Node not found');
  });
});

describe('RateLimitError', () => {
  it('has status 429 and code RATE_LIMITED', () => {
    const err = new RateLimitError('Too many', 30);
    expect(err.status).toBe(429);
    expect(err.code).toBe('RATE_LIMITED');
  });

  it('includes retryAfter', () => {
    const err = new RateLimitError('Too many requests', 60);
    expect(err.retryAfter).toBe(60);
  });

  it('toJSON includes retryAfter', () => {
    const err = new RateLimitError('Slow down', 45);
    const json = err.toJSON();
    expect(json.error.retryAfter).toBe(45);
    expect(json.error.code).toBe('RATE_LIMITED');
    expect(json.error.status).toBe(429);
  });
});

describe('ConflictError', () => {
  it('has status 409 and code CONFLICT', () => {
    const err = new ConflictError();
    expect(err.status).toBe(409);
    expect(err.code).toBe('CONFLICT');
    expect(err.message).toBe('Resource conflict');
  });
});

describe('ForbiddenError', () => {
  it('has status 403 and code FORBIDDEN', () => {
    const err = new ForbiddenError();
    expect(err.status).toBe(403);
    expect(err.code).toBe('FORBIDDEN');
    expect(err.message).toBe('Forbidden');
  });
});

describe('SecretDetectedError', () => {
  it('has status 422 and code SECRET_DETECTED', () => {
    const err = new SecretDetectedError();
    expect(err.status).toBe(422);
    expect(err.code).toBe('SECRET_DETECTED');
    expect(err.message).toBe('Secret detected in content');
  });
});

describe('PayloadTooLargeError', () => {
  it('has status 413 and code PAYLOAD_TOO_LARGE', () => {
    const err = new PayloadTooLargeError();
    expect(err.status).toBe(413);
    expect(err.code).toBe('PAYLOAD_TOO_LARGE');
    expect(err.message).toBe('Payload too large');
  });
});

describe('ServiceUnavailableError', () => {
  it('has status 503 and code SERVICE_UNAVAILABLE', () => {
    const err = new ServiceUnavailableError();
    expect(err.status).toBe(503);
    expect(err.code).toBe('SERVICE_UNAVAILABLE');
    expect(err.message).toBe('Service unavailable');
  });
});
