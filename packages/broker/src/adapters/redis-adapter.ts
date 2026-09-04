import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import type { BrokerAdapter, BrokerMessage, EventHandler, EventPayload } from '../types.js';
import { logger } from '@gigalibs/logger';

/**
 * Redis Pub/Sub broker adapter.
 * Default adapter — requires no additional infrastructure beyond Redis.
 * For multi-instance deployments, this works because all instances
 * share the same Redis Pub/Sub channel.
 */
export class RedisBrokerAdapter implements BrokerAdapter {
  private readonly handlers = new Map<string, EventHandler[]>();

  constructor(
    private readonly publisher: Redis,
    private readonly subscriber: Redis,
    private readonly channelPrefix = 'gigalibs:events',
  ) {
    this.subscriber.on('message', (channel: string, raw: string) => {
      this.dispatch(channel, raw).catch((err: Error) =>
        logger.error({ err, channel }, 'RedisBroker dispatch error'),
      );
    });
  }

  async publish<T extends EventPayload>(
    event: string,
    payload: T,
    tenantId?: string,
  ): Promise<void> {
    const message: BrokerMessage<T> = {
      id: randomUUID(),
      event,
      payload,
      ...(tenantId ? { tenantId } : {}),
      timestamp: new Date().toISOString(),
    };
    const channel = `${this.channelPrefix}:${event}`;
    await this.publisher.publish(channel, JSON.stringify(message));
  }

  async subscribe<T extends EventPayload>(
    event: string,
    handler: EventHandler<T>,
  ): Promise<() => void> {
    const channel = `${this.channelPrefix}:${event}`;
    if (!this.handlers.has(channel)) {
      this.handlers.set(channel, []);
      await this.subscriber.subscribe(channel);
    }
    this.handlers.get(channel)!.push(handler as EventHandler);
    return () => { this.removeHandler(channel, handler as EventHandler); };
  }

  async unsubscribeAll(): Promise<void> {
    const channels = [...this.handlers.keys()];
    if (channels.length > 0) await this.subscriber.unsubscribe(...channels);
    this.handlers.clear();
  }

  async healthCheck(): Promise<boolean> {
    try {
      const pong = await this.publisher.ping();
      return pong === 'PONG';
    } catch {
      return false;
    }
  }

  private removeHandler(channel: string, handler: EventHandler): void {
    const list = this.handlers.get(channel);
    if (!list) return;
    const filtered = list.filter((h) => h !== handler);
    if (filtered.length === 0) {
      this.handlers.delete(channel);
      this.subscriber.unsubscribe(channel).catch((err: Error) => {
        logger.warn({ err, channel }, 'RedisBroker unsubscribe failed');
      });
    } else {
      this.handlers.set(channel, filtered);
    }
  }

  private async dispatch(channel: string, raw: string): Promise<void> {
    const handlers = this.handlers.get(channel) ?? [];
    if (handlers.length === 0) return;
    let message: BrokerMessage;
    try {
      message = JSON.parse(raw) as BrokerMessage;
    } catch {
      logger.warn({ channel, raw }, 'Could not parse broker message');
      return;
    }
    await Promise.allSettled(handlers.map((h) => h(message)));
  }
}
