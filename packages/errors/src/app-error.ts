import type { ErrorCode } from '@gigalibs/contracts';

/**
 * Base application error. All GigaLibs errors extend this.
 * Carries a machine-readable code, HTTP status, and optional metadata.
 */
export class AppError extends Error {
  readonly code: ErrorCode | string;
  readonly statusCode: number;
  readonly details?: Record<string, unknown>;
  readonly isOperational: boolean;

  constructor(options: {
    code: ErrorCode | string;
    message: string;
    statusCode?: number;
    details?: Record<string, unknown>;
    cause?: Error;
  }) {
    super(options.message, { cause: options.cause });
    this.name = this.constructor.name;
    this.code = options.code;
    this.statusCode = options.statusCode ?? 500;
    if (options.details !== undefined) this.details = options.details;
    this.isOperational = true;

    // Maintains proper stack trace in V8
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      ...(this.details !== undefined ? { details: this.details } : {}),
    };
  }
}
