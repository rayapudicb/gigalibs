-- Phase 4: Payments & reconciliation helpers.
--
-- payment_records and void_records already exist from migration 004.
-- This migration adds:
--   1. A fast covering index on payment_records for the running-balance query
--      (tenant_id, invoice_id) → SUM(amount_minor)
--   2. A covering index on void_records for single-lookup "is this invoice voided?"
--   3. A stable DB function `gigalibs_ar.invoice_balance(tenant_id, invoice_id)`
--      returning (amount_paid_minor, is_voided) — callable from service queries
--      without a separate round-trip.
--
-- NOTE: the invoices table is immutable (trigger from migration 001).  All
-- settlement state is read-only from that table; it lives exclusively in
-- payment_records / void_records.

BEGIN;

-- ─── Covering index: payment sum per invoice ──────────────────────────────────
-- Enables index-only scan for the aggregate subquery in invoice list/get.
CREATE INDEX IF NOT EXISTS payment_records_balance_idx
  ON gigalibs_ar.payment_records (tenant_id, invoice_id)
  INCLUDE (amount_minor);

-- ─── Covering index: void lookup ─────────────────────────────────────────────
-- Unique per (tenant_id, invoice_id) already; this makes the IS NULL check fast.
-- (The UNIQUE constraint from migration 004 already implies an index; adding
--  a named one here makes it explicit and documentable.)
-- Nothing to add — the unique constraint's implicit index is sufficient.
-- We do add a partial index for the non-voided fast path.
CREATE INDEX IF NOT EXISTS void_records_invoice_lookup_idx
  ON gigalibs_ar.void_records (tenant_id, invoice_id);

-- ─── Stable balance function ──────────────────────────────────────────────────
-- Returns the paid amount and void flag for one invoice in a single SQL call.
-- Used by service code via SELECT * FROM gigalibs_ar.invoice_balance($1, $2).
CREATE OR REPLACE FUNCTION gigalibs_ar.invoice_balance(
  p_tenant_id  uuid,
  p_invoice_id uuid
)
RETURNS TABLE (
  amount_paid_minor bigint,
  is_voided         boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    COALESCE(
      (SELECT SUM(pr.amount_minor)
       FROM gigalibs_ar.payment_records pr
       WHERE pr.tenant_id = p_tenant_id AND pr.invoice_id = p_invoice_id),
      0
    )::bigint AS amount_paid_minor,
    EXISTS (
      SELECT 1 FROM gigalibs_ar.void_records vr
      WHERE vr.tenant_id = p_tenant_id AND vr.invoice_id = p_invoice_id
    ) AS is_voided
$$;

GRANT EXECUTE ON FUNCTION gigalibs_ar.invoice_balance(uuid, uuid)
  TO gigalibs_ar_api_runtime;

-- ─── Schema version ──────────────────────────────────────────────────────────
INSERT INTO gigalibs_ar.schema_migrations (version, name)
VALUES (8, '000008_ar_payments_phase4')
ON CONFLICT (version) DO NOTHING;

COMMIT;
