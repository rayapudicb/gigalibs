-- Migration 000002: Row Level Security, Migration Tracking, and Action Receipts for Spend Management
-- Schema: gigalibs_spend

BEGIN;

-- 1. Add action_receipt column to expenses for durable Action Gateway settlement tracing (SP-03)
ALTER TABLE gigalibs_spend.expenses
    ADD COLUMN IF NOT EXISTS action_receipt jsonb;

-- 2. Enable Row-Level Security on all tenant-scoped tables
ALTER TABLE gigalibs_spend.cost_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_spend.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_spend.expense_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_spend.travel_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_spend.imprest_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_spend.imprest_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_spend.saas_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_spend.approval_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_spend.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigalibs_spend.outbox_events ENABLE ROW LEVEL SECURITY;

-- 3. Tenant Isolation Policies (RESTRICTIVE)

DROP POLICY IF EXISTS tenant_isolation_cost_centers ON gigalibs_spend.cost_centers;
CREATE POLICY tenant_isolation_cost_centers ON gigalibs_spend.cost_centers
    AS RESTRICTIVE
    FOR ALL
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

DROP POLICY IF EXISTS tenant_isolation_expenses ON gigalibs_spend.expenses;
CREATE POLICY tenant_isolation_expenses ON gigalibs_spend.expenses
    AS RESTRICTIVE
    FOR ALL
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

DROP POLICY IF EXISTS tenant_isolation_expense_lines ON gigalibs_spend.expense_lines;
CREATE POLICY tenant_isolation_expense_lines ON gigalibs_spend.expense_lines
    AS RESTRICTIVE
    FOR ALL
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

DROP POLICY IF EXISTS tenant_isolation_travel_requests ON gigalibs_spend.travel_requests;
CREATE POLICY tenant_isolation_travel_requests ON gigalibs_spend.travel_requests
    AS RESTRICTIVE
    FOR ALL
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

DROP POLICY IF EXISTS tenant_isolation_imprest_wallets ON gigalibs_spend.imprest_wallets;
CREATE POLICY tenant_isolation_imprest_wallets ON gigalibs_spend.imprest_wallets
    AS RESTRICTIVE
    FOR ALL
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

DROP POLICY IF EXISTS tenant_isolation_imprest_transactions ON gigalibs_spend.imprest_transactions;
CREATE POLICY tenant_isolation_imprest_transactions ON gigalibs_spend.imprest_transactions
    AS RESTRICTIVE
    FOR ALL
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

DROP POLICY IF EXISTS tenant_isolation_saas_subscriptions ON gigalibs_spend.saas_subscriptions;
CREATE POLICY tenant_isolation_saas_subscriptions ON gigalibs_spend.saas_subscriptions
    AS RESTRICTIVE
    FOR ALL
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

DROP POLICY IF EXISTS tenant_isolation_approval_rules ON gigalibs_spend.approval_rules;
CREATE POLICY tenant_isolation_approval_rules ON gigalibs_spend.approval_rules
    AS RESTRICTIVE
    FOR ALL
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

DROP POLICY IF EXISTS tenant_isolation_audit_events ON gigalibs_spend.audit_events;
CREATE POLICY tenant_isolation_audit_events ON gigalibs_spend.audit_events
    AS RESTRICTIVE
    FOR ALL
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

DROP POLICY IF EXISTS tenant_isolation_outbox_events ON gigalibs_spend.outbox_events;
CREATE POLICY tenant_isolation_outbox_events ON gigalibs_spend.outbox_events
    AS RESTRICTIVE
    FOR ALL
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- 4. Record migration 2 in schema migrations ledger
INSERT INTO gigalibs_spend.schema_migrations (version, name)
VALUES (2, '000002_spend_rls_and_ledger')
ON CONFLICT (version) DO NOTHING;

COMMIT;
