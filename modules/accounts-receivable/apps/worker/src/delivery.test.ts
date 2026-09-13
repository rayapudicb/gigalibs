import { describe, expect, it } from 'vitest';
import { retryDelaySeconds, verifyWebhookSignature, webhookSignature } from './delivery.js';

describe('signed webhook delivery', () => {
  it('signs and verifies an event without exposing the secret', () => {
    const secret = 'test-only-secret-that-is-at-least-32-characters';
    const signature = webhookSignature(secret, 1_800_000_000, '{"id":"evt"}');
    expect(signature).not.toContain(secret);
    expect(verifyWebhookSignature(secret, signature, '{"id":"evt"}', 1_800_000_050)).toBe(true);
    expect(verifyWebhookSignature(secret, signature, '{"id":"changed"}', 1_800_000_050)).toBe(
      false,
    );
  });

  it('rejects stale signatures and caps exponential retries', () => {
    const secret = 'test-only-secret-that-is-at-least-32-characters';
    const signature = webhookSignature(secret, 100, '{}');
    expect(verifyWebhookSignature(secret, signature, '{}', 1000)).toBe(false);
    expect(retryDelaySeconds(0)).toBe(1);
    expect(retryDelaySeconds(30)).toBe(3600);
  });
});
