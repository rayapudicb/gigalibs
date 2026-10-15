import { Controller, Get, ServiceUnavailableException, type Type } from '@nestjs/common';

/**
 * WI-OI-120as (owner, 2026-10-15): a relay with nothing routed to it logs nothing, so "running and idle" could not be
 * told from "not running". Each relay reports its own passes here, and `GET v1/health/relays` shows them all; it
 * answers 503 when a configured relay has not completed a pass for three intervals, so monitoring (O3) can alert.
 */
export type RelayState = 'not-configured' | 'starting' | 'running' | 'stalled';

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
}

/** What a relay knows about itself; the state is worked out from it when the report is read. */
export interface RelayHealthSnapshot extends Omit<RelayHealth, 'state'> {
  readonly configured: boolean;
  readonly startedAt: number;
}

/** A configured relay is stalled when no pass finished within this many intervals (and the first grace period). */
const STALLED_AFTER_INTERVALS = 3;
const START_GRACE_MS = 30_000;

const relays = new Map<string, () => RelayHealthSnapshot>();

/** Called by each relay on start-up; the latest registration for a name wins (one per process). */
export function registerRelayHealth(name: string, read: () => RelayHealthSnapshot): void {
  relays.set(name, read);
}

export function relayState(snapshot: RelayHealthSnapshot, now: number): RelayState {
  if (!snapshot.configured || snapshot.intervalMs === null) return 'not-configured';
  const limit = STALLED_AFTER_INTERVALS * snapshot.intervalMs + START_GRACE_MS;
  if (snapshot.lastPassAt === null)
    return now - snapshot.startedAt > limit ? 'stalled' : 'starting';
  return now - Date.parse(snapshot.lastPassAt) > limit ? 'stalled' : 'running';
}

export function relayHealthReport(now = Date.now()): {
  status: 'ok' | 'degraded';
  relays: RelayHealth[];
  checkedAt: string;
} {
  const report = [...relays.values()].map((read) => {
    const raw = read();
    const { configured: _configured, startedAt: _startedAt, ...snapshot } = raw;
    return { ...snapshot, state: relayState(raw, now) };
  });
  return {
    status: report.some((relay) => relay.state === 'stalled') ? 'degraded' : 'ok',
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
