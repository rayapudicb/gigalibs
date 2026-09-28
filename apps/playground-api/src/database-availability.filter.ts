import { Prisma } from '@gigalibs/db';
import { logger } from '@gigalibs/logger';
import { type ArgumentsHost, Catch, type ExceptionFilter } from '@nestjs/common';

const transientPrismaCodes = new Set([
  'P1001',
  'P1002',
  'P1008',
  'P1017',
  'P2024',
  'P2037',
  // Prisma 6 can surface the adapter's connection-refused code as a known request error after
  // the initial pool connection has been lost during a sustained PostgreSQL outage.
  'ECONNREFUSED',
]);
const transientDatabaseMessage =
  /can't reach database|connection (?:terminated|refused|reset|closed)|server (?:has )?closed|database system is (?:starting up|shutting down)|terminating connection|socket (?:closed|hang up)|ECONNREFUSED|57P0[123]/i;

type PrismaRequestFailure =
  | Prisma.PrismaClientKnownRequestError
  | Prisma.PrismaClientUnknownRequestError
  | Prisma.PrismaClientInitializationError;

export function isTransientDatabaseAvailabilityError(exception: PrismaRequestFailure): boolean {
  const code =
    exception instanceof Prisma.PrismaClientKnownRequestError
      ? exception.code
      : exception instanceof Prisma.PrismaClientInitializationError
        ? exception.errorCode
        : undefined;
  return Boolean(
    (code && transientPrismaCodes.has(code)) || transientDatabaseMessage.test(exception.message),
  );
}

function isPrismaFailure(err: unknown): err is PrismaRequestFailure {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError ||
    err instanceof Prisma.PrismaClientUnknownRequestError ||
    err instanceof Prisma.PrismaClientInitializationError
  );
}

@Catch()
export class DatabaseAvailabilityFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<{
      setHeader(name: string, value: string): void;
      status(code: number): { json(body: Record<string, unknown>): void };
    }>();

    if (
      exception &&
      typeof (exception as { getStatus?: unknown }).getStatus === 'function' &&
      typeof (exception as { getResponse?: unknown }).getResponse === 'function'
    ) {
      const httpException = exception as {
        getStatus(): number;
        getResponse(): string | Record<string, unknown>;
      };
      const status = httpException.getStatus();
      const res = httpException.getResponse();
      const body =
        typeof res === 'object' && res !== null
          ? (res as Record<string, unknown>)
          : { statusCode: status, message: String(res) };
      response.status(status).json(body);
      return;
    }

    if (isPrismaFailure(exception)) {
      const transient = isTransientDatabaseAvailabilityError(exception);
      const code =
        exception instanceof Prisma.PrismaClientKnownRequestError
          ? exception.code
          : exception instanceof Prisma.PrismaClientInitializationError
            ? exception.errorCode
            : undefined;
      logger.warn(
        { prismaError: exception.name, ...(code ? { prismaCode: code } : {}) },
        transient
          ? 'Database request failed because persistence is temporarily unavailable'
          : 'Database request failed with an unclassified Prisma error',
      );

      if (transient) {
        response.setHeader('Retry-After', '1');
        response.status(503).json({
          statusCode: 503,
          code: 'DATABASE_TEMPORARILY_UNAVAILABLE',
          message: 'The service is temporarily unavailable. Retry the request.',
        });
        return;
      }

      response.status(500).json({
        statusCode: 500,
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred.',
      });
      return;
    }

    logger.error({ err: exception }, 'Unhandled application exception');
    response.status(500).json({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.',
    });
  }
}
