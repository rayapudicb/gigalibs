/**
 * WI-OI-130: signed IoT device ingest (HMAC over raw JSON body; secret is the device credential).
 * Targets the IoT API directly (port 4250 in compose), not the workflow BFF.
 */
import { createHmac } from 'node:crypto';

export type IotIngestReading = {
  readonly channelKey: string;
  readonly value: number;
  readonly unit?: string;
  readonly metricType?: string;
  readonly idempotencyKey: string;
  readonly readAt?: string;
};

export type IotIngestPayload = {
  readonly readings: readonly IotIngestReading[];
};

export function signIotIngestBody(credential: string, rawBody: string): string {
  const digest = createHmac('sha256', credential).update(rawBody, 'utf8').digest('hex');
  return `sha256=${digest}`;
}

export async function postIotIngest(options: {
  readonly baseUrl: string;
  readonly deviceId: string;
  readonly credential: string;
  readonly payload: IotIngestPayload;
}): Promise<Response> {
  const rawBody = JSON.stringify(options.payload);
  const signature = signIotIngestBody(options.credential, rawBody);
  return fetch(`${options.baseUrl.replace(/\/$/, '')}/v1/ingest/${options.deviceId}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-iot-credential': options.credential,
      'x-iot-signature': signature,
    },
    body: rawBody,
  });
}
