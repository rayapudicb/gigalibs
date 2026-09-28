CREATE SCHEMA IF NOT EXISTS gigalibs_tax;

-- 1. Tax Jurisdictions & Nexus Thresholds
CREATE TABLE IF NOT EXISTS gigalibs_tax.tax_jurisdictions (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    country_code VARCHAR(2) NOT NULL,
    jurisdiction_code VARCHAR(16) NOT NULL,
    jurisdiction_name VARCHAR(128) NOT NULL,
    tax_type VARCHAR(32) NOT NULL, -- 'SALES_TAX', 'VAT', 'GST'
    standard_rate_basis_points INT NOT NULL, -- e.g. 725 = 7.25%
    reduced_rate_basis_points INT DEFAULT 0,
    has_physical_nexus BOOLEAN DEFAULT FALSE,
    has_economic_nexus BOOLEAN DEFAULT TRUE,
    economic_threshold_revenue_minor BIGINT DEFAULT 10000000, -- $100,000 in cents
    economic_threshold_transactions INT DEFAULT 200,
    current_period_revenue_minor BIGINT DEFAULT 0,
    current_period_transactions INT DEFAULT 0,
    status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uk_tax_jurisdiction_tenant UNIQUE (tenant_id, country_code, jurisdiction_code)
);

-- 2. Category / Item Specific Tax Rates
CREATE TABLE IF NOT EXISTS gigalibs_tax.tax_rates (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    jurisdiction_id VARCHAR(64) NOT NULL REFERENCES gigalibs_tax.tax_jurisdictions(id) ON DELETE CASCADE,
    product_category VARCHAR(64) NOT NULL, -- 'SERVICES', 'DIGITAL_GOODS', 'HARDWARE', 'LABOR', 'LICENSING'
    rate_basis_points INT NOT NULL,
    is_exempt BOOLEAN DEFAULT FALSE,
    effective_from DATE NOT NULL,
    effective_until DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Exemption Certificates (e.g. Government FAR, Reseller)
CREATE TABLE IF NOT EXISTS gigalibs_tax.exemption_certificates (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    customer_id VARCHAR(64) NOT NULL,
    customer_name VARCHAR(128) NOT NULL,
    certificate_number VARCHAR(128) NOT NULL,
    jurisdiction_code VARCHAR(16) NOT NULL,
    exemption_reason VARCHAR(64) NOT NULL, -- 'GOVERNMENT_FAR_52_229', 'RESALE_CERTIFICATE', 'NON_PROFIT_501C3', 'DIRECT_PAY_PERMIT'
    document_url VARCHAR(255),
    valid_from DATE NOT NULL,
    valid_until DATE NOT NULL,
    is_verified BOOLEAN DEFAULT TRUE,
    status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Real-Time Calculation & Quote Ledger (ACID Idempotent)
CREATE TABLE IF NOT EXISTS gigalibs_tax.tax_calculation_ledger (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    source_module VARCHAR(32) NOT NULL, -- 'ACCOUNTS_RECEIVABLE', 'SPEND_MANAGEMENT', 'CHECKOUT'
    document_id VARCHAR(64) NOT NULL,
    document_reference VARCHAR(128),
    jurisdiction_id VARCHAR(64) REFERENCES gigalibs_tax.tax_jurisdictions(id),
    jurisdiction_code VARCHAR(16) NOT NULL,
    product_category VARCHAR(64) NOT NULL,
    taxable_amount_minor BIGINT NOT NULL,
    exempt_amount_minor BIGINT NOT NULL DEFAULT 0,
    calculated_tax_minor BIGINT NOT NULL,
    applied_rate_basis_points INT NOT NULL,
    exemption_certificate_id VARCHAR(64),
    idempotency_key VARCHAR(128) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Audit Log Table
CREATE TABLE IF NOT EXISTS gigalibs_tax.audit_events (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    entity_type VARCHAR(64) NOT NULL,
    entity_id VARCHAR(64) NOT NULL,
    action VARCHAR(64) NOT NULL,
    actor_id VARCHAR(64) NOT NULL,
    actor_email VARCHAR(128) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    ip_address VARCHAR(45),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Outbox Events Table
CREATE TABLE IF NOT EXISTS gigalibs_tax.outbox_events (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tax_jurisdictions_tenant ON gigalibs_tax.tax_jurisdictions(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_tax_exemptions_tenant ON gigalibs_tax.exemption_certificates(tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_tax_ledger_doc ON gigalibs_tax.tax_calculation_ledger(tenant_id, document_id);
CREATE INDEX IF NOT EXISTS idx_tax_ledger_idempotency ON gigalibs_tax.tax_calculation_ledger(idempotency_key);
