import { OutboxRelay,loadRelayConfig } from '@gigalibs/module-sdk';
import { Injectable } from '@nestjs/common';
import { DatabaseService } from './database.service.js';

export function loadRoundsAnalyticsRelayConfig(environment:NodeJS.ProcessEnv=process.env) {
  return loadRelayConfig(environment,{
    inboxPublicKey:'OPERATOR_ROUNDS_UNUSED_ANALYTICS_KEY_BASE64',
    targetUrl:'OPERATOR_ROUNDS_RELAY_ANALYTICS_URL',
    signingKey:'OPERATOR_ROUNDS_ANALYTICS_INBOX_RELAY_PRIVATE_KEY_BASE64',
    interval:'OPERATOR_ROUNDS_ANALYTICS_RELAY_INTERVAL_MS',peerService:'analytics-api',
  });
}

@Injectable()
export class AnalyticsReadingRelay extends OutboxRelay<'relay_lease_analytics_events'|'relay_settle_analytics_event'> {
  constructor(database:DatabaseService) {
    super(database,loadRoundsAnalyticsRelayConfig(),{
      leaseFunction:'relay_lease_analytics_events',settleFunction:'relay_settle_analytics_event',
      audience:'gigalibs-analytics-inbox',source:'operator-rounds',
      notConfiguredMessage:'Analytics reading relay is not configured; facts remain in the outbox.',
    });
  }
}
