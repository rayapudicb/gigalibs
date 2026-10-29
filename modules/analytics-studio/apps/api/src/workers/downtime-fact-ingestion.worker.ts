/**
 * WI-OI-130: consumes cmms.downtime.v1 outbox facts and projects availability measures.
 * Wire to the platform broker consumer in deployment profile (same pattern as connector relays).
 */
export const DOWNTIME_FACT_TOPICS = ['cmms.downtime.v1'] as const;

export function projectDowntimeFact(payload: {
  readonly assetId: string;
  readonly downtimeId: string;
  readonly startedAt?: string;
  readonly endedAt?: string;
}): Record<string, unknown> {
  return {
    asset_id: payload.assetId,
    downtime_id: payload.downtimeId,
    started_at: payload.startedAt ?? null,
    ended_at: payload.endedAt ?? null,
    source: 'cmms_downtime_relay',
  };
}
