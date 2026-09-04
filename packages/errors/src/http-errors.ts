import { AppError } from './app-error.js';
import type { ErrorCode } from '@gigalibs/contracts';

type Details = Record<string, unknown>;

// ─── 400 ──────────────────────────────────────────────────────────────────────
export class ValidationError extends AppError {
  constructor(message: string, details?: Details) {
    super({ code: 'VALIDATION_ERROR', message, statusCode: 400, ...(details ? { details } : {}) });
  }
}

export class BadRequestError extends AppError {
  constructor(message: string, code: ErrorCode | string = 'BAD_REQUEST', details?: Details) {
    super({ code, message, statusCode: 400, ...(details ? { details } : {}) });
  }
}

// ─── 401 ──────────────────────────────────────────────────────────────────────
export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized', code: ErrorCode | string = 'AUTH_TOKEN_INVALID') {
    super({ code, message, statusCode: 401 });
  }
}

// ─── 403 ──────────────────────────────────────────────────────────────────────
export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', code: ErrorCode | string = 'RBAC_PERMISSION_DENIED', details?: Details) {
    super({ code, message, statusCode: 403, ...(details ? { details } : {}) });
  }
}

// ─── 404 ──────────────────────────────────────────────────────────────────────
export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super({
      code: 'NOT_FOUND',
      message: id ? `${resource} with id '${id}' not found` : `${resource} not found`,
      statusCode: 404,
    });
  }
}

// ─── 409 ──────────────────────────────────────────────────────────────────────
export class ConflictError extends AppError {
  constructor(message: string, code: ErrorCode | string = 'CONFLICT', details?: Details) {
    super({ code, message, statusCode: 409, ...(details ? { details } : {}) });
  }
}

// ─── 429 ──────────────────────────────────────────────────────────────────────
export class RateLimitError extends AppError {
  constructor(message = 'Too many requests. Please try again later.') {
    super({ code: 'RATE_LIMITED', message, statusCode: 429 });
  }
}

// ─── 422 ──────────────────────────────────────────────────────────────────────
export class UnprocessableError extends AppError {
  constructor(message: string, details?: Details) {
    super({ code: 'VALIDATION_ERROR', message, statusCode: 422, ...(details ? { details } : {}) });
  }
}

// ─── 500 ──────────────────────────────────────────────────────────────────────
export class InternalError extends AppError {
  constructor(message = 'An unexpected error occurred', cause?: Error) {
    super({ code: 'INTERNAL_ERROR', message, statusCode: 500, ...(cause ? { cause } : {}) });
  }
}
