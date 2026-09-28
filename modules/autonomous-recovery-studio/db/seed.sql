-- Seed Enterprise Cash Leakage Records
INSERT INTO gigalibs_recovery.detected_leaks (
  id, leak_type, severity, title, vendor_name, vendor_id, amount_minor, currency, amount_usd,
  confidence_score, accuracy_protocol, primary_doc_id, primary_doc_date, comparison_doc_id, comparison_doc_date,
  evidence, status, action_taken, action_notes, clawback_run_id, created_at, updated_at
) VALUES
(
  'LEAK-2026-001',
  'DUPLICATE_INVOICE',
  'CRITICAL',
  'Duplicate Medical Imaging Equipment Billing',
  'Siemens Healthineers',
  'VEND-SIEMENS-01',
  12500000,
  'USD',
  125000.00,
  99.10,
  'DETERMINISTIC_DUAL_GATE',
  'INV-99120-A',
  '2026-08-28 10:14:00+00',
  'INV-99120',
  '2026-08-22 14:30:00+00',
  '{
    "match_rationale": "Identical line item quantities, line descriptions (Somatom Force Dual Source CT), matching PO-2026-778, with identical net amount and -A suffix permutation.",
    "primary": {"doc_id": "INV-99120-A", "date": "2026-08-28", "amount": 125000.00, "po": "PO-2026-778", "hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"},
    "comparison": {"doc_id": "INV-99120", "date": "2026-08-22", "amount": 125000.00, "po": "PO-2026-778", "hash": "c56d0e9a7cdd65227393a558564a275466ef4b50c05fe05c4ac4fbda79a4b277"},
    "variance": {"amount_delta": 0.00, "days_apart": 6, "hash_overlap_pct": 98.4}
  }'::jsonb,
  'HELD',
  'AUTOMATED_PAYMENT_HOLD',
  'Autonomous hold executed. Invoice queued for human-in-the-loop review before AP payment run.',
  'RUN-CB-2026-001',
  NOW() - INTERVAL '3 days',
  NOW() - INTERVAL '3 days'
),
(
  'LEAK-2026-002',
  'MISSED_TAX_EXEMPTION',
  'HIGH',
  'Statutory Cross-Border VAT Exemption Not Claimed',
  'Dell Technologies',
  'VEND-DELL-04',
  1845000,
  'USD',
  18450.00,
  100.00,
  'DETERMINISTIC_DUAL_GATE',
  'INV-DELL-88341',
  '2026-08-30 09:15:00+00',
  'CERT-EX-2026-DE',
  '2026-01-01 00:00:00+00',
  '{
    "match_rationale": "Enterprise server shipment delivered to certified exempt duty-free datacenter Frankfurt DE with valid exemption certificate CERT-EX-2026-DE on file. 19% VAT ($18,450.00) billed erroneously.",
    "primary": {"doc_id": "INV-DELL-88341", "vat_rate_billed": 0.19, "vat_amount": 18450.00, "destination": "DE-FFM-DC2"},
    "comparison": {"doc_id": "CERT-EX-2026-DE", "statutory_code": "§4 No. 21 UStG", "exemption_status": "ACTIVE", "expires": "2027-12-31"},
    "variance": {"recoverable_tax": 18450.00, "statutory_confidence": 100.0}
  }'::jsonb,
  'DETECTED',
  NULL,
  NULL,
  NULL,
  NOW() - INTERVAL '2 days',
  NOW() - INTERVAL '2 days'
),
(
  'LEAK-2026-003',
  'UNCLAIMED_CREDIT',
  'HIGH',
  'Unapplied Cloud Infrastructure Volume Rebate Credit Memo',
  'Amazon Web Services',
  'VEND-AWS-01',
  4250000,
  'USD',
  42500.00,
  99.80,
  'DETERMINISTIC_DUAL_GATE',
  'CM-AWS-9014',
  '2026-08-15 11:20:00+00',
  'INV-AWS-2026-08',
  '2026-09-01 00:00:00+00',
  '{
    "match_rationale": "Issued credit memo CM-AWS-9014 for $42,500 was omitted from August enterprise consolidated invoice batch settlement and remains unapplied in AP ledger.",
    "primary": {"doc_id": "CM-AWS-9014", "type": "CREDIT_MEMO", "credit_amount": 42500.00, "reason": "Enterprise Tier 1 EDP Volume Commitment Rebate"},
    "comparison": {"doc_id": "INV-AWS-2026-08", "type": "CONSOLIDATED_INVOICE", "net_amount": 348000.00, "credits_applied": 0.00},
    "variance": {"unclaimed_cash": 42500.00, "aging_days": 21}
  }'::jsonb,
  'DETECTED',
  NULL,
  NULL,
  NULL,
  NOW() - INTERVAL '1 day',
  NOW() - INTERVAL '1 day'
),
(
  'LEAK-2026-004',
  'CONTRACT_CREEP',
  'HIGH',
  'Contract Unit Price Creep Over MSA Schedule B',
  'NVIDIA Corp',
  'VEND-NV-02',
  2600000,
  'USD',
  26000.00,
  98.70,
  'DETERMINISTIC_DUAL_GATE',
  'INV-NV-4401',
  '2026-09-01 16:45:00+00',
  'MSA-2025-NV-B',
  '2025-11-15 00:00:00+00',
  '{
    "match_rationale": "100x DGX compute modules billed at $2,850/unit instead of contract schedule rate of $2,590/unit for orders exceeding 50 units.",
    "primary": {"doc_id": "INV-NV-4401", "quantity": 100, "unit_price": 2850.00, "extended_total": 285000.00},
    "comparison": {"doc_id": "MSA-2025-NV-B", "tier_min_qty": 50, "agreed_unit_price": 2590.00, "contract_clause": "Exhibit 4.2 Tier Discounts"},
    "variance": {"unit_delta": 260.00, "overbilled_total": 26000.00}
  }'::jsonb,
  'DETECTED',
  NULL,
  NULL,
  NULL,
  NOW() - INTERVAL '18 hours',
  NOW() - INTERVAL '18 hours'
),
(
  'LEAK-2026-005',
  'DUPLICATE_INVOICE',
  'CRITICAL',
  'Dual-Entity SaaS Seat Duplication',
  'Salesforce.com',
  'VEND-SF-01',
  6420000,
  'USD',
  64200.00,
  99.40,
  'DETERMINISTIC_DUAL_GATE',
  'INV-SF-2026-Q3-US',
  '2026-09-02 12:00:00+00',
  'INV-SF-2026-Q3-UK',
  '2026-09-02 12:00:00+00',
  '{
    "match_rationale": "Enterprise CRM seats billed twice across US and UK subsidiary legal entities with identical active seat emails.",
    "primary": {"doc_id": "INV-SF-2026-Q3-US", "seats": 400, "total": 64200.00, "entity": "US_INC"},
    "comparison": {"doc_id": "INV-SF-2026-Q3-UK", "seats": 400, "total": 64200.00, "entity": "UK_LTD"},
    "variance": {"duplicated_seats": 400, "leak_value": 64200.00}
  }'::jsonb,
  'DETECTED',
  NULL,
  NULL,
  NULL,
  NOW() - INTERVAL '10 hours',
  NOW() - INTERVAL '10 hours'
),
(
  'LEAK-2026-006',
  'CONTRACT_CREEP',
  'MEDIUM',
  'Treasury FX Conversion Spread Markup Violation',
  'Barclays Treasury',
  'VEND-BARC-01',
  1414000,
  'USD',
  14140.00,
  100.00,
  'DETERMINISTIC_DUAL_GATE',
  'FX-STMT-7712',
  '2026-08-10 18:00:00+00',
  'TREASURY-AGMT-2024',
  '2024-04-01 00:00:00+00',
  '{
    "match_rationale": "EUR 10,000,000 conversion billed at 1.0982 EUR/USD vs interbank fix 1.0840 (+142 bps). Contractual ceiling is capped at 15 bps maximum.",
    "primary": {"doc_id": "FX-STMT-7712", "applied_rate": 1.0982, "interbank_benchmark": 1.0840, "effective_spread_bps": 142},
    "comparison": {"doc_id": "TREASURY-AGMT-2024", "max_spread_bps": 15, "clause": "Schedule 2 Treasury Execution SLA"},
    "variance": {"excess_spread_bps": 127, "clawback_amount": 14140.00}
  }'::jsonb,
  'RECOVERED',
  'SETTLED_OFFSET',
  'Offset settled directly against Q3 treasury fee cycle. Cryptographic audit receipt CLM-2026-077 issued.',
  'RUN-CB-2026-088',
  NOW() - INTERVAL '15 days',
  NOW() - INTERVAL '12 days'
);

-- Seed Historical Scan Sessions
INSERT INTO gigalibs_recovery.historical_scan_sessions (
  id, scan_name, records_scanned, leaks_found, potential_recovery_usd, status, duration_ms, scanned_by, created_at
) VALUES
(
  'SCAN-SHADOW-001',
  'Initial ERP 14-Day Shadow Ingestion Audit',
  142850,
  6,
  290290.00,
  'COMPLETED',
  3420,
  'AUTONOMOUS_SHADOW_ENGINE',
  NOW() - INTERVAL '3 days'
),
(
  'SCAN-SHADOW-002',
  'Procurement & Vendor Ledger Reconciliation Scan',
  84500,
  2,
  128000.00,
  'COMPLETED',
  2150,
  'AUTONOMOUS_SHADOW_ENGINE',
  NOW() - INTERVAL '1 day'
);

-- Seed Recovery Claims
INSERT INTO gigalibs_recovery.recovery_claims (
  id, leak_id, claim_number, vendor_name, vendor_contact_email, claim_amount_usd,
  settlement_type, status, evidence_hash, workflow_run_id, issued_at, settled_at
) VALUES
(
  'CLM-2026-077',
  'LEAK-2026-006',
  'CLM-FX-BARC-2026-01',
  'Barclays Treasury',
  'institutional.settlements@barclays.example.com',
  14140.00,
  'LEDGER_OFFSET',
  'SETTLED',
  '4f83b2bb673a90a2be29e84605ea2cfb373eecb2d2db0b49f96b1ae4f6fb39f6',
  'RUN-CB-2026-088',
  NOW() - INTERVAL '14 days',
  NOW() - INTERVAL '12 days'
),
(
  'CLM-2026-081',
  'LEAK-2026-001',
  'CLM-SIEM-2026-09',
  'Siemens Healthineers',
  'billing-disputes@siemens-healthineers.example.com',
  125000.00,
  'VENDOR_CREDIT_MEMO',
  'ISSUED',
  '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92',
  'RUN-CB-2026-001',
  NOW() - INTERVAL '3 days',
  NULL
);

-- Seed Audit Events
INSERT INTO gigalibs_recovery.audit_events (
  id, event_type, entity_type, entity_id, payload, performed_by, created_at
) VALUES
(
  'AUDIT-REC-001',
  'LEAKAGE_DETECTED',
  'detected_leaks',
  'LEAK-2026-001',
  '{"amount_usd": 125000.00, "confidence": 99.1, "rule": "FUZZY_INVOICE_DUPLICATION"}'::jsonb,
  'AUTONOMOUS_ENGINE',
  NOW() - INTERVAL '3 days'
),
(
  'AUDIT-REC-002',
  'PAYMENT_HOLD_EXECUTED',
  'detected_leaks',
  'LEAK-2026-001',
  '{"action": "BLOCK_PAYMENT", "status": "HELD", "threshold": 98.5}'::jsonb,
  'AUTONOMOUS_POLICY_AGENT',
  NOW() - INTERVAL '3 days'
);
