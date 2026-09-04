import type { BrokerAdapter, EventHandler, EventPayload } from './types.js';
import { logger } from '@gigalibs/logger';

/**
 * The Broker — the single publish/subscribe interface your modules use.
 * Does not know or care what adapter is underneath.
 *
 * @example
 * // Publish
 * await broker.publish(Events.USER_REGISTERED, { userId, email });
 *
 * // Subscribe
 * broker.on(Events.INVOICE_PAID, async ({ payload }) => {
 *   await provisionAccess(payload.tenantId);
 * });
 */
export class Broker {
  private readonly subscriptions: Array<() => void> = [];

  constructor(private readonly adapter: BrokerAdapter) {}

  /**
   * Publish a typed event to all subscribers.
   */
  async publish<T extends EventPayload>(
    event: string,
    payload: T,
    tenantId?: string,
  ): Promise<void> {
    logger.debug({ event, ...(tenantId ? { tenantId } : {}) }, 'Publishing event');
    await this.adapter.publish(event, payload, tenantId);
  }

  /**
   * Subscribe to an event. Returns an unsubscribe function.
   */
  async on<T extends EventPayload>(
    event: string,
    handler: EventHandler<T>,
  ): Promise<() => void> {
    const unsubscribe = await this.adapter.subscribe<T>(event, async (msg) => {
      try {
        await handler(msg);
      } catch (err) {
        logger.error({ err, event, messageId: msg.id }, 'Event handler error');
      }
    });
    this.subscriptions.push(unsubscribe);
    return unsubscribe;
  }

  /**
   * Check if the broker backend is healthy.
   */
  async healthCheck(): Promise<boolean> {
    return this.adapter.healthCheck();
  }

  /**
   * Clean up all subscriptions (call on module destroy).
   */
  async close(): Promise<void> {
    this.subscriptions.forEach((unsub) => unsub());
    await this.adapter.unsubscribeAll();
  }
}
