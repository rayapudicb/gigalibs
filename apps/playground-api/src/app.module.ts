import { AuditModule } from '@gigalibs/audit-nest';
import { AuthModule, JwtAuthGuard } from '@gigalibs/auth-nest';
import type { ModuleManifest } from '@gigalibs/module-registry';
import { ModuleRegistryModule } from '@gigalibs/module-registry-nest';
import { PlatformSettingsModule } from '@gigalibs/platform-settings-nest';
import { RbacGuard, RbacModule } from '@gigalibs/rbac-nest';
import { TenancyModule } from '@gigalibs/tenancy-nest';
import { TenantBoundaryGuard } from '@gigalibs/tenancy-nest';
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PlatformController } from './platform.controller.js';

const manifests: ModuleManifest[] = [
  {
    id: 'gigalibs.kernel',
    name: 'GigaLibs Platform Kernel',
    version: '0.1.0',
    description: 'Runtime, validation, persistence, audit, and module registry foundation.',
    capabilities: ['module-registry', 'validation', 'health', 'audit'],
    requires: {},
    optional: {},
    permissions: [],
    eventsProduced: [],
    eventsConsumed: [],
    healthChecks: ['database'],
  },
  {
    id: 'gigalibs.auth',
    name: 'Authentication',
    version: '0.1.0',
    description: 'Password authentication and rotating refresh-token sessions.',
    capabilities: ['register', 'login', 'refresh-token-rotation', 'logout'],
    requires: { 'gigalibs.kernel': '^0.1.0' },
    optional: {},
    permissions: [],
    eventsProduced: [],
    eventsConsumed: [],
    healthChecks: ['database'],
  },
  {
    id: 'gigalibs.tenancy',
    name: 'Tenancy Control Plane',
    version: '0.1.0',
    description: 'Tenant lifecycle, membership, provisioning state, and tenant context.',
    capabilities: ['tenant-create', 'tenant-list', 'tenant-status', 'membership'],
    requires: { 'gigalibs.kernel': '^0.1.0', 'gigalibs.auth': '^0.1.0' },
    optional: {},
    permissions: ['tenant:read', 'tenant:update'],
    eventsProduced: ['tenant.provisioning-requested.v1'],
    eventsConsumed: [],
    configurationNamespace: 'tenancy',
    healthChecks: ['database'],
  },
  {
    id: 'gigalibs.platform-settings',
    name: 'Tenant Platform Settings',
    version: '0.1.0',
    description: 'Versioned tenant branding, security, localization, and feature configuration.',
    capabilities: ['settings-read', 'settings-update', 'optimistic-concurrency'],
    requires: { 'gigalibs.kernel': '^0.1.0', 'gigalibs.tenancy': '^0.1.0' },
    optional: {},
    permissions: ['settings:read', 'settings:update'],
    eventsProduced: ['tenant.settings-updated.v1'],
    eventsConsumed: ['tenant.provisioning-requested.v1'],
    configurationNamespace: 'platform',
    healthChecks: ['database'],
  },
];

import { ApActionService } from './ap-action.service.js';
import { ApIngestionService } from './ap-ingestion.service.js';
import { ApMatchingService } from './ap-matching.service.js';
import { ApPolicyService } from './ap-policy.service.js';
import { ApController } from './ap.controller.js';
import { AuthorizationController } from './authorization.controller.js';
import { ConnectorHttpClient } from './connector-http.client.js';
import { ConnectorCredentialService } from './connector-credential.service.js';
import { ConnectorPostgresClient } from './connector-postgres.client.js';
import { ConnectorProfileService } from './connector-profile.service.js';
import { ControlOutboxWorker } from './control-outbox.worker.js';
import { DataRetentionWorker } from './data-retention.worker.js';
import { ExceptionController } from './exception.controller.js';
import { ExceptionService } from './exception.service.js';
import { ExecutionEventSignatureGuard } from './execution-event-signature.guard.js';
import { ExecutionEventsController } from './execution-events.controller.js';
import { ExecutionEventsService } from './execution-events.service.js';
import { JsonSchemaService } from './json-schema.service.js';
import { MetricsService } from './metrics.service.js';
import { MetricsTokenGuard } from './metrics-token.guard.js';
import { OperationalIntelligenceController } from './operational-intelligence.controller.js';
import { OperationalIntelligenceService } from './operational-intelligence.service.js';
import { ObjectStorageService } from './object-storage.service.js';
import { PayloadCryptoService } from './payload-crypto.service.js';
import { RetentionService } from './retention.service.js';
import { SourcePayloadParserService } from './source-payload-parser.service.js';
import { SourceFileCleanupWorker } from './source-file-cleanup.worker.js';
import { ValueLedgerController } from './value-ledger.controller.js';
import { ValueLedgerService } from './value-ledger.service.js';
import { WorkflowController } from './workflow.controller.js';
import { WorkflowService } from './workflow.service.js';

@Module({
  imports: [
    AuthModule.forRoot({ globalGuard: false }),
    RbacModule.forRoot({ globalGuard: false }),
    TenancyModule.forRoot(),
    AuditModule.forRoot(),
    PlatformSettingsModule,
    ModuleRegistryModule.forRoot({ manifests }),
  ],
  controllers: [
    PlatformController,
    AuthorizationController,
    ExecutionEventsController,
    OperationalIntelligenceController,
    ApController,
    ExceptionController,
    ValueLedgerController,
    WorkflowController,
  ],
  providers: [
    WorkflowService,
    ExecutionEventsService,
    ExecutionEventSignatureGuard,
    ConnectorHttpClient,
    ConnectorCredentialService,
    ConnectorPostgresClient,
    ConnectorProfileService,
    JsonSchemaService,
    MetricsService,
    MetricsTokenGuard,
    OperationalIntelligenceService,
    PayloadCryptoService,
    ObjectStorageService,
    SourcePayloadParserService,
    SourceFileCleanupWorker,
    DataRetentionWorker,
    RetentionService,
    ApPolicyService,
    ApMatchingService,
    ApIngestionService,
    ApActionService,
    ExceptionService,
    ValueLedgerService,
    ControlOutboxWorker,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: TenantBoundaryGuard },
    { provide: APP_GUARD, useClass: RbacGuard },
  ],
})
export class AppModule {}
