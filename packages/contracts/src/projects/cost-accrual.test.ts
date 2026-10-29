import { describe, expect, it } from 'vitest';
import {
  accrueProjectCosts,
  computeProjectBudgetBurn,
  projectLineExtensionMinor,
} from './cost-accrual.js';

const projectA = '00000000-0000-4000-8000-000000000001';
const projectB = '00000000-0000-4000-8000-000000000002';
const task1 = '00000000-0000-4000-8000-000000000011';
const task2 = '00000000-0000-4000-8000-000000000012';

describe('projectLineExtensionMinor', () => {
  it('multiplies quantity and unit cost with half-up rounding to minor units', () => {
    expect(projectLineExtensionMinor('2', '1500')).toBe(3000n);
    expect(projectLineExtensionMinor('1.5', '1000')).toBe(1500n);
    expect(projectLineExtensionMinor('0.333333', '900')).toBe(300n);
  });
});

describe('accrueProjectCosts', () => {
  it('rolls material and labor up by project and task', () => {
    const result = accrueProjectCosts({
      materialLines: [
        {
          issueId: '00000000-0000-4000-8000-000000000021',
          projectId: projectA,
          taskId: task1,
          quantity: '4',
          unitCostMinor: '250',
        },
        {
          issueId: '00000000-0000-4000-8000-000000000022',
          projectId: projectA,
          taskId: null,
          quantity: '1',
          unitCostMinor: '1000',
        },
      ],
      laborLines: [
        {
          timesheetId: '00000000-0000-4000-8000-000000000031',
          projectId: projectA,
          taskId: task1,
          hours: '8',
          hourlyRateMinor: '5000',
        },
        {
          timesheetId: '00000000-0000-4000-8000-000000000032',
          projectId: projectB,
          taskId: task2,
          hours: '2.5',
          hourlyRateMinor: '4000',
        },
      ],
    });
    expect(result.materialMinor).toBe('2000');
    expect(result.laborMinor).toBe('50000');
    expect(result.totalMinor).toBe('52000');
    expect(result.projects).toHaveLength(2);
    const a = result.projects.find((p) => p.projectId === projectA)!;
    expect(a.materialMinor).toBe('2000');
    expect(a.laborMinor).toBe('40000');
    expect(a.tasks.find((t) => t.taskId === task1)?.totalMinor).toBe('41000');
    expect(a.tasks.find((t) => t.taskId === null)?.materialMinor).toBe('1000');
  });

  it('returns zeros when no lines', () => {
    expect(accrueProjectCosts({ materialLines: [], laborLines: [] }).totalMinor).toBe('0');
  });
});

describe('computeProjectBudgetBurn', () => {
  it('computes remaining and consumed basis points', () => {
    expect(computeProjectBudgetBurn('10000', '2500')).toEqual({
      budgetMinor: '10000',
      accruedMinor: '2500',
      remainingMinor: '7500',
      consumedBasisPoints: 2500,
    });
  });

  it('reports consumed basis points above 100% when over budget', () => {
    const burn = computeProjectBudgetBurn('1000', '5000');
    expect(burn.remainingMinor).toBe('-4000');
    expect(burn.consumedBasisPoints).toBe(50_000);
  });
});
