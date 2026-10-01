import { AuditModule } from '@gigalibs/audit-nest';
import { AuthModule, JwtAuthGuard } from '@gigalibs/auth-nest';
import type { ModuleManifest } from '@gigalibs/module-registry';
import { ModuleRegistryModule } from '@gigalibs/module-registry-nest';
import { PlatformSettingsModule } from '@gigalibs/platform-settings-nest';
import { RbacGuard, RbacModule } from '@gigalibs/rbac-nest';
import { TenancyModule } from '@gigalibs/tenancy-nest';
import { TenantBoundaryGuard } from '@gigalibs/tenancy-nest';
import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { PlatformController } from './platform.controller.js';
import { TenantDataExportController } from './tenant-data-export.controller.js';
import { KernelSchedulesController } from './kernel-schedules.controller.js';
import { KernelSchedulesService } from './kernel-schedules.service.js';
import { KernelPackApplicationsService } from './kernel-pack-applications.service.js';
import { TenantDataExportService } from './tenant-data-export.service.js';
import { TenantDataExportWorker } from './tenant-data-export.worker.js';
import { TenantExportSnapshotService } from './tenant-export-snapshot.service.js';
import { OutboxRelayProcessor } from './outbox-relay.processor.js';

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
    description:
      'Password and tenant OIDC authentication, enforced TOTP, controlled key rollover, and rotating refresh-token sessions.',
    capabilities: [
      'register',
      'login',
      'refresh-token-rotation',
      'logout',
      'totp-enrollment',
      'tenant-mfa-enforcement',
      'versioned-control-key-rollover',
      'two-person-mfa-assisted-recovery',
      'oidc-authorization-code-pkce',
      'oidc-identity-mapping',
      'oidc-jit-provisioning',
    ],
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
    capabilities: [
      'tenant-create',
      'tenant-list',
      'tenant-status',
      'membership-list',
      'membership-invite',
      'membership-accept',
      'membership-role-status-update',
      'custom-role-crud',
      'custom-role-assignment',
      'dns-domain-verification',
      'signed-tenant-data-export',
      'expiring-export-download',
    ],
    requires: { 'gigalibs.kernel': '^0.1.0', 'gigalibs.auth': '^0.1.0' },
    optional: {},
    permissions: [
      'tenant:read',
      'tenant:update',
      'users:read',
      'users:update',
      'roles:read',
      'roles:create',
      'roles:update',
      'roles:delete',
      'invites:read',
      'invites:create',
      'invites:delete',
      'tenant:export',
      'organization:read',
      'organization:draft',
      'organization:approve',
      'organization:activate',
      'organization:grant',
    ],
    eventsProduced: [
      'tenant.provisioning-requested.v1',
      'organization.unit-type.changed.v1',
      'organization.unit.changed.v1',
      'organization.hierarchy.activated.v1',
      'organization.scope-grant.changed.v1',
    ],
    eventsConsumed: [],
    configurationNamespace: 'tenancy',
    healthChecks: ['database'],
  },
  {
    id: 'gigalibs.platform-settings',
    name: 'Tenant Platform Settings',
    version: '0.1.0',
    description: 'Versioned tenant branding, security, localization, and feature configuration.',
    capabilities: ['settings-read', 'settings-update', 'optimistic-concurrency', 'mfa-policy'],
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
import { ConfigurationInvalidationConsumer } from './configuration-invalidation.consumer.js';
import {
  CONFIGURATION_ADAPTERS,
  ConfigurationAdapterRegistry,
  defaultConfigurationAdapters,
} from './configuration-adapter.registry.js';
import { ConfigurationManifestCache } from './configuration-manifest.cache.js';
import { ConfigurationOutboxPublisher } from './configuration-outbox.publisher.js';
import { ConfigurationRuntimeMetrics } from './configuration-runtime.metrics.js';
import { ConfigurationRuntimeScopeResolver } from './configuration-runtime-scope.resolver.js';
import { ConfigurationStudioController } from './configuration-studio.controller.js';
import { DemoLabController } from './demo-lab.controller.js';
import { DemoLabService } from './demo-lab.service.js';
import { ConfigurationStudioService } from './configuration-studio.service.js';
import { ConnectorCredentialService } from './connector-credential.service.js';
import { ConnectorProfileService } from './connector-profile.service.js';
import { ControlOutboxWorker } from './control-outbox.worker.js';
import { DataRetentionWorker } from './data-retention.worker.js';
import { DatabaseAvailabilityFilter } from './database-availability.filter.js';
import { ExceptionController } from './exception.controller.js';
import { ExceptionService } from './exception.service.js';
import { ExecutionEventSignatureGuard } from './execution-event-signature.guard.js';
import { ExecutionEventsController } from './execution-events.controller.js';
import { ExecutionEventsService } from './execution-events.service.js';
import { GovernorPersistentThrottlingGuard } from './governor-persistent.guard.js';
import { GovernorPersistentService } from './governor-persistent.service.js';
import { GovernorController } from './governor.controller.js';
import { GovernorThrottlingGuard } from './governor.guard.js';
import { GovernorService } from './governor.service.js';
import { JsonSchemaService } from './json-schema.service.js';
import { MetricsTokenGuard } from './metrics-token.guard.js';
import { MetricsService } from './metrics.service.js';
import { ObjectStorageService } from './object-storage.service.js';
import { OperationalIntelligenceController } from './operational-intelligence.controller.js';
import { OperationalIntelligenceService } from './operational-intelligence.service.js';
import { PayloadCryptoService } from './payload-crypto.service.js';
import { RetentionService } from './retention.service.js';
import { ScimController } from './scim.controller.js';
import { ScimService } from './scim.service.js';
import { SourceFileCleanupWorker } from './source-file-cleanup.worker.js';
import { SourcePayloadParserService } from './source-payload-parser.service.js';
import { ValueLedgerController } from './value-ledger.controller.js';
import { ValueLedgerService } from './value-ledger.service.js';
import { TransactionalInboxService } from './transactional-inbox.service.js';
import { TenantWorkloadAdmissionService } from './tenant-workload-admission.service.js';
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
    TenantDataExportController,
    KernelSchedulesController,
    ConfigurationStudioController,
    DemoLabController,
    GovernorController,
    ScimController,
  ],
  providers: [
    { provide: APP_FILTER, useClass: DatabaseAvailabilityFilter },
    WorkflowService,
    ExecutionEventsService,
    ExecutionEventSignatureGuard,
    ConnectorCredentialService,
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
    TenantDataExportService,
    KernelSchedulesService,
    KernelPackApplicationsService,
    TenantExportSnapshotService,
    TenantDataExportWorker,
    OutboxRelayProcessor,
    ConfigurationManifestCache,
    { provide: CONFIGURATION_ADAPTERS, useFactory: defaultConfigurationAdapters },
    ConfigurationAdapterRegistry,
    ConfigurationRuntimeScopeResolver,
    ConfigurationRuntimeMetrics,
    TransactionalInboxService,
    TenantWorkloadAdmissionService,
    ConfigurationInvalidationConsumer,
    ConfigurationOutboxPublisher,
    ConfigurationStudioService,
    DemoLabService,
    GovernorService,
    GovernorThrottlingGuard,
    GovernorPersistentService,
    GovernorPersistentThrottlingGuard,
    ScimService,
    { provide: APP_GUARD, useExisting: JwtAuthGuard },
    { provide: APP_GUARD, useExisting: TenantBoundaryGuard },
    { provide: APP_GUARD, useExisting: RbacGuard },
  ],
})
export class AppModule {}
