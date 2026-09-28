-- Seed Currency Pairs & Rates
INSERT INTO gigalibs_currency.currency_pairs 
(id, tenant_id, base_currency, target_currency, rate_micros, inverse_rate_micros, rate_source, spread_basis_points, status, effective_at)
VALUES
('pair-usd-eur', 'tenant-enterprise-primary', 'USD', 'EUR', 921400, 1085305, 'European Central Bank (ECB Reference)', 15, 'ACTIVE', NOW()),
('pair-usd-gbp', 'tenant-enterprise-primary', 'USD', 'GBP', 784200, 1275185, 'Bank of England Official Fixing', 12, 'ACTIVE', NOW()),
('pair-usd-jpy', 'tenant-enterprise-primary', 'USD', 'JPY', 154250000, 6483, 'Bank of Japan Tokyo Fixing', 20, 'ACTIVE', NOW()),
('pair-usd-cad', 'tenant-enterprise-primary', 'USD', 'CAD', 1365000, 732601, 'Bank of Canada Benchmark', 10, 'ACTIVE', NOW()),
('pair-usd-chf', 'tenant-enterprise-primary', 'USD', 'CHF', 895000, 1117318, 'Swiss National Bank Reference', 18, 'ACTIVE', NOW()),
('pair-usd-aud', 'tenant-enterprise-primary', 'USD', 'AUD', 1512000, 661376, 'Reserve Bank of Australia', 15, 'ACTIVE', NOW()),
('pair-usd-inr', 'tenant-enterprise-primary', 'USD', 'INR', 83920000, 11916, 'Reserve Bank of India Reference Rate', 25, 'ACTIVE', NOW()),
('pair-usd-sgd', 'tenant-enterprise-primary', 'USD', 'SGD', 1342000, 745156, 'Monetary Authority of Singapore', 12, 'ACTIVE', NOW()),
('pair-eur-gbp', 'tenant-enterprise-primary', 'EUR', 'GBP', 851100, 1174950, 'Cross-Currency Calculated', 14, 'ACTIVE', NOW()),
('pair-eur-usd', 'tenant-enterprise-primary', 'EUR', 'USD', 1085305, 921400, 'European Central Bank (ECB Reference)', 15, 'ACTIVE', NOW()),
('pair-gbp-usd', 'tenant-enterprise-primary', 'GBP', 'USD', 1275185, 784200, 'Bank of England Official Fixing', 12, 'ACTIVE', NOW())
ON CONFLICT (tenant_id, base_currency, target_currency) DO UPDATE SET
  rate_micros = EXCLUDED.rate_micros,
  inverse_rate_micros = EXCLUDED.inverse_rate_micros,
  updated_at = NOW();

-- Seed Tenant Currency & Localization Preferences
INSERT INTO gigalibs_currency.tenant_currency_preferences
(tenant_id, functional_currency, presentation_currency, default_locale, auto_convert_foreign_invoices)
VALUES
('tenant-enterprise-primary', 'USD', 'USD', 'en-US', TRUE),
('tenant-defense-apex', 'USD', 'USD', 'en-US', TRUE),
('tenant-aerospace-global', 'GBP', 'EUR', 'en-GB', TRUE),
('tenant-warner-bros', 'USD', 'EUR', 'en-US', TRUE)
ON CONFLICT (tenant_id) DO UPDATE SET
  updated_at = NOW();

-- Seed Treasury Hedging Contracts
INSERT INTO gigalibs_currency.hedging_contracts
(id, tenant_id, contract_number, counterparty_bank, pair_id, notional_amount_minor, strike_rate_micros, maturity_date, hedge_type, unrealized_gain_loss_minor, status)
VALUES
('hdg-eur-01', 'tenant-enterprise-primary', 'FWD-2026-EUR-089', 'JPMorgan Chase London', 'pair-usd-eur', 500000000, 918000, '2026-12-31', 'DELIVERABLE_FORWARD', 4285000, 'OPEN'),
('hdg-gbp-01', 'tenant-enterprise-primary', 'FWD-2026-GBP-044', 'Barclays Corporate FX', 'pair-usd-gbp', 250000000, 781000, '2026-10-31', 'DELIVERABLE_FORWARD', 1840000, 'OPEN'),
('hdg-jpy-01', 'tenant-enterprise-primary', 'COL-2026-JPY-012', 'Nomura Securities Tokyo', 'pair-usd-jpy', 1200000000, 152500000, '2026-11-15', 'ZERO_COST_COLLAR', -512000, 'OPEN')
ON CONFLICT (id) DO NOTHING;

-- Seed Sample Conversion Transactions in Ledger
INSERT INTO gigalibs_currency.conversion_ledger
(id, tenant_id, source_module, document_id, document_reference, from_currency, to_currency, source_amount_minor, converted_amount_minor, applied_rate_micros, fee_minor, settlement_date, idempotency_key)
VALUES
('conv-001', 'tenant-enterprise-primary', 'ACCOUNTS_RECEIVABLE', 'inv-de-8891', 'INV-2026-EU-01', 'EUR', 'USD', 10000000, 10853050, 1085305, 1500, CURRENT_DATE - 1, 'idemp-fx-init-001'),
('conv-002', 'tenant-enterprise-primary', 'SPEND_MANAGEMENT', 'exp-uk-3312', 'EXP-LONDON-TRAVEL', 'GBP', 'USD', 450000, 573833, 1275185, 850, CURRENT_DATE, 'idemp-fx-init-002')
ON CONFLICT (idempotency_key) DO NOTHING;
