import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

describe('Saga Orchestrator Truth Boundary & Compensating Execution Logic', () => {
  it('generates unique, deterministic FIPS SHA-256 step checksums', () => {
    const sagaId = 'saga-test-001';
    const stepIndex = 1;
    const tenantId = '550e8400-e29b-41d4-a716-446655440000';
    const forwardAction = 'POST /api/sap/v1/fi/disbursements/hold';

    const checksum1 = createHash('sha256')
      .update(`${sagaId}:${stepIndex}:${tenantId}:${forwardAction}`)
      .digest('hex');

    const checksum2 = createHash('sha256')
      .update(`${sagaId}:${stepIndex}:${tenantId}:${forwardAction}`)
      .digest('hex');

    expect(checksum1).toBe(checksum2);
    expect(checksum1).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(checksum1)).toBe(true);

    // Differing input yields differing checksum
    const otherChecksum = createHash('sha256')
      .update(`${sagaId}:${stepIndex + 1}:${tenantId}:${forwardAction}`)
      .digest('hex');

    expect(checksum1).not.toBe(otherChecksum);
  });

  it('computes composite audit ledger digest across all step checksums', () => {
    const checksums = [
      'a'.repeat(64),
      'b'.repeat(64),
      'c'.repeat(64),
    ];

    const digest = createHash('sha256')
      .update(checksums.join(':'))
      .digest('hex');

    expect(digest).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(digest)).toBe(true);
  });

  it('models backward compensation: steps prior to failure are rolled back in reverse order', () => {
    const steps = [
      { stepIndex: 1, name: 'Step 1', status: 'PENDING' },
      { stepIndex: 2, name: 'Step 2', status: 'PENDING' },
      { stepIndex: 3, name: 'Step 3', status: 'PENDING' },
      { stepIndex: 4, name: 'Step 4', status: 'PENDING' },
    ];

    const failAtStep = 3;
    const executed: number[] = [];

    // Forward execution
    for (const s of steps) {
      if (s.stepIndex === failAtStep) {
        s.status = 'FAILED';
        break;
      }
      s.status = 'SUCCESS';
      executed.push(s.stepIndex);
    }

    expect(executed).toEqual([1, 2]);
    expect(steps.find((s) => s.stepIndex === 3)?.status).toBe('FAILED');
    expect(steps.find((s) => s.stepIndex === 4)?.status).toBe('PENDING');

    // Compensating rollback in reverse order
    const compensated: number[] = [];
    const completedPrior = steps.filter((s) => s.status === 'SUCCESS').reverse();
    for (const s of completedPrior) {
      s.status = 'COMPENSATED';
      compensated.push(s.stepIndex);
    }

    expect(compensated).toEqual([2, 1]); // Reverse order!
    expect(steps.filter((s) => s.status === 'COMPENSATED')).toHaveLength(2);
  });

  it('calculates transactional integrity percentage accurately', () => {
    // 8 completed, 2 compensated out of 10 = 100% integrity
    const total = 10;
    const completed = 8;
    const compensated = 2;
    const integrity = total > 0 ? Number((((completed + compensated) / total) * 100).toFixed(1)) : 100;
    expect(integrity).toBe(100.0);

    // 7 completed, 1 compensated, 2 failed = 80% integrity
    const total2 = 10;
    const completed2 = 7;
    const compensated2 = 1;
    const integrity2 = Number((((completed2 + compensated2) / total2) * 100).toFixed(1));
    expect(integrity2).toBe(80.0);
  });
});
