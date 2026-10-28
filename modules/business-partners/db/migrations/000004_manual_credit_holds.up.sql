-- WI-OI-123 S5: manual credit holds carry no invented exposure snapshot.
-- A later complete source-watermark decision may create an EXPOSURE hold with proven amounts.
BEGIN;

ALTER TABLE gigalibs_business_partners.credit_holds
  ADD COLUMN origin varchar(16) NOT NULL DEFAULT 'EXPOSURE'
    CHECK (origin IN ('MANUAL', 'EXPOSURE'));
ALTER TABLE gigalibs_business_partners.credit_holds
  ALTER COLUMN exposure_minor DROP NOT NULL,
  ALTER COLUMN credit_limit_minor DROP NOT NULL;
ALTER TABLE gigalibs_business_partners.credit_holds
  ADD CONSTRAINT credit_holds_snapshot_by_origin CHECK (
    (origin = 'MANUAL' AND exposure_minor IS NULL AND credit_limit_minor IS NULL)
    OR (origin = 'EXPOSURE' AND exposure_minor IS NOT NULL AND credit_limit_minor IS NOT NULL)
  );

INSERT INTO gigalibs_business_partners.schema_migrations (version, name)
VALUES (4, '000004_manual_credit_holds');
COMMIT;
