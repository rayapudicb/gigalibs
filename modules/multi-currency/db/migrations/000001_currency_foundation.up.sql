CREATE SCHEMA IF NOT EXISTS gigalibs_currency;

-- Currency Pairs & Rate Matrix
CREATE TABLE IF NOT EXISTS gigalibs_currency.currency_pairs (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    base_currency VARCHAR(3) NOT NULL,
    target_currency VARCHAR(3) NOT NULL,
    rate_micros BIGINT NOT NULL,
    inverse_rate_micros BIGINT NOT NULL,
    rate_source VARCHAR(64) NOT NULL,
    spread_basis_points INT NOT NULL DEFAULT 15,
    status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    effective_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_currency_pair UNIQUE (tenant_id, base_currency, target_currency)
);

-- Historical Rate Fixings
CREATE TABLE IF NOT EXISTS gigalibs_currency.rate_history (
    id VARCHAR(64) PRIMARY KEY,
    pair_id VARCHAR(64) REFERENCES gigalibs_currency.currency_pairs(id) ON DELETE CASCADE,
    rate_micros BIGINT NOT NULL,
    fixing_type VARCHAR(32) NOT NULL DEFAULT 'SPOT',
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Real-Time Conversion Ledger
CREATE TABLE IF NOT EXISTS gigalibs_currency.conversion_ledger (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    source_module VARCHAR(32) NOT NULL,
    document_id VARCHAR(64) NOT NULL,
    document_reference VARCHAR(128),
    from_currency VARCHAR(3) NOT NULL,
    to_currency VARCHAR(3) NOT NULL,
    source_amount_minor BIGINT NOT NULL,
    converted_amount_minor BIGINT NOT NULL,
    applied_rate_micros BIGINT NOT NULL,
    fee_minor BIGINT NOT NULL DEFAULT 0,
    settlement_date DATE NOT NULL DEFAULT CURRENT_DATE,
    idempotency_key VARCHAR(128) UNIQUE NOT NULL,
    calculation_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Treasury Hedging Contracts
CREATE TABLE IF NOT EXISTS gigalibs_currency.hedging_contracts (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    contract_number VARCHAR(128) NOT NULL,
    counterparty_bank VARCHAR(128) NOT NULL,
    pair_id VARCHAR(64) REFERENCES gigalibs_currency.currency_pairs(id),
    notional_amount_minor BIGINT NOT NULL,
    strike_rate_micros BIGINT NOT NULL,
    maturity_date DATE NOT NULL,
    hedge_type VARCHAR(32) NOT NULL DEFAULT 'DELIVERABLE_FORWARD',
    unrealized_gain_loss_minor BIGINT NOT NULL DEFAULT 0,
    status VARCHAR(16) NOT NULL DEFAULT 'OPEN',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tenant Currency & Localization Preferences
CREATE TABLE IF NOT EXISTS gigalibs_currency.tenant_currency_preferences (
    tenant_id VARCHAR(64) PRIMARY KEY,
    functional_currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    presentation_currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    default_locale VARCHAR(10) NOT NULL DEFAULT 'en-US',
    auto_convert_foreign_invoices BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit & Outbox Events
CREATE TABLE IF NOT EXISTS gigalibs_currency.audit_events (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    entity_type VARCHAR(64) NOT NULL,
    entity_id VARCHAR(64) NOT NULL,
    action VARCHAR(32) NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gigalibs_currency.outbox_events (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    payload JSONB NOT NULL,
    published BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_curr_pairs_tenant ON gigalibs_currency.currency_pairs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_curr_ledger_doc ON gigalibs_currency.conversion_ledger(tenant_id, document_id);
CREATE INDEX IF NOT EXISTS idx_curr_ledger_idemp ON gigalibs_currency.conversion_ledger(idempotency_key);
