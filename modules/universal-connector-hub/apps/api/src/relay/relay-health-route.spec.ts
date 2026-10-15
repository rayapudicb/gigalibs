import 'reflect-metadata';
import type { AddressInfo } from 'node:net';
import {
  createRelayHealthController,
  registerRelayHealth,
  resetRelayHealth,
} from '@gigalibs/module-sdk';
import { type INestApplication, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// WI-OI-120as: the hub's relay health answers beside its own health routes, over HTTP.
@Module({ controllers: [createRelayHealthController('api/connectors/v1/health')] })
class RelayHealthRouteProofModule {}

describe('Connector Hub relay health route', () => {
  let app: INestApplication;
  let base: string;

  beforeAll(async () => {
    app = await NestFactory.create(RelayHealthRouteProofModule, { logger: false });
    await app.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    resetRelayHealth();
    await app?.close();
  });

  it('reports each relay at api/connectors/v1/health/relays, and 503 when one is stalled', async () => {
    const snapshot = {
      relay: 'connector-hub -> gigalibs-analytics-api',
      configured: true,
      intervalMs: 5_000,
      startedAt: Date.now(),
      lastPassAt: new Date().toISOString(),
      lastPassLeased: 0,
      lastDeliveredAt: null,
      deliveredSinceStart: 0,
      lastFailureAt: null,
      lastFailureCode: null,
    };
    registerRelayHealth(snapshot.relay, () => snapshot);
    const ok = await fetch(`${base}/api/connectors/v1/health/relays`);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({
      status: 'ok',
      relays: [{ relay: snapshot.relay, state: 'running' }],
    });

    registerRelayHealth(snapshot.relay, () => ({
      ...snapshot,
      lastPassAt: new Date(Date.now() - 3_600_000).toISOString(),
    }));
    const stalled = await fetch(`${base}/api/connectors/v1/health/relays`);
    expect(stalled.status).toBe(503);
  });
});
