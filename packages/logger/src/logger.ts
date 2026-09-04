import pino, { type LoggerOptions } from 'pino';
import { getCorrelationId } from './correlation.js';

export type Logger = pino.Logger;
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

const developmentTransport: LoggerOptions =
  process.env['NODE_ENV'] !== 'production'
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, ignore: 'pid,hostname', translateTime: 'HH:MM:ss' },
        },
      }
    : {};

const defaultOptions: LoggerOptions = {
  ...developmentTransport,
  level: process.env['LOG_LEVEL'] ?? (process.env['NODE_ENV'] === 'production' ? 'info' : 'debug'),
  formatters: {
    level: (label) => ({ level: label }),
  },
  // Attach correlation ID to every log entry automatically
  mixin() {
    const correlationId = getCorrelationId();
    return correlationId ? { correlationId } : {};
  },
  // Redact sensitive fields from logs — never log these
  redact: {
    paths: [
      'password', 'passwordHash', 'token', 'accessToken', 'refreshToken',
      'secret', 'apiKey', 'authorization', 'cookie',
      'req.headers.authorization', 'req.headers.cookie',
    ],
    censor: '[REDACTED]',
  },
};

/**
 * Root application logger.
 * Import this singleton everywhere — it's cheap (Pino is ~5x faster than Winston).
 */
export const logger: Logger = pino(defaultOptions);

/**
 * Create a child logger with bound context.
 * Use within modules/services to add module name, tenant, userId etc.
 *
 * @example
 * const log = createLogger({ module: 'AuthService', tenantId });
 * log.info({ userId }, 'User logged in');
 */
export const createLogger = (bindings: Record<string, unknown>): Logger =>
  logger.child(bindings);
