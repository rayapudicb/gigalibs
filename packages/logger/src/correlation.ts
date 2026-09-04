import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';

interface CorrelationStore {
  correlationId: string;
  traceId?: string;
}

const storage = new AsyncLocalStorage<CorrelationStore>();
const CORRELATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

/**
 * Generate a short correlation ID: 8 hex bytes = 16 chars.
 */
const generateCorrelationId = (): string => randomBytes(8).toString('hex');

/**
 * Accept only bounded opaque correlation identifiers. Invalid caller values
 * are replaced so request metadata cannot inject log content or unbounded
 * telemetry cardinality.
 */
export const resolveCorrelationId = (incoming: string | string[] | undefined): string => {
  const candidate = Array.isArray(incoming) ? incoming[0] : incoming;
  return candidate && CORRELATION_ID_PATTERN.test(candidate) ? candidate : generateCorrelationId();
};

/**
 * Run a function within a correlation context.
 * All async work inside fn() shares the same correlationId.
 */
export const withCorrelation = <T>(fn: () => T, correlationId?: string): T =>
  storage.run({ correlationId: correlationId ?? generateCorrelationId() }, fn);

/**
 * Get the current correlation ID (undefined if outside a context).
 */
export const getCorrelationId = (): string | undefined => storage.getStore()?.correlationId;

/**
 * Get the full correlation store (correlationId + optional traceId).
 */
export const getCorrelationStore = (): CorrelationStore | undefined => storage.getStore();

/**
 * Express/Fastify/NestJS middleware that:
 *  1. Reads X-Correlation-ID header (or generates one)
 *  2. Wraps the request in a correlation context
 *  3. Sets X-Correlation-ID on the response
 */
export const correlationMiddleware = (
  req: { headers: Record<string, string | string[] | undefined> },
  res: { setHeader: (name: string, value: string) => void },
  next: () => void,
): void => {
  const correlationId = resolveCorrelationId(req.headers['x-correlation-id']);

  res.setHeader('X-Correlation-ID', correlationId);
  withCorrelation(next, correlationId);
};
