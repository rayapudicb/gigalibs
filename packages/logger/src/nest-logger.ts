import { Injectable, type LoggerService } from '@nestjs/common';
import { createLogger, type Logger } from './logger.js';

/**
 * NestJS LoggerService adapter backed by Pino.
 * Drop-in replacement for NestJS's built-in logger.
 *
 * @example
 * // main.ts
 * import { GigaLogger } from '@gigalibs/logger';
 * const app = await NestFactory.create(AppModule, { bufferLogs: true });
 * app.useLogger(app.get(GigaLogger));
 */
@Injectable()
export class GigaLogger implements LoggerService {
  private readonly logger: Logger;

  constructor(context?: string) {
    this.logger = createLogger({ module: context ?? 'App' });
  }

  log(message: unknown, context?: string): void {
    this.logger.info({ context }, String(message));
  }

  error(message: unknown, stack?: string, context?: string): void {
    this.logger.error({ context, stack }, String(message));
  }

  warn(message: unknown, context?: string): void {
    this.logger.warn({ context }, String(message));
  }

  debug(message: unknown, context?: string): void {
    this.logger.debug({ context }, String(message));
  }

  verbose(message: unknown, context?: string): void {
    this.logger.trace({ context }, String(message));
  }

  /**
   * Create a child logger bound to a specific context/module.
   * Use in services for structured per-module logging.
   */
  forContext(context: string): GigaLogger {
    return new GigaLogger(context);
  }
}
