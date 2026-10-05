-- Fresh-install forward repair for the immutable
-- 20260924000000_tp2_durable_export_and_outbox migration.
--
-- PostgreSQL requires a newly added enum value to commit before a later
-- transaction can use it in a constraint. Keeping this statement in its own
-- migration provides that commit boundary. IF NOT EXISTS makes the repair a
-- no-op on databases where the historical migration is already applied.
ALTER TYPE "TenantDataExportStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
