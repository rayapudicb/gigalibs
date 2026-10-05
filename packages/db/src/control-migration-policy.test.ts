import { describe, expect, it } from 'vitest';
// The production migration policy is plain ESM because the distroless image executes it directly.
// @ts-expect-error The runtime-only module intentionally has no TypeScript declaration output.
import { RETIRED_CROSS_MODULE_MIGRATIONS, retiredMigrationAction } from '../../db-migrations-runtime/control-migration-policy.mjs';

const migration = RETIRED_CROSS_MODULE_MIGRATIONS[0];

describe('control migration retirement policy', () => {
  it('records a missing retired migration without executing its cross-module DDL', () => {
    expect(retiredMigrationAction(migration)).toBe('RECORD_AS_APPLIED');
  });

  it('leaves a successfully applied historical migration unchanged', () => {
    expect(retiredMigrationAction(migration, { finished_at: new Date(), rolled_back_at: null })).toBe(
      'ALREADY_APPLIED',
    );
  });

  it('allows a previously rolled-back migration to be recorded as retired', () => {
    expect(retiredMigrationAction(migration, { finished_at: null, rolled_back_at: new Date() })).toBe(
      'RECORD_AS_APPLIED',
    );
  });

  it('fails closed for unresolved failed history', () => {
    expect(() => retiredMigrationAction(migration, { finished_at: null, rolled_back_at: null })).toThrow(
      'unresolved failed history',
    );
  });

  it('refuses to retire a migration outside the exact allowlist', () => {
    expect(() => retiredMigrationAction('unreviewed_migration')).toThrow(
      'not in the retired cross-module allowlist',
    );
  });
});
