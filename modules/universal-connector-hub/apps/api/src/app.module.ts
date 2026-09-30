import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module.js';
import { ConnectorsModule } from './connectors/connectors.module.js';
import { WebhooksModule } from './webhooks/webhooks.module.js';
import { SyncModule } from './sync/sync.module.js';
import { HealthModule } from './health/health.module.js';
import { RelayModule } from './relay/analytics-relay.js';

@Module({
  imports: [
    DatabaseModule,
    ConnectorsModule,
    WebhooksModule,
    SyncModule,
    HealthModule,
    RelayModule,
  ],
})
export class AppModule {}
