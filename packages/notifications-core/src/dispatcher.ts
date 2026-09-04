import type { NotificationChannel, NotificationPayload, NotificationDeliveryResult } from './types.js';

export type ChannelHandler = (notification: NotificationPayload) => Promise<boolean>;

export class NotificationDispatcher {
  private handlers = new Map<NotificationChannel, ChannelHandler>();

  registerChannel(channel: NotificationChannel, handler: ChannelHandler): void {
    this.handlers.set(channel, handler);
  }

  async dispatch(notification: NotificationPayload): Promise<NotificationDeliveryResult[]> {
    const results: NotificationDeliveryResult[] = [];

    for (const channel of notification.channels) {
      const handler = this.handlers.get(channel);
      if (!handler) {
        results.push({ channel, success: false, error: `No handler registered for channel '${channel}'` });
        continue;
      }

      try {
        const success = await handler(notification);
        results.push({ channel, success });
      } catch (err: unknown) {
        results.push({
          channel,
          success: false,
          error: err instanceof Error ? err.message : 'Unknown channel error',
        });
      }
    }

    return results;
  }
}
