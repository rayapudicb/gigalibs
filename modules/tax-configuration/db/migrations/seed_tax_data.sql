-- Seed Initial Tax Jurisdictions for Active Tenants
INSERT INTO gigalibs_tax.tax_jurisdictions (
    id, tenant_id, country_code, jurisdiction_code, jurisdiction_name,
    tax_type, standard_rate_basis_points, reduced_rate_basis_points,
    has_physical_nexus, has_economic_nexus, economic_threshold_revenue_minor,
    economic_threshold_transactions, current_period_revenue_minor, current_period_transactions, status
) VALUES
('jur-ca-01', 'tenant-enterprise-primary', 'US', 'CA', 'California Department of Tax & Fee Admin', 'SALES_TAX', 725, 325, TRUE, TRUE, 50000000, 200, 38400000, 142, 'ACTIVE'),
('jur-ny-01', 'tenant-enterprise-primary', 'US', 'NY', 'New York State Dept of Taxation & Finance', 'SALES_TAX', 800, 400, TRUE, TRUE, 50000000, 100, 29150000, 88, 'ACTIVE'),
('jur-tx-01', 'tenant-enterprise-primary', 'US', 'TX', 'Texas Comptroller of Public Accounts', 'SALES_TAX', 625, 0, FALSE, TRUE, 50000000, 200, 18500000, 64, 'ACTIVE'),
('jur-fl-01', 'tenant-enterprise-primary', 'US', 'FL', 'Florida Department of Revenue', 'SALES_TAX', 600, 0, FALSE, TRUE, 10000000, 200, 14200000, 51, 'ACTIVE'),
('jur-wa-01', 'tenant-enterprise-primary', 'US', 'WA', 'Washington State Dept of Revenue', 'SALES_TAX', 650, 0, FALSE, TRUE, 10000000, 200, 8900000, 33, 'ACTIVE'),
('jur-uk-01', 'tenant-enterprise-primary', 'GB', 'GB-VAT', 'UK HM Revenue & Customs (HMRC)', 'VAT', 2000, 500, TRUE, TRUE, 8500000, 100, 12800000, 79, 'ACTIVE'),
('jur-de-01', 'tenant-enterprise-primary', 'DE', 'DE-VAT', 'Bundeszentralamt für Steuern (BZSt)', 'VAT', 1900, 700, FALSE, TRUE, 10000000, 100, 9400000, 41, 'ACTIVE')
ON CONFLICT (tenant_id, country_code, jurisdiction_code) DO NOTHING;

-- Seed Tax Rates by Product Category
INSERT INTO gigalibs_tax.tax_rates (
    id, tenant_id, jurisdiction_id, product_category, rate_basis_points, is_exempt, effective_from
) VALUES
('tr-ca-srv', 'tenant-enterprise-primary', 'jur-ca-01', 'SERVICES', 725, FALSE, '2026-01-01'),
('tr-ca-lab', 'tenant-enterprise-primary', 'jur-ca-01', 'LABOR', 0, TRUE, '2026-01-01'),
('tr-ca-hdw', 'tenant-enterprise-primary', 'jur-ca-01', 'HARDWARE', 725, FALSE, '2026-01-01'),
('tr-ca-dig', 'tenant-enterprise-primary', 'jur-ca-01', 'DIGITAL_GOODS', 725, FALSE, '2026-01-01'),
('tr-ny-srv', 'tenant-enterprise-primary', 'jur-ny-01', 'SERVICES', 400, FALSE, '2026-01-01'),
('tr-ny-hdw', 'tenant-enterprise-primary', 'jur-ny-01', 'HARDWARE', 800, FALSE, '2026-01-01'),
('tr-uk-srv', 'tenant-enterprise-primary', 'jur-uk-01', 'SERVICES', 2000, FALSE, '2026-01-01'),
('tr-uk-dig', 'tenant-enterprise-primary', 'jur-uk-01', 'DIGITAL_GOODS', 2000, FALSE, '2026-01-01')
ON CONFLICT (id) DO NOTHING;

-- Seed Active Exemption Certificates (e.g. Government FAR Exemption)
INSERT INTO gigalibs_tax.exemption_certificates (
    id, tenant_id, customer_id, customer_name, certificate_number,
    jurisdiction_code, exemption_reason, document_url, valid_from, valid_until, is_verified, status
) VALUES
('ex-far-01', 'tenant-enterprise-primary', 'cust-apex-defense', 'Apex Defense Systems Corp', 'FAR-52-229-3-FED-9941', 'CA', 'GOVERNMENT_FAR_52_229', 'https://docs.gigalibs.io/certificates/far-9941.pdf', '2026-01-01', '2027-12-31', TRUE, 'ACTIVE'),
('ex-resale-02', 'tenant-enterprise-primary', 'cust-warner-bros', 'Warner Bros Discovery Operations', 'RESALE-CA-7741029', 'CA', 'RESALE_CERTIFICATE', 'https://docs.gigalibs.io/certificates/resale-7741.pdf', '2026-01-01', '2026-12-31', TRUE, 'ACTIVE')
ON CONFLICT (id) DO NOTHING;

-- Seed Sample Tax Calculations in the Ledger
INSERT INTO gigalibs_tax.tax_calculation_ledger (
    id, tenant_id, source_module, document_id, document_reference,
    jurisdiction_id, jurisdiction_code, product_category, taxable_amount_minor,
    exempt_amount_minor, calculated_tax_minor, applied_rate_basis_points,
    exemption_certificate_id, idempotency_key, created_at
) VALUES
('txl-001', 'tenant-enterprise-primary', 'ACCOUNTS_RECEIVABLE', 'inv-warner-stage4-01', 'INV-2026-WB-001', 'jur-ca-01', 'CA', 'SERVICES', 2500000, 0, 181250, 725, NULL, 'idem-txl-001', NOW() - INTERVAL '3 days'),
('txl-002', 'tenant-enterprise-primary', 'SPEND_MANAGEMENT', 'exp-equipment-01', 'EXP-2026-CAM-09', 'jur-ny-01', 'NY', 'HARDWARE', 850000, 0, 68000, 800, NULL, 'idem-txl-002', NOW() - INTERVAL '2 days'),
('txl-003', 'tenant-enterprise-primary', 'ACCOUNTS_RECEIVABLE', 'inv-apex-contract-01', 'INV-2026-APEX-01', 'jur-ca-01', 'CA', 'SERVICES', 4200000, 4200000, 0, 0, 'ex-far-01', 'idem-txl-003', NOW() - INTERVAL '1 day')
ON CONFLICT (idempotency_key) DO NOTHING;
