import { ArDomainError } from '@gigalibs/ar-domain';
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ZodError } from 'zod';

interface ProblemResponse {
  status(code: number): ProblemResponse;
  type(contentType: string): ProblemResponse;
  send(body: object): void;
}

interface ProblemRequest {
  correlationId?: string;
}

export class ArConflictError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ArConflictError';
  }
}

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(error: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<ProblemResponse>();
    const request = host.switchToHttp().getRequest<ProblemRequest>();
    const correlationId = request.correlationId ?? 'unavailable';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let type = 'https://problems.gigalibs.io/ar/internal-error';
    let title = 'The request could not be completed';
    let detail: string | undefined;
    let errors: Array<{ field: string; code: string }> | undefined;

    if (error instanceof ZodError) {
      status = HttpStatus.BAD_REQUEST;
      type = 'https://problems.gigalibs.io/ar/validation-error';
      title = 'Request validation failed';
      errors = error.issues.map((issue) => ({
        field: issue.path.join('.') || 'body',
        code: issue.code,
      }));
    } else if (error instanceof ArDomainError) {
      status = HttpStatus.BAD_REQUEST;
      type = `https://problems.gigalibs.io/ar/${error.code.toLowerCase().replaceAll('_', '-')}`;
      title = 'Request validation failed';
      detail = error.message;
    } else if (error instanceof ArConflictError) {
      status = HttpStatus.CONFLICT;
      type = `https://problems.gigalibs.io/ar/${error.code.toLowerCase().replaceAll('_', '-')}`;
      title = 'The request conflicts with current state';
      detail = error.message;
    } else if (error instanceof HttpException) {
      status = error.getStatus();
      const body = error.getResponse();
      title = typeof body === 'string' ? body : error.message;
      type = `https://problems.gigalibs.io/ar/http-${status}`;
    } else {
      this.logger.error(`Unhandled AR API failure; correlationId=${correlationId}`, stackOf(error));
    }

    response
      .status(status)
      .type('application/problem+json')
      .send({
        type,
        title,
        status,
        ...(detail ? { detail } : {}),
        correlationId,
        ...(errors ? { errors } : {}),
      });
  }
}

function stackOf(error: unknown): string | undefined {
  return error instanceof Error ? error.stack : undefined;
}
