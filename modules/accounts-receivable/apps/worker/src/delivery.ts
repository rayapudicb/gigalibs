import { createHmac, timingSafeEqual } from 'node:crypto';

export function webhookSignature(secret: string, timestamp: number, body: string): string {
  const digest = createHmac('sha256', secret).update(`${timestamp}.${body}`, 'utf8').digest('hex');
  return `t=${timestamp},v1=${digest}`;
}

export function verifyWebhookSignature(
  secret: string,
  signature: string,
  body: string,
  nowSeconds: number,
  toleranceSeconds = 300,
): boolean {
  const match = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(signature);
  if (!match?.[1] || !match[2]) return false;
  const timestamp = Number(match[1]);
  if (!Number.isSafeInteger(timestamp) || Math.abs(nowSeconds - timestamp) > toleranceSeconds)
    return false;
  const expected = webhookSignature(secret, timestamp, body);
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export function retryDelaySeconds(attempt: number): number {
  return Math.min(3600, 2 ** Math.min(12, Math.max(0, attempt)));
}
