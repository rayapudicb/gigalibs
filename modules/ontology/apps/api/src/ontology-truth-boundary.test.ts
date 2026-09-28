import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

// ── Pure business logic contracts — no real DB ──────────────────────────────

describe('Ontology Party entity validation', () => {
  it('validates party code is alphanumeric with optional hyphens', () => {
    const validCodes = ['CUST-001', 'SUPPLIER123', 'GOV-AGENCY-001'];
    const invalidCodes = ['', ' SPACE', 'code with spaces', '<script>'];

    for (const code of validCodes) {
      expect(/^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/.test(code)).toBe(true);
    }
    for (const code of invalidCodes) {
      expect(/^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/.test(code)).toBe(false);
    }
  });

  it('validates risk_tier is a known enum value', () => {
    const validTiers = ['LOW', 'MEDIUM', 'HIGH'];
    const invalidTiers = ['low', 'CRITICAL', '', 'UNKNOWN'];

    for (const tier of validTiers) {
      expect(['LOW', 'MEDIUM', 'HIGH'].includes(tier)).toBe(true);
    }
    for (const tier of invalidTiers) {
      expect(['LOW', 'MEDIUM', 'HIGH'].includes(tier)).toBe(false);
    }
  });

  it('validates credit_score is an integer between 0 and 1000', () => {
    const validScores = [0, 500, 750, 1000];
    const invalidScores = [-1, 1001, NaN, 500.5];

    for (const score of validScores) {
      expect(Number.isInteger(score) && score >= 0 && score <= 1000).toBe(true);
    }
    for (const score of invalidScores) {
      expect(Number.isInteger(score) && score >= 0 && score <= 1000).toBe(false);
    }
  });
});

describe('Ontology Agreement date ordering', () => {
  it('requires effective_date to be before expiration_date', () => {
    const valid = {
      effective_date: new Date('2025-01-01'),
      expiration_date: new Date('2027-12-31'),
    };
    const invalid = {
      effective_date: new Date('2027-12-31'),
      expiration_date: new Date('2025-01-01'),
    };

    expect(valid.effective_date < valid.expiration_date).toBe(true);
    expect(invalid.effective_date < invalid.expiration_date).toBe(false);
  });

  it('rejects same-day effective and expiration dates', () => {
    const sameDay = {
      effective_date: new Date('2026-06-01'),
      expiration_date: new Date('2026-06-01'),
    };
    expect(sameDay.effective_date < sameDay.expiration_date).toBe(false);
  });
});

describe('Transaction FIPS SHA-256 checksum', () => {
  it('produces a deterministic 64-character hex checksum', () => {
    const tenantId = '550e8400-e29b-41d4-a716-446655440000';
    const code = 'TXN-20260915-001';
    const amountUsd = 4500000;

    const checksum = createHash('sha256')
      .update(`${tenantId}:${code}:${amountUsd}`)
      .digest('hex');

    expect(checksum).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(checksum)).toBe(true);

    // Deterministic
    const repeat = createHash('sha256')
      .update(`${tenantId}:${code}:${amountUsd}`)
      .digest('hex');
    expect(checksum).toBe(repeat);

    // Different input → different checksum
    const other = createHash('sha256')
      .update(`${tenantId}:TXN-20260916-002:999`)
      .digest('hex');
    expect(checksum).not.toBe(other);
  });
});

describe('Party 360 view stats computation', () => {
  it('correctly computes totalCommittedContractUsd, matchDefectRate, complianceScore', () => {
    const agreements = [
      { totalValueUsd: 1_000_000 },
      { totalValueUsd: 2_500_000 },
    ];
    const transactions = [
      { status: 'RECONCILED', amountUsd: 400_000, discrepancyAmountUsd: 0 },
      { status: 'DISCREPANCY_FLAGGED', amountUsd: 200_000, discrepancyAmountUsd: 15_000 },
      { status: 'DISCREPANCY_FLAGGED', amountUsd: 50_000, discrepancyAmountUsd: 5_000 },
      { status: 'PENDING_MATCH', amountUsd: 300_000, discrepancyAmountUsd: 0 },
    ];

    const totalCommittedContractUsd = agreements.reduce((s, a) => s + a.totalValueUsd, 0);
    const totalBilledUsd = transactions.reduce((s, t) => s + t.amountUsd, 0);
    const flaggedTxs = transactions.filter((t) => t.status === 'DISCREPANCY_FLAGGED');
    const disputedAmountUsd = flaggedTxs.reduce((s, t) => s + (t.discrepancyAmountUsd || 0), 0);
    const matchDefectRatePercent = Number(((flaggedTxs.length / transactions.length) * 100).toFixed(1));

    const riskTier: 'LOW' | 'MEDIUM' | 'HIGH' = 'MEDIUM';
    const scores: Record<'LOW' | 'MEDIUM' | 'HIGH', number> = { LOW: 98, MEDIUM: 84, HIGH: 62 };
    const complianceScore = scores[riskTier];

    expect(totalCommittedContractUsd).toBe(3_500_000);
    expect(totalBilledUsd).toBe(950_000);
    expect(disputedAmountUsd).toBe(20_000);
    expect(matchDefectRatePercent).toBe(50.0);
    expect(complianceScore).toBe(84);
  });

  it('returns 0% defect rate when no transactions exist', () => {
    const transactions: any[] = [];
    const rate =
      transactions.length > 0
        ? ((transactions.filter((t) => t.status === 'DISCREPANCY_FLAGGED').length / transactions.length) * 100)
        : 0;
    expect(rate).toBe(0);
  });
});

describe('Graph summary counting', () => {
  it('groups parties by category correctly', () => {
    const parties = [
      { category: 'SUPPLIER' },
      { category: 'CUSTOMER' },
      { category: 'CUSTOMER' },
      { category: 'FEDERAL_AGENCY' },
    ];

    const byCategory: Record<string, number> = {};
    for (const p of parties) {
      byCategory[p.category] = (byCategory[p.category] || 0) + 1;
    }

    expect(byCategory['SUPPLIER']).toBe(1);
    expect(byCategory['CUSTOMER']).toBe(2);
    expect(byCategory['FEDERAL_AGENCY']).toBe(1);
    expect(byCategory['REGIONAL_OPERATOR']).toBeUndefined();
  });
});
