-- WI-OI-133: bounded five-reading checkpoint history for mobile offline context.
BEGIN;
CREATE INDEX reading_checkpoint_recent
  ON gigalibs_operator_rounds.readings (tenant_id,checkpoint_id,captured_at DESC,id DESC);
INSERT INTO gigalibs_operator_rounds.schema_migrations(version,name)
VALUES(8,'000008_round_history_index');
COMMIT;
