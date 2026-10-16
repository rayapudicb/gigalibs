import { Controller, Get, ServiceUnavailableException, type Type } from '@nestjs/common';

/**
 * WI-OI-120as (owner, 2026-10-15): a relay with nothing routed to it logs nothing, so "running and idle" could not be
 * told from "not running". Each relay reports its own passes here, and `GET v1/health/relays` shows them all; it
 * answers 503 when a configured relay has made no progress for three intervals, or (WI-OI-120bd) has failed three
 * passes in a row, so monitoring (O3) can alert.
 */
export type RelayState = 'not-configured' | 'starting' | 'running' | 'stalled' | 'failing';

export interface RelayHealth {
  /** `<source> -> <audience>`. */
  readonly relay: string;
  readonly state: RelayState;
  readonly intervalMs: number | null;
  /** When the last pass finished, whether or not it found anything to deliver. */
  readonly lastPassAt: string | null;
  /** Facts the last pass leased (0 means nothing routed was pending). */
  readonly lastPassLeased: number;
  readonly lastDeliveredAt: string | null;
  readonly deliveredSinceStart: number;
  readonly lastFailureAt: string | null;
  readonly lastFailureCode: string | null;
  /** WI-OI-120bd: passes in a row that leased facts but delivered none (idle passes do not count; a delivery resets). */
  readonly consecutiveFailedPasses: number;
}

/** What a relay knows about itself; the state is worked out from it when the report is read. */
export interface RelayHealthSnapshot extends Omit<RelayHealth, 'state'> {
  readonly configured: boolean;
  readonly startedAt: number;
  /** When the pass now running started (epoch ms), or null between passes. */
  readonly passStartedAt: number | null;
  /** When the running pass last settled a fact (epoch ms), or null. */
  readonly lastProgressAt: number | null;
}

/** A configured relay is stalled when it made no progress within this many intervals (and the first grace period). */
const STALLED_AFTER_INTERVALS = 3;
const START_GRACE_MS = 30_000;
/** WI-OI-120bd: a relay is failing after this many passes in a row that leased facts but delivered none. */
export const FAILING_AFTER_PASSES = 3;

const relays = new Map<string, () => RelayHealthSnapshot>();

/** Called by each relay on start-up; the latest registration for a name wins (one per process). */
export function registerRelayHealth(name: string, read: () => RelayHealthSnapshot): void {
  relays.set(name, read);
}

export function relayState(snapshot: RelayHealthSnapshot, now: number): RelayState {
  if (!snapshot.configured || snapshot.intervalMs === null) return 'not-configured';
  if (snapshot.consecutiveFailedPasses >= FAILING_AFTER_PASSES) return 'failing';
  const limit = STALLED_AFTER_INTERVALS * snapshot.intervalMs + START_GRACE_MS;
  // WI-OI-120bd: a slow pass that keeps settling facts is progress, not a stall; only time without progress counts.
  const progress = Math.max(
    snapshot.lastPassAt === null ? 0 : Date.parse(snapshot.lastPassAt),
    snapshot.passStartedAt ?? 0,
    snapshot.lastProgressAt ?? 0,
  );
  if (progress === 0) return now - snapshot.startedAt > limit ? 'stalled' : 'starting';
  return now - progress > limit ? 'stalled' : 'running';
}

export function relayHealthReport(now = Date.now()): {
  status: 'ok' | 'degraded';
  relays: RelayHealth[];
  checkedAt: string;
} {
  const report = [...relays.values()].map((read) => {
    const raw = read();
    const {
      configured: _configured,
      startedAt: _startedAt,
      passStartedAt: _passStartedAt,
      lastProgressAt: _lastProgressAt,
      ...snapshot
    } = raw;
    return { ...snapshot, state: relayState(raw, now) };
  });
  return {
    status: report.some((relay) => relay.state === 'stalled' || relay.state === 'failing') ? 'degraded' : 'ok',
    relays: report.sort((left, right) => left.relay.localeCompare(right.relay)),
    checkedAt: new Date(now).toISOString(),
  };
}

/** Test support: forget every registration. */
export function resetRelayHealth(): void {
  relays.clear();
}

/**
 * Mounted by each module API that runs a relay, beside its own health routes. Carries no tenant data: names, times and
 * counts only.
 */
export function createRelayHealthController(basePath = 'v1/health'): Type<unknown> {
  @Controller(basePath)
  class ModuleRelayHealthController {
    @Get('relays')
    getRelays() {
      const report = relayHealthReport();
      if (report.status !== 'ok') throw new ServiceUnavailableException(report);
      return report;
    }
  }
  return ModuleRelayHealthController;
}

/** `GET v1/health/relays`, for module APIs whose health lives at `v1/health`. */
export const RelayHealthController = createRelayHealthController();
