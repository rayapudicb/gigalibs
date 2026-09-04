import EventEmitter2, { type ListenerFn } from 'eventemitter2';
import { logger } from '@gigalibs/logger';

export type DomainEventHandler<T = unknown> = (payload: T) => void | Promise<void>;

/**
 * In-process typed event bus.
 * Lightweight alternative to a message broker for same-process communication.
 *
 * @example
 * // Publish
 * eventBus.emit(DomainEvents.USER_REGISTERED, { userId, tenantId });
 *
 * // Subscribe
 * eventBus.on(DomainEvents.USER_REGISTERED, async ({ userId }) => {
 *   await welcomeEmailService.send(userId);
 * });
 */
export class GigaEventBus {
  private readonly emitter: EventEmitter2;

  constructor() {
    this.emitter = new EventEmitter2({
      wildcard: true,       // enables 'auth.*' pattern matching
      delimiter: '.',
      maxListeners: 50,
    });
  }

  /**
   * Subscribe to a domain event.
   * Returns an unsubscribe function.
   */
  on<T>(event: string, handler: DomainEventHandler<T>): () => void {
    const listener: ListenerFn = async (payload: T) => {
      try {
        await handler(payload);
      } catch (err) {
        logger.error({ err, event }, 'EventBus handler error');
      }
    };
    this.emitter.on(event, listener);
    return () => { this.emitter.removeListener(event, listener); };
  }

  /**
   * Subscribe once — handler runs once then auto-unsubscribes.
   */
  once<T>(event: string, handler: DomainEventHandler<T>): void {
    this.emitter.once(event, async (payload: T) => {
      try {
        await handler(payload);
      } catch (err) {
        logger.error({ err, event }, 'EventBus once-handler error');
      }
    });
  }

  /**
   * Emit a domain event synchronously (all handlers called immediately).
   */
  emit<T>(event: string, payload: T): void {
    logger.debug({ event }, 'EventBus emit');
    this.emitter.emit(event, payload);
  }

  /**
   * Emit and wait for all async handlers to settle.
   */
  async emitAsync<T>(event: string, payload: T): Promise<void> {
    logger.debug({ event }, 'EventBus emitAsync');
    await this.emitter.emitAsync(event, payload);
  }

  removeAllListeners(event?: string): void {
    this.emitter.removeAllListeners(event);
  }
}

/** Singleton event bus instance for the process */
export const eventBus = new GigaEventBus();
