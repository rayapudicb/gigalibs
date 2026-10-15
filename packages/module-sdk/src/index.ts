// @gigalibs/module-sdk (ADR-0013 core, WI-OI-082): plumbing every business module shares, extracted from the
// CMMS and Workforce copies. Modules keep thin @Injectable subclasses with their own injection tokens.
export {
  ModuleDatabase,
  type ModuleDatabaseOptions,
  type TenantBinding,
  type TenantTransaction,
} from './database.js';
export { receiveOnce, type InboxReceiptOptions, type ReceiptEnvelope } from './inbox-receipts.js';
export {
  deliver,
  OutboxRelay,
  type OutboxRelayOptions,
  type RelayDatabase,
  type RelayEnvelope,
} from './outbox-relay.js';
export {
  loadOutboxRetentionConfig,
  OutboxRetentionSweeper,
  type OutboxRetentionConfig,
  type RetentionDatabase,
} from './outbox-retention.js';
export {
  loadRelayConfig,
  relayOrigin,
  type RelayConfig,
  type RelayConfigNames,
} from './relay-config.js';
export {
  RelayInboxGuardBase,
  type RelayInboxGuardOptions,
  type RelayRequest,
} from './relay-inbox-guard.js';
// WI-OI-085a: the signed-context guard, command helpers and runtime configuration for new modules.
export {
  CommandContext,
  CurrentPrincipal,
  MODULE_PERMISSIONS_METADATA,
  RequirePermissions,
  SignedContextGuardBase,
  extractBearerToken,
  hasModulePermission,
  principalFromContext,
  type ModuleCommandContext,
  type ModuleDepartmentScope,
  type ModulePlaceScope,
  type ModulePrincipal,
  type SignedContextGuardOptions,
} from './signed-context.js';
export {
  moduleErrors,
  recordMutation,
  type ModuleErrors,
  type MutationRecordOptions,
  type Queryable,
  type SafeParser,
} from './module-command.js';
export {
  loadModuleListenerConfig,
  loadModuleRuntimeConfig,
  type ModuleListenerConfig,
  type ModuleRuntimeConfig,
  type ModuleRuntimeConfigOptions,
} from './module-runtime-config.js';
export {
  OrganizationReplica,
  OrganizationReplicaConflictError,
  organizationReplicaDdl,
  type ReplicaClient,
  type ReplicaHeader,
  type ReplicaResult,
  type ReplicaUnit,
} from './organization-replica.js';
export {
  assertOrganizationWrite,
  assertOwningUnit,
  organizationAccess,
  organizationReadCondition,
  OrganizationScopeRefusal,
  OrganizationVersionPendingError,
  type OrganizationAccess,
  type OrganizationClaim,
  type OwnershipPolicy,
} from './organization-access.js';
// WI-OI-120w (R2 slice 3): where a person may use a permission, decided per role assignment (ADR-0034).
export {
  scopeFor,
  type AssignmentCoverage,
  type ModuleAssignment,
  type PermissionScope,
  type ScopedPrincipal,
} from './assignment-scope.js';
// WI-OI-120f (F0.3, ADR-0033 D1): the record dispatcher behind every metadata window.
export {
  RecordDispatcher,
  RecordVersionConflict,
  type IdempotencyEntry,
  type IdempotencyStore,
  type LookupOption,
  type LookupResolver,
  type RecordAction,
  type RecordAdapter,
  type RecordCommandContext,
  type RecordFieldPolicy,
  type RecordListQuery,
  type RecordPage,
  type RecordRestMirror,
  type RecordRules,
  type RecordValues,
} from './record-dispatcher.js';
export {
  createRelayHealthController,
  RelayHealthController,
  type RelayHealth,
  type RelayHealthSnapshot,
  type RelayState,
  registerRelayHealth,
  relayHealthReport,
  relayState,
  resetRelayHealth,
} from './relay-health.js';
export {
  DEFAULT_IDEMPOTENCY_RETENTION_DAYS,
  ModuleIdempotencyStore,
  RECORD_IDEMPOTENCY_TABLE,
  loadIdempotencyRetentionDays,
} from './record-idempotency.js';
export { createRecordController, RECORD_DISPATCHER } from './record-controller.js';
