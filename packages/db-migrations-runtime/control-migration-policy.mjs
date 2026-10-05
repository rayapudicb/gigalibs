export const RETIRED_CROSS_MODULE_MIGRATIONS = Object.freeze([
  '20260927110000_phase3_thingsboard_telemetry',
  '20260927120000_phase4_workforce_eptw_handover',
  '20260927130000_phase5_cmms_workforce_ledger_settlement',
]);

export function retiredMigrationAction(migrationName, row) {
  if (!RETIRED_CROSS_MODULE_MIGRATIONS.includes(migrationName)) {
    throw new Error(`Migration ${migrationName} is not in the retired cross-module allowlist.`);
  }
  if (row?.finished_at && !row.rolled_back_at) return 'ALREADY_APPLIED';
  if (row && !row.rolled_back_at) {
    throw new Error(
      `Migration ${migrationName} has unresolved failed history. Refusing to mark it applied; recover it explicitly first.`,
    );
  }
  return 'RECORD_AS_APPLIED';
}
