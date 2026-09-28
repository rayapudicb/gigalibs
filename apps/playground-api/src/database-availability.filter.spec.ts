import { Prisma } from '@gigalibs/db';
import { describe, expect, it, vi } from 'vitest';
import {
  DatabaseAvailabilityFilter,
  isTransientDatabaseAvailabilityError,
} from './database-availability.filter.js';

describe('DatabaseAvailabilityFilter', () => {
  it('classifies reviewed connection failures as transient', () => {
    const unavailable = new Prisma.PrismaClientKnownRequestError('Database is unavailable', {
      code: 'P1001',
      clientVersion: 'test',
    });
    const conflict = new Prisma.PrismaClientKnownRequestError('Unique constraint', {
      code: 'P2002',
      clientVersion: 'test',
    });
    const sustainedOutage = new Prisma.PrismaClientKnownRequestError('Invalid database request', {
      code: 'ECONNREFUSED',
      clientVersion: 'test',
    });

    expect(isTransientDatabaseAvailabilityError(unavailable)).toBe(true);
    expect(isTransientDatabaseAvailabilityError(sustainedOutage)).toBe(true);
    expect(isTransientDatabaseAvailabilityError(conflict)).toBe(false);
  });

  it('returns a sanitized retryable 503 without exposing the database error', () => {
    const setHeader = vi.fn();
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const host = {
      switchToHttp: () => ({ getResponse: () => ({ setHeader, status }) }),
    };
    const exception = new Prisma.PrismaClientUnknownRequestError(
      'terminating connection due to administrator command: secret-host.internal',
      { clientVersion: 'test' },
    );

    new DatabaseAvailabilityFilter().catch(exception, host as never);

    expect(setHeader).toHaveBeenCalledWith('Retry-After', '1');
    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith({
      statusCode: 503,
      code: 'DATABASE_TEMPORARILY_UNAVAILABLE',
      message: 'The service is temporarily unavailable. Retry the request.',
    });
    expect(JSON.stringify(json.mock.calls)).not.toContain('secret-host.internal');
  });

  it('preserves status and body for duck-typed HttpExceptions', () => {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const host = {
      switchToHttp: () => ({ getResponse: () => ({ setHeader: vi.fn(), status }) }),
    };
    const validationError = {
      getStatus: () => 400,
      getResponse: () => ({
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed.',
        issues: [{ path: 'unknownField', message: 'Unrecognized key', code: 'unrecognized_keys' }],
      }),
    };

    new DatabaseAvailabilityFilter().catch(validationError, host as never);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed.',
      issues: [{ path: 'unknownField', message: 'Unrecognized key', code: 'unrecognized_keys' }],
    });
  });

  it('sanitizes unexpected application errors with status 500', () => {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const host = {
      switchToHttp: () => ({ getResponse: () => ({ setHeader: vi.fn(), status }) }),
    };
    const genericError = new Error('unexpected crash: /Users/rayapudi/secret');

    new DatabaseAvailabilityFilter().catch(genericError, host as never);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.',
    });
    expect(JSON.stringify(json.mock.calls)).not.toContain('/Users/rayapudi/secret');
  });
});
