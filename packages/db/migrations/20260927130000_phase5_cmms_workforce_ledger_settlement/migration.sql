-- Phase 5: CMMS Maintenance Convergence & Double-Entry Ledger Automated Cost Settlement
-- 1. Seed GAAP General Ledger Accounts for MRO Inventory and Direct Maintenance Labour
-- 2. Link CMMS Work Order Labour to Workforce Bookings and Ledger Journal Entries
-- 3. Link CMMS Stock Movements to Ledger Journal Entries
-- 4. Track Financial Settlement Status on CMMS Work Orders

BEGIN;

-- 1. General Ledger Chart of Accounts Seed (Public Schema)
INSERT INTO "general_ledger_accounts" ("id", "code", "name", "type", "currency", "createdAt", "updatedAt")
VALUES
  ('gl_1300_mro_inventory', '1300', 'Spare Parts & MRO Inventory', 'ASSET', 'USD', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('gl_2100_payroll_clearing', '2100', 'Accrued Payroll & Contractor Clearing', 'LIABILITY', 'USD', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('gl_5100_mro_expense', '5100', 'Maintenance Parts & Materials Expense', 'EXPENSE', 'USD', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('gl_5200_labour_expense', '5200', 'Direct Maintenance Labour Expense', 'EXPENSE', 'USD', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

-- 2. Work Order Labour -> Workforce Booking & Ledger Settlement Link
ALTER TABLE gigalibs_cmms.work_order_labour
  ADD COLUMN IF NOT EXISTS booking_id uuid NULL,
  ADD COLUMN IF NOT EXISTS settled_journal_entry_id text NULL;

CREATE INDEX IF NOT EXISTS work_order_labour_booking_idx
  ON gigalibs_cmms.work_order_labour (tenant_id, booking_id) WHERE booking_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS work_order_labour_settlement_idx
  ON gigalibs_cmms.work_order_labour (tenant_id, settled_journal_entry_id) WHERE settled_journal_entry_id IS NOT NULL;

-- 3. Stock Movements -> Ledger Settlement Link
ALTER TABLE gigalibs_cmms.stock_movements
  ADD COLUMN IF NOT EXISTS settled_journal_entry_id text NULL;

CREATE INDEX IF NOT EXISTS stock_movements_settlement_idx
  ON gigalibs_cmms.stock_movements (tenant_id, settled_journal_entry_id) WHERE settled_journal_entry_id IS NOT NULL;

-- 4. Work Orders -> Work Requirement & Financial Settlement Status
ALTER TABLE gigalibs_cmms.work_orders
  ADD COLUMN IF NOT EXISTS work_requirement_id uuid NULL,
  ADD COLUMN IF NOT EXISTS financial_settlement_status text NOT NULL DEFAULT 'UNSETTLED',
  ADD COLUMN IF NOT EXISTS settled_at timestamptz NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'work_orders_settlement_status_check'
  ) THEN
    ALTER TABLE gigalibs_cmms.work_orders
      ADD CONSTRAINT work_orders_settlement_status_check
      CHECK (financial_settlement_status IN ('UNSETTLED', 'PARTIALLY_SETTLED', 'FULLY_SETTLED'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS work_orders_work_requirement_idx
  ON gigalibs_cmms.work_orders (tenant_id, work_requirement_id) WHERE work_requirement_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS work_orders_settlement_status_idx
  ON gigalibs_cmms.work_orders (tenant_id, financial_settlement_status);

COMMIT;
