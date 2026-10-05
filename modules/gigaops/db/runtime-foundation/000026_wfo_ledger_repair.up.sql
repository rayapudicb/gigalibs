-- WI-OI-120a (2026-10-05): ledger repair for the WI-WFO migrations.
--
-- 000020-000025 create their objects but never record themselves in schema_migrations, so the module
-- runner stops with "migration ledger is 19; expected exactly 25" (WI-OI-119 S-03). Those files have
-- already run on the local UAT instance and are not edited; this forward migration records them and itself.
--
-- Fresh install: 000020-000025 run first, then this file completes the ledger at 26.
-- A database where 000020-000025 already ran without ledger rows (the local UAT instance, 2026-10-04 07:06Z)
-- must have rows 20-25 recorded once, after verifying their objects exist, before the runner reaches this file.
BEGIN;

INSERT INTO gigalibs_workforce.schema_migrations (version, name)
VALUES
  (20, '000020_wfo_worker_registry'),
  (21, '000021_wfo_engagements'),
  (22, '000022_wfo_staffing'),
  (23, '000023_wfo_expenses'),
  (24, '000024_wfo_forecasting'),
  (25, '000025_wfo_comms_vendors'),
  (26, '000026_wfo_ledger_repair')
ON CONFLICT (version) DO NOTHING;

COMMIT;
