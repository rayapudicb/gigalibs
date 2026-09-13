import { randomUUID } from 'node:crypto';

const CORRELATION_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

interface MiddlewareRequest {
  correlationId?: string;
  header(name: string): string | undefined;
}

interface MiddlewareResponse {
  setHeader(name: string, value: string): void;
}

export function requestContextMiddleware(
  request: MiddlewareRequest,
  response: MiddlewareResponse,
  next: () => void,
): void {
  const supplied = request.header('x-correlation-id');
  const correlationId = supplied && CORRELATION_PATTERN.test(supplied) ? supplied : randomUUID();
  request.correlationId = correlationId;
  response.setHeader('x-correlation-id', correlationId);
  next();
}
