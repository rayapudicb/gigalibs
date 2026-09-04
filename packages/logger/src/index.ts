/**
 * @gigalibs/logger
 *
 * Structured JSON logging with Pino. Request-scoped correlation IDs
 * via AsyncLocalStorage. NestJS LoggerService adapter.
 *
 * @module
 */

export * from './logger.js';
export * from './correlation.js';
export * from './nest-logger.js';
export type { Logger } from './logger.js';
