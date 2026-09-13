BEGIN;

ALTER TABLE gigalibs_ar.invoices
  ADD COLUMN IF NOT EXISTS seal_hash VARCHAR(64) NULL,
  ADD COLUMN IF NOT EXISTS previous_seal_hash VARCHAR(64) NULL,
  ADD COLUMN IF NOT EXISTS seal_sequence BIGINT NULL,
  ADD COLUMN IF NOT EXISTS applied_taxes JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS installments JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS discount_minor BIGINT NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS invoices_tenant_seal_sequence_idx
  ON gigalibs_ar.invoices (tenant_id, seal_sequence)
  WHERE seal_sequence IS NOT NULL;

INSERT INTO gigalibs_ar.schema_migrations (version, name)
VALUES (3, '000003_ar_ledger_seals_and_installments')
ON CONFLICT (version) DO NOTHING;

COMMIT;
