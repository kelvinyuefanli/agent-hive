// ─── Typed error hierarchy ──────────────────────────────────────────────────
// Base class for all application errors, designed for safe JSON serialization.

export class AppError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.status = status;
    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }

  toJSON(): { error: { code: string; message: string; status: number } } {
    return {
      error: {
        code: this.code,
        message: this.message,
        status: this.status,
      },
    };
  }
}

export class AuthError extends AppError {
  constructor(message = "Authentication failed") {
    super(message, "AUTH_FAILED", 401);
  }
}

export class ValidationError extends AppError {
  readonly fields: Array<{ path: string; message: string }>;

  constructor(
    message = "Validation failed",
    fields: Array<{ path: string; message: string }> = [],
  ) {
    super(message, "VALIDATION_FAILED", 400);
    this.fields = fields;
  }

  override toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        status: this.status,
        fields: this.fields,
      },
    };
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(message, "NOT_FOUND", 404);
  }
}

export class RateLimitError extends AppError {
  readonly retryAfter: number;

  constructor(message = "Rate limit exceeded", retryAfter: number) {
    super(message, "RATE_LIMITED", 429);
    this.retryAfter = retryAfter;
  }

  override toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        status: this.status,
        retryAfter: this.retryAfter,
      },
    };
  }
}

export class ConflictError extends AppError {
  constructor(message = "Resource conflict") {
    super(message, "CONFLICT", 409);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super(message, "FORBIDDEN", 403);
  }
}

export class SecretDetectedError extends AppError {
  constructor(message = "Secret detected in content") {
    super(message, "SECRET_DETECTED", 422);
  }
}

export class PayloadTooLargeError extends AppError {
  constructor(message = "Payload too large") {
    super(message, "PAYLOAD_TOO_LARGE", 413);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = "Service unavailable") {
    super(message, "SERVICE_UNAVAILABLE", 503);
  }
}
