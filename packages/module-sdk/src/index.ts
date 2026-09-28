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
