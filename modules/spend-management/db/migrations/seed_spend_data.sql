BEGIN;

-- Insert tenant
INSERT INTO gigalibs_spend.module_tenants (id, oidc_issuer, external_tenant_subject, status)
VALUES ('10000000-0000-4000-8000-000000000001', 'http://127.0.0.1:3500/oidc', '10000000-0000-4000-8000-000000000001', 'ACTIVE')
ON CONFLICT (id) DO NOTHING;

-- Cost Centers
INSERT INTO gigalibs_spend.cost_centers (
  tenant_id, id, code, name, manager_name, manager_email, currency,
  allocated_budget_minor, committed_budget_minor, spent_budget_minor, fiscal_year, status, version
) VALUES
('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'CC-ENG-101', 'Cloud Infrastructure & Engineering', 'Marcus Vance', 'marcus.vance@enterprise.io', 'USD', 75000000, 12000000, 21540000, 2026, 'ACTIVE', 1),
('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', 'CC-MKT-201', 'Enterprise Growth & Marketing', 'Elena Rostova', 'elena.rostova@enterprise.io', 'USD', 45000000, 4500000, 16820000, 2026, 'ACTIVE', 1),
('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000003', 'CC-OPS-301', 'Operations & Facilities', 'David Chen', 'david.chen@enterprise.io', 'USD', 30000000, 2500000, 8410000, 2026, 'ACTIVE', 1),
('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000004', 'CC-FIN-401', 'Corporate Finance & Treasury', 'Sarah Jenkins', 'sarah.jenkins@enterprise.io', 'USD', 25000000, 1500000, 4250000, 2026, 'ACTIVE', 1)
ON CONFLICT (tenant_id, id) DO NOTHING;

-- Initial Expenses (Enterprise seeded records)
INSERT INTO gigalibs_spend.expenses (
  tenant_id, id, cost_center_id, employee_name, employee_email, merchant, category, payment_method,
  currency, amount_minor, tax_minor, receipt_filename, status, policy_violation_flag, policy_violation_notes,
  approver_name, approved_at, version
) VALUES
('10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Alex Mercer', 'alex.mercer@enterprise.io', 'Fastly Edge Cloud', 'SOFTWARE_SAAS', 'CORPORATE_CARD', 'USD', 485000, 43650, 'receipt-fastly-aug2026.pdf', 'APPROVED', false, NULL, 'Marcus Vance', transaction_timestamp(), 2),
('10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'Rachel Sterling', 'rachel.sterling@enterprise.io', 'Grand Hyatt Chicago', 'LODGING', 'CORPORATE_CARD', 'USD', 124000, 14880, 'chicago-summit-hotel.pdf', 'SUBMITTED', false, NULL, NULL, NULL, 1),
('10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000003', 'Michael Scott', 'michael.scott@enterprise.io', 'Bistro Executive Dining', 'MEALS_ENTERTAINMENT', 'PERSONAL_REIMBURSABLE', 'USD', 31500, 2835, 'client-dinner-voucher.jpg', 'REIMBURSED', false, NULL, 'David Chen', transaction_timestamp(), 3)
ON CONFLICT (tenant_id, id) DO NOTHING;

-- Expense Lines
INSERT INTO gigalibs_spend.expense_lines (
  tenant_id, id, expense_id, line_number, description, gl_code, amount_minor, tax_minor
) VALUES
('10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 1, 'Edge CDN Traffic & WAF Security', 'GL-6300-SOFTWARE', 485000, 43650),
('10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', 1, 'Conference Hotel 3 Nights Stay', 'GL-6100-LODGING', 124000, 14880),
('10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000003', 1, 'Executive Strategy Dinner with Partners', 'GL-6200-MEALS', 31500, 2835)
ON CONFLICT (tenant_id, id) DO NOTHING;

-- Imprest Wallets
INSERT INTO gigalibs_spend.imprest_wallets (
  tenant_id, id, wallet_name, custodian_name, custodian_email, currency,
  target_balance_minor, current_balance_minor, low_balance_threshold_minor, status, version
) VALUES
('10000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 'HQ Primary Petty Cash Reserve', 'David Chen', 'david.chen@enterprise.io', 'USD', 1000000, 842000, 250000, 'ACTIVE', 1),
('10000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000002', 'West Coast Field Operations Box', 'Kendra Brooks', 'kendra.brooks@enterprise.io', 'USD', 500000, 315000, 100000, 'ACTIVE', 1)
ON CONFLICT (tenant_id, id) DO NOTHING;

-- Imprest Transactions
INSERT INTO gigalibs_spend.imprest_transactions (
  tenant_id, id, wallet_id, voucher_number, transaction_type, recipient_name,
  amount_minor, balance_after_minor, purpose, receipt_attached, recorded_by
) VALUES
('10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 'VOUCH-2026-089', 'DISBURSEMENT', 'Building Facilities Lead', 158000, 842000, 'Emergency plumbing repair courier dispatch', true, 'David Chen')
ON CONFLICT (tenant_id, id) DO NOTHING;

-- SaaS Subscriptions
INSERT INTO gigalibs_spend.saas_subscriptions (
  tenant_id, id, vendor_name, category, cost_center_id, owner_email, billing_frequency,
  seats_allocated, seats_utilized, cost_per_seat_minor, annual_run_rate_minor, renewal_date, status, auto_renew, version
) VALUES
('10000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001', 'Datadog Cloud Observability', 'DEVELOPER_TOOLS', '20000000-0000-4000-8000-000000000001', 'marcus.vance@enterprise.io', 'ANNUAL', 85, 78, 40000, 3400000, '2026-12-15', 'ACTIVE', true, 1),
('10000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000002', 'Figma Enterprise Organization', 'PRODUCT_DESIGN', '20000000-0000-4000-8000-000000000001', 'elena.rostova@enterprise.io', 'ANNUAL', 40, 36, 90000, 3600000, '2026-11-01', 'ACTIVE', true, 1),
('10000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000003', 'Slack Enterprise Grid', 'COMMUNICATION', '20000000-0000-4000-8000-000000000003', 'david.chen@enterprise.io', 'ANNUAL', 150, 142, 18000, 2700000, '2027-02-28', 'ACTIVE', true, 1)
ON CONFLICT (tenant_id, id) DO NOTHING;

-- Travel Requests
INSERT INTO gigalibs_spend.travel_requests (
  tenant_id, id, cost_center_id, employee_name, employee_email, destination_city,
  destination_country, departure_date, return_date, gsa_city_tier, per_diem_daily_rate_minor,
  lodging_ceiling_daily_minor, estimated_total_minor, actual_spend_minor, status, business_purpose, version
) VALUES
('10000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', 'Elena Rostova', 'elena.rostova@enterprise.io', 'Chicago, IL', 'US', '2026-09-20', '2026-09-24', 'TIER_2', 7900, 25800, 134800, 0, 'APPROVED', 'Keynote address at Global FinOps Executive Summit', 1)
ON CONFLICT (tenant_id, id) DO NOTHING;

-- Approval Rules
INSERT INTO gigalibs_spend.approval_rules (
  tenant_id, id, rule_name, min_amount_minor, max_amount_minor, requires_executive_signoff, required_role
) VALUES
('10000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001', 'Standard Operational Expenses', 0, 100000, false, 'spend.manager'),
('10000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000002', 'High-Value Department Purchase', 100001, 1000000, false, 'spend.director'),
('10000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000003', 'Executive Capex Dual Authorization', 1000001, NULL, true, 'spend.executive')
ON CONFLICT (tenant_id, id) DO NOTHING;

COMMIT;
