import { generateKeyPairSync } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OutboxRelay } from './outbox-relay.js';
import {
  RelayHealthController,
  type RelayHealthSnapshot,
  relayHealthReport,
  relayState,
  resetRelayHealth,
} from './relay-health.js';

// WI-OI-120as: a relay with nothing routed must be told apart from a relay that is not running.
const { privateKey } = generateKeyPairSync('ed25519', {
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
const START = Date.parse('2026-10-15T10:00:00Z');
const snapshot = (overrides: Partial<RelayHealthSnapshot>): RelayHealthSnapshot => ({
  relay: 'workforce -> gigalibs-cmms-api',
  configured: true,
  intervalMs: 5_000,
  startedAt: START,
  lastPassAt: null,
  lastPassLeased: 0,
  lastDeliveredAt: null,
  deliveredSinceStart: 0,
  lastFailureAt: null,
  lastFailureCode: null,
  consecutiveFailedPasses: 0,
  passStartedAt: null,
  lastProgressAt: null,
  ...overrides,
});

describe('relay state', () => {
  it('is not-configured without a target, starting before its first pass, then running or stalled', () => {
    expect(relayState(snapshot({ configured: false, intervalMs: null }), START + 3_600_000)).toBe(
      'not-configured',
    );
    expect(relayState(snapshot({}), START + 10_000)).toBe('starting');
    // Three intervals (15 s) plus the 30 s grace: no first pass by then is a stall.
    expect(relayState(snapshot({}), START + 46_000)).toBe('stalled');
    const passed = snapshot({ lastPassAt: new Date(START + 60_000).toISOString() });
    expect(relayState(passed, START + 90_000)).toBe('running');
    expect(relayState(passed, START + 60_000 + 46_000)).toBe('stalled');
  });
});

describe('slow, stuck and failing relays (WI-OI-120bd)', () => {
  const lastPass = new Date(START).toISOString();
  it('reads a slow pass that keeps settling facts as running, and a pass with no progress as stalled', () => {
    const slow = snapshot({ lastPassAt: lastPass, passStartedAt: START + 10_000, lastProgressAt: START + 100_000 });
    expect(relayState(slow, START + 120_000)).toBe('running');
    const stuck = snapshot({ lastPassAt: lastPass, passStartedAt: START + 10_000, lastProgressAt: null });
    expect(relayState(stuck, START + 120_000)).toBe('stalled');
  });

  it('reads three failed passes in a row as failing, which the report counts as degraded', () => {
    expect(relayState(snapshot({ lastPassAt: lastPass, consecutiveFailedPasses: 2 }), START + 1_000)).toBe('running');
    expect(relayState(snapshot({ lastPassAt: lastPass, consecutiveFailedPasses: 3 }), START + 1_000)).toBe('failing');
  });
});

describe('relay health from real passes', () => {
  afterEach(() => {
    resetRelayHealth();
    vi.unstubAllGlobals();
  });

  const row = {
    id: 'evt-1',
    tenant_id: 'tenant-1',
    event_type: 'CMMS_STAFFING_REQUESTED_V1',
    aggregate_type: 'work-order',
    aggregate_id: 'wo-1',
    aggregate_version: 1,
    correlation_id: 'corr-1',
    causation_id: null,
    schema_version: 1,
    payload: {},
    created_at: '2026-10-15T09:59:00Z',
  };
  const relayWith = (leased: unknown[][], configured = true) => {
    const calls: string[] = [];
    const database = {
      relayCall: vi.fn(async (fn: string) => {
        calls.push(fn);
        return fn === 'lease' ? (leased.shift() ?? []) : [];
      }),
    };
    const relay = new OutboxRelay(
      database as never,
      {
        inboxPublicKey: null,
        outbound: configured
          ? { targetOrigin: 'http://cmms-api:4200', privateKey, inboxPath: '/internal/v1/inbox' }
          : null,
        intervalMs: 60_000,
      },
      {
        leaseFunction: 'lease',
        settleFunction: 'settle',
        audience: 'gigalibs-cmms-api',
        source: 'workforce',
        notConfiguredMessage: 'off',
      },
    );
    relay.onApplicationBootstrap();
    return { relay, calls };
  };

  it('records an empty pass, so an idle relay reads as running', async () => {
    const { relay } = relayWith([[]]);
    await relay.tick();
    const [health] = relayHealthReport().relays;
    expect(health).toMatchObject({
      relay: 'workforce -> gigalibs-cmms-api',
      state: 'running',
      lastPassLeased: 0,
      deliveredSinceStart: 0,
    });
    expect(health?.lastPassAt).not.toBeNull();
    await relay.onApplicationShutdown();
  });

  it('counts a delivery, and records a refused one with its code', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response('{}', { status: 202 }))
        .mockResolvedValueOnce(new Response('{}', { status: 400 })),
    );
    const { relay } = relayWith([[row], [{ ...row, id: 'evt-2' }]]);
    await relay.tick();
    await relay.tick();
    const [health] = relayHealthReport().relays;
    expect(health).toMatchObject({
      lastPassLeased: 1,
      deliveredSinceStart: 1,
      lastFailureCode: 'HTTP_400',
    });
    expect(health?.lastDeliveredAt).not.toBeNull();
    await relay.onApplicationShutdown();
  });

  it('counts passes that lease facts but deliver none; idle passes do not reset it, a delivery does', async () => {
    const refused = () => Promise.resolve(new Response('{}', { status: 400 }));
    const fetchMock = vi.fn(refused);
    vi.stubGlobal('fetch', fetchMock);
    const failing = (id: string) => [{ ...row, id }];
    const { relay } = relayWith([failing('a'), [], failing('b'), [], failing('c'), failing('d')]);
    for (let pass = 0; pass < 5; pass += 1) await relay.tick();
    expect(relayHealthReport().relays[0]).toMatchObject({ state: 'failing', consecutiveFailedPasses: 3 });
    expect(relayHealthReport().status).toBe('degraded');
    expect(() => new (RelayHealthController as new () => { getRelays(): unknown })().getRelays()).toThrow();
    fetchMock.mockImplementation(() => Promise.resolve(new Response('{}', { status: 202 })));
    await relay.tick();
    expect(relayHealthReport().relays[0]).toMatchObject({ state: 'running', consecutiveFailedPasses: 0 });
    await relay.onApplicationShutdown();
  });

  it('reports a relay with no target as not-configured, which is not a fault', () => {
    relayWith([], false);
    expect(relayHealthReport()).toMatchObject({
      status: 'ok',
      relays: [{ state: 'not-configured', intervalMs: null }],
    });
  });

  it('answers 503 from the endpoint when a configured relay has stalled', async () => {
    vi.useFakeTimers({ now: START, toFake: ['Date'] });
    try {
      const { relay } = relayWith([]);
      vi.setSystemTime(START + 3 * 60_000 + 31_000);
      expect(() =>
        new (RelayHealthController as new () => { getRelays(): unknown })().getRelays(),
      ).toThrow();
      expect(relayHealthReport().status).toBe('degraded');
      await relay.onApplicationShutdown();
    } finally {
      vi.useRealTimers();
    }
  });
});
