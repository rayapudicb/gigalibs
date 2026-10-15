/**
 * WI-OI-104e: pulled records reach Analytics through ADR-0007's outbox relay (the module SDK). Connections that send
 * to Analytics write a CONNECTOR_RECORD_PULLED_V1 fact per new record; this relay leases them (the oldest pending per
 * record first), signs one relay token per message with the Analytics inbox key, delivers, and settles each row
 * (published, retry with back-off, or dead letter). The outbox stays authoritative; the Analytics inbox deduplicates.
 * WI-OI-105e: a second relay delivers CONNECTOR_PLACE_PULLED_V1 facts to the Geospatial inbox with its own key.
 */

import {
  type OutboxRetentionConfig,
  OutboxRelay,
  OutboxRetentionSweeper,
  type RelayConfig,
  loadOutboxRetentionConfig,
  loadRelayConfig,
  createRelayHealthController,
} from '@gigalibs/module-sdk';
import { Inject, Injectable, Module } from '@nestjs/common';
import { DatabaseService, type HubDefinerFunction } from '../database/database.service.js';

export const ANALYTICS_INBOX_AUDIENCE = 'gigalibs-analytics-inbox';
export const HUB_RELAY_SOURCE = 'connector-hub';
export const GEOSPATIAL_INBOX_AUDIENCE = 'gigalibs-geospatial-inbox';
export const HUB_RELAY_CONFIG = Symbol('HUB_RELAY_CONFIG');
export const HUB_GEOSPATIAL_RELAY_CONFIG = Symbol('HUB_GEOSPATIAL_RELAY_CONFIG');
export const HUB_RETENTION_CONFIG = Symbol('HUB_RETENTION_CONFIG');

export function loadHubRelayConfig(environment: NodeJS.ProcessEnv = process.env): RelayConfig {
  return loadRelayConfig(environment, {
    // Connector Hub has no inbox of its own.
    inboxPublicKey: 'CONNECTOR_HUB_INBOX_RELAY_PUBLIC_KEY_BASE64',
    targetUrl: 'CONNECTOR_HUB_RELAY_ANALYTICS_URL',
    signingKey: 'ANALYTICS_INBOX_RELAY_PRIVATE_KEY_BASE64',
    interval: 'CONNECTOR_HUB_RELAY_INTERVAL_MS',
    peerService: 'analytics-api',
  });
}

export function loadHubGeospatialRelayConfig(environment: NodeJS.ProcessEnv = process.env): RelayConfig {
  return loadRelayConfig(environment, {
    inboxPublicKey: 'CONNECTOR_HUB_INBOX_RELAY_PUBLIC_KEY_BASE64',
    targetUrl: 'CONNECTOR_HUB_RELAY_GEOSPATIAL_URL',
    signingKey: 'GEOSPATIAL_HUB_INBOX_RELAY_PRIVATE_KEY_BASE64',
    interval: 'CONNECTOR_HUB_RELAY_INTERVAL_MS',
    peerService: 'geospatial-api',
  });
}

@Injectable()
export class GeospatialPlaceRelay extends OutboxRelay<HubDefinerFunction> {
  constructor(database: DatabaseService, @Inject(HUB_GEOSPATIAL_RELAY_CONFIG) config: RelayConfig) {
    super(database, config, {
      leaseFunction: 'relay_lease_geospatial_places',
      settleFunction: 'relay_settle_geospatial_place',
      audience: GEOSPATIAL_INBOX_AUDIENCE,
      source: HUB_RELAY_SOURCE,
      notConfiguredMessage: 'The relay to Geospatial is not configured; pulled places stay in the outbox.',
    });
  }
}

@Injectable()
export class AnalyticsOutboxRelay extends OutboxRelay<HubDefinerFunction> {
  constructor(database: DatabaseService, @Inject(HUB_RELAY_CONFIG) config: RelayConfig) {
    super(database, config, {
      leaseFunction: 'relay_lease_analytics_records',
      settleFunction: 'relay_settle_analytics_record',
      audience: ANALYTICS_INBOX_AUDIENCE,
      source: HUB_RELAY_SOURCE,
      notConfiguredMessage: 'The relay to Analytics is not configured; pulled records stay in the outbox.',
    });
  }
}

/** Deletes delivered facts after CONNECTOR_HUB_OUTBOX_RETENTION_DAYS (default 30); pending and dead letters stay. */
@Injectable()
export class HubOutboxRetention extends OutboxRetentionSweeper {
  constructor(database: DatabaseService, @Inject(HUB_RETENTION_CONFIG) config: OutboxRetentionConfig) {
    super(database, config);
  }
}

@Module({
  // WI-OI-120as: GET api/connectors/v1/health/relays, beside the hub's own health routes.
  controllers: [createRelayHealthController('api/connectors/v1/health')],
  providers: [
    { provide: HUB_RELAY_CONFIG, useFactory: () => loadHubRelayConfig() },
    { provide: HUB_GEOSPATIAL_RELAY_CONFIG, useFactory: () => loadHubGeospatialRelayConfig() },
    { provide: HUB_RETENTION_CONFIG, useFactory: () => loadOutboxRetentionConfig(process.env, 'CONNECTOR_HUB') },
    AnalyticsOutboxRelay,
    GeospatialPlaceRelay,
    HubOutboxRetention,
  ],
})
export class RelayModule {}
