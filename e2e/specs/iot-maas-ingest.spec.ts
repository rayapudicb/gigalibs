/**
 * WI-OI-130: optional API ingest check when IoT stack credentials are supplied (compose iot-api on 4250).
 */
import { expect, test } from '@playwright/test';
import { postIotIngest } from '../helpers/iot-ingest';

const iotBase = process.env.IOT_E2E_API_URL ?? 'http://127.0.0.1:4250';
const deviceId = process.env.IOT_E2E_DEVICE_ID ?? '';
const credential = process.env.IOT_E2E_DEVICE_CREDENTIAL ?? '';

const hasIngestFixture = Boolean(deviceId && credential);

test.describe('IoT MaaS ingest (WI-OI-130)', () => {
  test.skip(!hasIngestFixture, 'Set IOT_E2E_DEVICE_ID and IOT_E2E_DEVICE_CREDENTIAL (provision device on UAT first).');

  test('accepts a signed telemetry batch', async () => {
    const idempotencyKey = `e2e-${Date.now()}`;
    const response = await postIotIngest({
      baseUrl: iotBase,
      deviceId,
      credential,
      payload: {
        readings: [
          {
            channelKey: 'VIBRATION_RMS',
            value: 4.2,
            metricType: 'vibration_rms',
            unit: 'mm/s',
            idempotencyKey,
            readAt: new Date().toISOString(),
          },
        ],
      },
    });
    expect(response.status, await response.text()).toBeLessThan(300);
  });
});
