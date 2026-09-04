import type { Redis } from 'ioredis';
import { logger } from '@gigalibs/logger';

export type MessageHandler<T = unknown> = (payload: T, channel: string) => void | Promise<void>;

/**
 * Simple type-safe pub/sub wrapper around Redis.
 * For cross-service messaging, prefer @gigalibs/broker.
 * This is for lightweight in-process pub/sub (e.g. cache invalidation, presence).
 */
export class RedisPubSub {
  private readonly handlers = new Map<string, MessageHandler[]>();

  constructor(
    private readonly publisher: Redis,
    private readonly subscriber: Redis,
  ) {
    this.subscriber.on('message', (channel: string, raw: string) => {
      this.dispatch(channel, raw).catch((err: Error) =>
        logger.error({ err, channel }, 'PubSub dispatch error'),
      );
    });
  }

  async publish<T>(channel: string, payload: T): Promise<void> {
    await this.publisher.publish(channel, JSON.stringify(payload));
  }

  subscribe<T>(channel: string, handler: MessageHandler<T>): () => void {
    if (!this.handlers.has(channel)) {
      this.handlers.set(channel, []);
      this.subscriber.subscribe(channel).catch((err: Error) =>
        logger.error({ err, channel }, 'Redis subscribe error'),
      );
    }
    this.handlers.get(channel)!.push(handler as MessageHandler);
    // Return unsubscribe fn
    return () => this.unsubscribe(channel, handler as MessageHandler);
  }

  private unsubscribe(channel: string, handler: MessageHandler): void {
    const handlers = this.handlers.get(channel) ?? [];
    const filtered = handlers.filter((h) => h !== handler);
    if (filtered.length === 0) {
      this.handlers.delete(channel);
      this.subscriber.unsubscribe(channel).catch(() => {/* ignore */});
    } else {
      this.handlers.set(channel, filtered);
    }
  }

  private async dispatch(channel: string, raw: string): Promise<void> {
    const handlers = this.handlers.get(channel) ?? [];
    if (handlers.length === 0) return;
    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      logger.warn({ channel, raw }, 'Could not parse pub/sub message');
      return;
    }
    await Promise.allSettled(handlers.map((h) => h(payload, channel)));
  }
}
