/**
 * WI-OI-105b (ADR-0007, ADR-0016 F15): place facts reach Analytics' place directory through the module SDK's outbox
 * relay. It leases SpatialNodeChangedV1 facts (the lowest pending version per place first), signs one relay token per
 * message with Geospatial's own key for the Analytics inbox, delivers, and settles each row. The outbox stays
 * authoritative; Analytics applies a place only when its version is not older than what it holds.
 */

import {
  type OutboxRetentionConfig,
  OutboxRelay,
  OutboxRetentionSweeper,
  type RelayConfig,
  loadOutboxRetentionConfig,
  loadRelayConfig,
} from '@gigalibs/module-sdk';
import { Inject, Injectable } from '@nestjs/common';
import { GeospatialDatabaseService, type GeospatialDefinerFunction } from '../database/database.service.js';

export const ANALYTICS_INBOX_AUDIENCE = 'gigalibs-analytics-inbox';
export const GEOSPATIAL_RELAY_SOURCE = 'geospatial';
export const GEOSPATIAL_RELAY_CONFIG = Symbol('GEOSPATIAL_RELAY_CONFIG');
export const GEOSPATIAL_RETENTION_CONFIG = Symbol('GEOSPATIAL_RETENTION_CONFIG');

export function loadGeospatialRelayConfig(environment: NodeJS.ProcessEnv = process.env): RelayConfig {
  return loadRelayConfig(environment, {
    // WI-OI-105e: Geospatial's inbox takes places pulled by Connector Hub, signed with the Hub's key for it.
    inboxPublicKey: 'GEOSPATIAL_HUB_INBOX_RELAY_PUBLIC_KEY_BASE64',
    targetUrl: 'GEOSPATIAL_RELAY_ANALYTICS_URL',
    signingKey: 'ANALYTICS_GEOSPATIAL_INBOX_RELAY_PRIVATE_KEY_BASE64',
    interval: 'GEOSPATIAL_RELAY_INTERVAL_MS',
    peerService: 'analytics-api',
  });
}

@Injectable()
export class AnalyticsPlaceRelay extends OutboxRelay<GeospatialDefinerFunction> {
  constructor(@Inject(GeospatialDatabaseService) database: GeospatialDatabaseService, @Inject(GEOSPATIAL_RELAY_CONFIG) config: RelayConfig) {
    super(database, config, {
      leaseFunction: 'relay_lease_analytics_places',
      settleFunction: 'relay_settle_analytics_place',
      audience: ANALYTICS_INBOX_AUDIENCE,
      source: GEOSPATIAL_RELAY_SOURCE,
      notConfiguredMessage: 'The relay to Analytics is not configured; place facts stay in the outbox.',
    });
  }
}

/** Deletes delivered and unrouted facts after GEOSPATIAL_OUTBOX_RETENTION_DAYS (default 30). */
@Injectable()
export class GeospatialOutboxRetention extends OutboxRetentionSweeper {
  constructor(@Inject(GeospatialDatabaseService) database: GeospatialDatabaseService, @Inject(GEOSPATIAL_RETENTION_CONFIG) config: OutboxRetentionConfig) {
    super(database, config);
  }
}

/** Registered in GeospatialModule, so the relay shares its single database pool. */
export const GEOSPATIAL_RELAY_PROVIDERS = [
  { provide: GEOSPATIAL_RELAY_CONFIG, useFactory: () => loadGeospatialRelayConfig() },
  { provide: GEOSPATIAL_RETENTION_CONFIG, useFactory: () => loadOutboxRetentionConfig(process.env, 'GEOSPATIAL') },
  AnalyticsPlaceRelay,
  GeospatialOutboxRetention,
];
