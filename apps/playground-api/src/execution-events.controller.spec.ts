import { createHmac } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const signingSecret = 'unit-test-signing-secret-at-least-32-characters';
let createExecutionEventsController: (service: object) => {
  ingest: (event: never) => unknown;
};
let createExecutionEventSignatureGuard: () => {
  canActivate: (context: never) => boolean;
};

beforeAll(async () => {
  process.env.API_HOST = '127.0.0.1';
  process.env.API_PORT = '3333';
  process.env.CORS_ORIGINS = 'https://console.example.test';
  process.env.WORKFLOW_SCHEMA_VERSION = '1.0';
  process.env.WORKFLOW_COMPILER_VERSION = '1.0';
  process.env.WORKFLOW_PUBLISH_MAX_RETRIES = '3';
  process.env.EXECUTION_EVENT_SOURCE_ID = 'execution-plane-test';
  process.env.EXECUTION_EVENT_SIGNING_SECRET = signingSecret;
  process.env.EXECUTION_EVENT_MAX_SKEW_SECONDS = '300';
  process.env.OBSERVABILITY_METRICS_TOKEN = 'unit-test-metrics-token-at-least-32-characters';
  const controllerModule = await import('./execution-events.controller.js');
  const guardModule = await import('./execution-event-signature.guard.js');
  createExecutionEventsController = (service) =>
    new controllerModule.ExecutionEventsController(service as never);
  createExecutionEventSignatureGuard = () => new guardModule.ExecutionEventSignatureGuard();
});

describe('ExecutionEventsController', () => {
  const service = { ingest: vi.fn() };

  beforeEach(() => {
    service.ingest.mockReset();
    service.ingest.mockResolvedValue({ accepted: true, duplicate: false });
  });

  it('passes validated events to persistence', async () => {
    const event = executionEvent();
    const controller = createExecutionEventsController(service);

    await controller.ingest(event as never);

    expect(service.ingest).toHaveBeenCalledExactlyOnceWith(event);
  });

  it('accepts an event only when its raw body has a valid signature', () => {
    const rawBody = Buffer.from(JSON.stringify(executionEvent()));
    const timestamp = String(Math.floor(Date.now() / 1000));
    const guard = createExecutionEventSignatureGuard();

    expect(guard.canActivate(executionContext(rawBody, timestamp, sign(timestamp, rawBody)))).toBe(
      true,
    );
  });

  it('rejects a stale timestamp before persistence', () => {
    const rawBody = Buffer.from(JSON.stringify(executionEvent()));
    const timestamp = String(Math.floor(Date.now() / 1000) - 301);
    const guard = createExecutionEventSignatureGuard();

    expect(() =>
      guard.canActivate(executionContext(rawBody, timestamp, sign(timestamp, rawBody))),
    ).toThrow(UnauthorizedException);
    expect(service.ingest).not.toHaveBeenCalled();
  });

  it('rejects a signature created for different bytes', () => {
    const rawBody = Buffer.from(JSON.stringify(executionEvent()));
    const timestamp = String(Math.floor(Date.now() / 1000));
    const guard = createExecutionEventSignatureGuard();

    expect(() =>
      guard.canActivate(executionContext(rawBody, timestamp, sign(timestamp, Buffer.from('{}')))),
    ).toThrow(UnauthorizedException);
    expect(service.ingest).not.toHaveBeenCalled();
  });
});

function sign(timestamp: string, rawBody: Buffer): string {
  const digest = createHmac('sha256', signingSecret)
    .update(timestamp)
    .update('.')
    .update(rawBody)
    .digest('hex');
  return `sha256=${digest}`;
}

function executionContext(rawBody: Buffer, timestamp: string, signature: string) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        rawBody,
        headers: {
          'x-gigalibs-source': 'execution-plane-test',
          'x-gigalibs-timestamp': timestamp,
          'x-gigalibs-signature': signature,
        },
      }),
    }),
  } as never;
}

function executionEvent() {
  return {
    eventId: 'd3020540-dd16-430b-98a0-444433b90dcb',
    eventType: 'execution.run.started.v1',
    tenantId: 'tenant-test',
    actorId: 'user-test',
    workflowId: 'workflow-test',
    runId: '77580fa7-59f8-4683-b818-e64842a22288',
    correlationId: 'cf5238a7-b15d-49d1-ae24-f114fbde8e93',
    occurredAt: '2026-09-02T00:00:00.000Z',
    evidence: { workflowVersion: 1 },
  };
}
