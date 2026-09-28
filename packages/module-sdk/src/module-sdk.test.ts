/**
 * WI-OI-082 — module SDK parameterisation: the same code serves CMMS and Workforce with their own names, and keeps
 * the relay, tenant-binding and retention guarantees each module was certified with.
 */
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { signRelayToken } from '@gigalibs/auth-core';
import type { ExecutionContext } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ModuleDatabase,
  OutboxRetentionSweeper,
  RelayInboxGuardBase,
  deliver,
  loadOutboxRetentionConfig,
  loadRelayConfig,
  receiveOnce,
  relayOrigin,
} from './index.js';

const names = (prefix: string, peer: string, peerService: string) => ({
  inboxPublicKey: `${prefix}_INBOX_RELAY_PUBLIC_KEY_BASE64`,
  targetUrl: `${prefix}_RELAY_${peer}_URL`,
  signingKey: `${peer}_INBOX_RELAY_PRIVATE_KEY_BASE64`,
  interval: `${prefix}_RELAY_INTERVAL_MS`,
  peerService,
});

function keys() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    publicBase64: publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
    privateBase64: privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'),
    privatePem: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
  };
}

describe('relay configuration', () => {
  it('names the module-specific variables in every refusal', () => {
    for (const [prefix, peer, service] of [
      ['CMMS', 'WORKFORCE', 'workforce-api'],
      ['WORKFORCE', 'CMMS', 'cmms-api'],
    ] as const) {
      const n = names(prefix, peer, service);
      expect(() => loadRelayConfig({ [n.targetUrl]: `http://${service}:4000` }, n)).toThrow(
        `Set both ${n.targetUrl} and ${n.signingKey}, or neither.`,
      );
      expect(() => loadRelayConfig({ [n.inboxPublicKey]: 'bm90LWEta2V5' }, n)).toThrow(
        `${n.inboxPublicKey} must be an Ed25519 public key.`,
      );
      expect(() => loadRelayConfig({ [n.interval]: '5' }, n)).toThrow(
        `${n.interval} must be an integer between 100 and 60000.`,
      );
      expect(loadRelayConfig({}, n)).toEqual({
        inboxPublicKey: null,
        outbound: null,
        intervalMs: 1_000,
      });
    }
  });

  it('accepts only loopback or the peer service origin', () => {
    expect(relayOrigin('http://cmms-api:4200/', 'cmms-api')).toBe('http://cmms-api:4200');
    expect(relayOrigin('http://127.0.0.1:4700', 'cmms-api')).toBe('http://127.0.0.1:4700');
    for (const bad of [
      'http://evil.example:4200',
      'http://user:pw@cmms-api:4200',
      'http://cmms-api:4200/path',
      'ftp://cmms-api',
    ]) {
      expect(() => relayOrigin(bad, 'cmms-api')).toThrow(
        'The relay target must be the cmms-api service origin.',
      );
    }
  });
});

describe('delivery outcomes', () => {
  afterEach(() => vi.unstubAllGlobals());
  const envelope = {
    messageId: randomUUID(),
    tenantId: 'tenant0001',
    eventType: 'X_V1',
    aggregateType: 'X',
    aggregateId: randomUUID(),
    aggregateVersion: 1,
    correlationId: randomUUID(),
    causationId: null,
    schemaVersion: 1,
    payload: {},
    occurredAt: new Date().toISOString(),
  };
  const send = (status: number | Error) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        if (status instanceof Error) throw status;
        return new Response(null, { status });
      }),
    );
    return deliver(
      'http://cmms-api:4200',
      keys().privatePem,
      'gigalibs-cmms-inbox',
      'workforce',
      envelope,
    );
  };

  it('publishes on 2xx, dead-letters permanent 4xx and retries the rest', async () => {
    await expect(send(202)).resolves.toEqual({ ok: true, permanent: false, code: null });
    await expect(send(401)).resolves.toEqual({ ok: false, permanent: true, code: 'HTTP_401' });
    await expect(send(408)).resolves.toEqual({ ok: false, permanent: false, code: 'HTTP_408' });
    await expect(send(429)).resolves.toEqual({ ok: false, permanent: false, code: 'HTTP_429' });
    await expect(send(503)).resolves.toEqual({ ok: false, permanent: false, code: 'HTTP_503' });
    await expect(send(Object.assign(new Error('slow'), { name: 'TimeoutError' }))).resolves.toEqual(
      { ok: false, permanent: false, code: 'TIMEOUT' },
    );
    await expect(send(new Error('refused'))).resolves.toEqual({
      ok: false,
      permanent: false,
      code: 'UNREACHABLE',
    });
  });
});

describe('relay inbox guard', () => {
  const { publicBase64, privatePem } = keys();
  const config = loadRelayConfig(
    { CMMS_INBOX_RELAY_PUBLIC_KEY_BASE64: publicBase64 },
    names('CMMS', 'WORKFORCE', 'workforce-api'),
  );
  const guard = new RelayInboxGuardBase(config, {
    audience: 'gigalibs-cmms-inbox',
    source: 'workforce',
    label: 'CMMS',
  });
  const activate = (target: RelayInboxGuardBase, request: object) =>
    target.canActivate({
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext);
  const request = (body: { tenantId: string; messageId: string }, source = 'workforce') => {
    const raw = JSON.stringify(body);
    const token = signRelayToken(
      {
        audience: 'gigalibs-cmms-inbox',
        source,
        tenantId: body.tenantId,
        messageId: body.messageId,
        body: raw,
      },
      privatePem,
      60,
    );
    return { headers: { authorization: `Bearer ${token}` }, rawBody: Buffer.from(raw), body };
  };

  it('accepts the peer, bound to the body, tenant and message id', () => {
    const body = { tenantId: 'tenant0001', messageId: randomUUID() };
    expect(activate(guard, request(body))).toBe(true);
  });

  it('refuses another source, a mismatched envelope and a missing key', () => {
    const body = { tenantId: 'tenant0001', messageId: randomUUID() };
    expect(() => activate(guard, request(body, 'cmms'))).toThrow(/rejected/);
    expect(() =>
      activate(guard, { ...request(body), body: { ...body, tenantId: 'tenant0002' } }),
    ).toThrow('The relay token does not match the envelope.');
    const unconfigured = new RelayInboxGuardBase(
      { ...config, inboxPublicKey: null },
      { audience: 'a', source: 'b', label: 'Workforce' },
    );
    expect(() => activate(unconfigured, request(body))).toThrow(
      'The Workforce inbox is not configured.',
    );
  });
});

describe('inbox receipts', () => {
  const envelope = {
    tenantId: 'tenant0001',
    messageId: randomUUID(),
    eventType: 'X_V1',
    schemaVersion: 1,
    correlationId: randomUUID(),
  };
  const options = {
    schema: 'gigalibs_cmms',
    consumer: 'cmms.workforce-handshake',
    sourceModule: 'workforce',
  };
  const clientReturning = (inserted: boolean) => {
    const statements: { sql: string; values: unknown[] }[] = [];
    const query = vi.fn(async (sql: string, values: unknown[] = []) => {
      statements.push({ sql, values });
      return sql.startsWith('INSERT')
        ? { rows: inserted ? [{ id: 'receipt-1' }] : [], rowCount: inserted ? 1 : 0 }
        : { rows: [], rowCount: 1 };
    });
    return { client: { query } as never, statements };
  };

  it('applies once and settles the receipt in the same transaction', async () => {
    const { client, statements } = clientReturning(true);
    const apply = vi.fn(async () => ({ status: 'REJECTED' as const, code: 'CODE' }));
    await expect(receiveOnce(client, options, envelope, '{}', apply)).resolves.toEqual({
      status: 'REJECTED',
      code: 'CODE',
    });
    expect(apply).toHaveBeenCalledOnce();
    expect(statements[0]?.sql).toContain('INSERT INTO gigalibs_cmms.inbox_receipts');
    expect(statements[0]?.values.slice(2, 6)).toEqual([
      'cmms.workforce-handshake',
      envelope.messageId,
      'X_V1',
      'workforce',
    ]);
    expect(statements.at(-1)?.values.slice(2)).toEqual(['FAILED', 'CODE']);
  });

  it('returns DUPLICATE without applying a redelivery', async () => {
    const { client, statements } = clientReturning(false);
    const apply = vi.fn();
    await expect(receiveOnce(client, options, envelope, '{}', apply)).resolves.toEqual({
      status: 'DUPLICATE',
    });
    expect(apply).not.toHaveBeenCalled();
    expect(statements).toHaveLength(1);
  });
});

describe('module database', () => {
  const base = {
    databaseUrl: 'postgres://x',
    poolSize: 1,
    expectedMigrationVersion: 14,
    definerFunctions: ['outbox_sweep'] as const,
  };
  const withClient = (tenantBinding: 'set-local' | 'set-config') => {
    const query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    const database = new ModuleDatabase({
      ...base,
      label: 'Test',
      schema: 'gigalibs_test',
      tenantBinding,
    });
    (database as unknown as { pool: unknown }).pool = {
      connect: vi.fn(async () => ({ query, release: vi.fn() })),
      query,
    };
    return { database, query };
  };

  it('binds the tenant in the module binding style', async () => {
    const local = withClient('set-local');
    await local.database.withTenantTransaction('tenant0001', async () => undefined);
    expect(local.query.mock.calls.map((call: unknown[]) => call[0])).toEqual([
      'BEGIN',
      'SET LOCAL search_path TO gigalibs_test, public',
      'SELECT set_config($1, $2, true)',
      'COMMIT',
    ]);
    const combined = withClient('set-config');
    await combined.database.withTenantTransaction('tenant0001', async () => undefined);
    expect(combined.query.mock.calls[1]).toEqual([
      "SELECT set_config('search_path', 'gigalibs_test, public', true), set_config('app.tenant_id', $1, true)",
      ['tenant0001'],
    ]);
  });

  it('refuses invalid tenant ids, unlisted definer functions and unsafe identifiers', async () => {
    const { database, query } = withClient('set-config');
    await expect(
      database.withTenantTransaction("x'; DROP TABLE y; --", async () => 1),
    ).rejects.toThrow('The verified tenant identifier is invalid.');
    await expect(database.relayCall('relay_lease_anything' as never, [])).rejects.toThrow(
      'is not an allow-listed definer function',
    );
    expect(query).not.toHaveBeenCalled();
    expect(
      () =>
        new ModuleDatabase({
          ...base,
          label: 'Test',
          schema: 'bad; schema',
          tenantBinding: 'set-config',
        }),
    ).toThrow(/lowercase SQL identifiers/);
  });
});

describe('outbox retention', () => {
  it('reads the module prefix and keeps receipts at least as long as facts', () => {
    expect(loadOutboxRetentionConfig({}, 'CMMS')).toEqual({
      retentionDays: 30,
      receiptRetentionDays: 90,
      intervalMs: 3_600_000,
    });
    expect(() =>
      loadOutboxRetentionConfig(
        { WORKFORCE_OUTBOX_RETENTION_DAYS: '60', WORKFORCE_INBOX_RECEIPT_RETENTION_DAYS: '30' },
        'WORKFORCE',
      ),
    ).toThrow(
      'WORKFORCE_INBOX_RECEIPT_RETENTION_DAYS must be at least WORKFORCE_OUTBOX_RETENTION_DAYS, so replays inside the window stay de-duplicated.',
    );
    expect(() =>
      loadOutboxRetentionConfig({ CMMS_OUTBOX_SWEEP_INTERVAL_MS: '10' }, 'CMMS'),
    ).toThrow('CMMS_OUTBOX_SWEEP_INTERVAL_MS must be an integer between 60000 and 86400000.');
  });

  it('sweeps in bounded batches until a batch is not full', async () => {
    const relayCall = vi
      .fn()
      .mockResolvedValueOnce([{ published: '10000', unrouted: '0', receipts: '5' }])
      .mockResolvedValueOnce([{ published: '3', unrouted: '0', receipts: '0' }]);
    const sweeper = new OutboxRetentionSweeper(
      { relayCall },
      loadOutboxRetentionConfig({}, 'CMMS'),
    );
    await expect(sweeper.sweep()).resolves.toEqual({ published: 10_003, unrouted: 0, receipts: 5 });
    expect(relayCall).toHaveBeenCalledTimes(2);
    expect(relayCall).toHaveBeenCalledWith('outbox_sweep', [30, 90, 10_000]);
  });
});
