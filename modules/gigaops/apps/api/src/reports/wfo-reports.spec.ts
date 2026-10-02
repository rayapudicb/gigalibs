import { describe, expect, it, vi, beforeEach } from 'vitest';
import { WfoReportsService } from './wfo-reports.service.js';

describe('WfoReportsService', () => {
  let mockDb: any;
  let service: WfoReportsService;

  const principal = {
    tenantId: '11111111-1111-4111-8111-111111111111',
    subject: 'test-admin',
    roles: ['TENANT_ADMIN'],
    permissions: ['workforce:*'],
  } as any;

  beforeEach(() => {
    mockDb = {
      withTenantTransaction: vi.fn(async (_tenantId, callback) => {
        const client = {
          query: vi.fn(async (sql: string) => {
            if (sql.includes('wfo_engagements')) {
              return {
                rows: [
                  {
                    engagementId: '33333333-3333-4333-8333-333333333333',
                    engagementTitle: 'Arena World Tour',
                    status: 'PUBLISHED',
                    positionTitle: 'Audio Lead',
                    requiredHeadcount: 4,
                    filledHeadcount: 4,
                    fillRatePct: 100,
                    hourlyRate: 65,
                  },
                ],
              };
            }
            if (sql.includes('wfo_workers w') && sql.includes('punches p')) {
              return {
                rows: [
                  {
                    workerId: '44444444-4444-4444-8444-444444444444',
                    workerName: 'Alex Rivera',
                    totalPunches: 8,
                    totalHours: 32,
                    regularHours: 30,
                    overtimeHours: 2,
                    exceptionsCount: 0,
                  },
                ],
              };
            }
            if (sql.includes('wfo_expense_reports e')) {
              return {
                rows: [
                  {
                    periodId: 'PERIOD-01',
                    periodName: 'October Bi-Weekly',
                    workerCount: 5,
                    grossPay: 12500,
                    totalExpenses: 850,
                    netPay: 11650,
                    currency: 'USD',
                    status: 'APPROVED',
                  },
                ],
              };
            }
            if (sql.includes('wfo_compliance_documents d')) {
              return {
                rows: [
                  {
                    documentType: 'ETCP_RIGGING',
                    documentName: 'ETCP Arena Rigging',
                    totalUploaded: 10,
                    verifiedCount: 9,
                    pendingCount: 1,
                    expiredCount: 0,
                    complianceRatePct: 90,
                  },
                ],
              };
            }
            if (sql.includes('wfo_expense_lines l')) {
              return {
                rows: [
                  {
                    expenseType: 'TRAVEL',
                    totalReports: 3,
                    totalAmount: 1200,
                    approvedAmount: 1200,
                    pendingAmount: 0,
                    currency: 'USD',
                  },
                ],
              };
            }
            if (sql.includes('utilisationPct')) {
              return {
                rows: [
                  {
                    workerId: '44444444-4444-4444-8444-444444444444',
                    workerName: 'Alex Rivera',
                    scheduledHours: 40,
                    workedHours: 38,
                    utilisationPct: 95,
                    shiftsCompleted: 5,
                  },
                ],
              };
            }
            if (sql.includes('noShowRatePct')) {
              return {
                rows: [
                  {
                    workerId: '44444444-4444-4444-8444-444444444444',
                    workerName: 'Alex Rivera',
                    scheduledShifts: 5,
                    attendedShifts: 5,
                    missedShifts: 0,
                    noShowRatePct: 0,
                  },
                ],
              };
            }
            return { rows: [] };
          }),
        };
        return callback(client);
      }),
    };
    service = new WfoReportsService(mockDb);
  });

  it('1. Generates Staffing report with position fill rates', async () => {
    const report = await service.getStaffingReport(principal);
    expect(report.length).toBe(1);
    expect(report[0].engagementTitle).toBe('Arena World Tour');
    expect(report[0].fillRatePct).toBe(100);
  });

  it('2. Generates Time & Labour report with hours breakdown', async () => {
    const report = await service.getTimeLabourReport(principal);
    expect(report.length).toBe(1);
    expect(report[0].workerName).toBe('Alex Rivera');
    expect(report[0].totalHours).toBe(32);
  });

  it('3. Generates Payroll Summary report', async () => {
    const report = await service.getPayrollSummaryReport(principal);
    expect(report.length).toBe(1);
    expect(report[0].grossPay).toBe(12500);
  });

  it('4. Generates Compliance, Expense, Utilisation, and Absenteeism reports', async () => {
    const comp = await service.getComplianceStatusReport(principal);
    expect(comp[0].documentType).toBe('ETCP_RIGGING');
    expect(comp[0].complianceRatePct).toBe(90);

    const exp = await service.getExpenseReport(principal);
    expect(exp[0].expenseType).toBe('TRAVEL');

    const util = await service.getUtilisationReport(principal);
    expect(util[0].utilisationPct).toBe(95);

    const abs = await service.getAbsenteeismReport(principal);
    expect(abs[0].missedShifts).toBe(0);
  });
});
