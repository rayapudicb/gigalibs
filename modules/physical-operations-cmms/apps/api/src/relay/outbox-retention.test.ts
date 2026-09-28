/** Production hardening — outbox retention configuration and sweep batching. */
import { describe, expect, it, vi } from 'vitest';
import { OutboxRetention, loadOutboxRetentionConfig } from './outbox-retention.js';

describe('outbox retention', () => {
  it('defaults to 30 days for facts and 90 for receipts, hourly', () => {
    expect(loadOutboxRetentionConfig({})).toEqual({ retentionDays: 30, receiptRetentionDays: 90, intervalMs: 3_600_000 });
  });

  it('refuses windows below a week and receipts kept shorter than facts', () => {
    expect(() => loadOutboxRetentionConfig({ CMMS_OUTBOX_RETENTION_DAYS: '3' })).toThrow(/between 7 and 3650/);
    expect(() => loadOutboxRetentionConfig({ CMMS_OUTBOX_RETENTION_DAYS: '60', CMMS_INBOX_RECEIPT_RETENTION_DAYS: '30' })).toThrow(/at least/);
    expect(() => loadOutboxRetentionConfig({ CMMS_OUTBOX_SWEEP_INTERVAL_MS: 'hourly' })).toThrow();
  });

  it('sweeps in bounded batches until a batch comes back short, and never throws', async () => {
    const relayCall = vi.fn()
      .mockResolvedValueOnce([{ published: '10000', unrouted: '2', receipts: '0' }])
      .mockResolvedValueOnce([{ published: '5', unrouted: '0', receipts: '1' }]);
    const sweeper = new OutboxRetention({ relayCall } as never, loadOutboxRetentionConfig({}));
    await expect(sweeper.sweep()).resolves.toEqual({ published: 10_005, unrouted: 2, receipts: 1 });
    expect(relayCall).toHaveBeenCalledTimes(2);
    expect(relayCall).toHaveBeenCalledWith('outbox_sweep', [30, 90, 10_000]);
    const failing = new OutboxRetention({ relayCall: vi.fn().mockRejectedValue(new Error('down')) } as never, loadOutboxRetentionConfig({}));
    await expect(failing.sweep()).resolves.toEqual({ published: 0, unrouted: 0, receipts: 0 });
  });
});
