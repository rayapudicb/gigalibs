'use client';

import { workforceApi } from '@/lib/workforce-api';
import type {
  WfoAbsenteeismReportRowV1,
  WfoComplianceStatusReportRowV1,
  WfoExpenseAnalyticsRowV1,
  WfoPayrollSummaryReportRowV1,
  WfoStaffingReportRowV1,
  WfoTimeLabourReportRowV1,
  WfoUtilisationAnalyticsRowV1,
} from '@gigalibs/contracts';
import {
  Badge,
  Button,
  Container,
  Heading,
  StatusBadge,
  Table,
  Text,
} from '@medusajs/ui';
import { useCallback, useEffect, useState } from 'react';

type ReportType =
  | 'staffing'
  | 'time-labour'
  | 'payroll'
  | 'compliance'
  | 'expenses'
  | 'utilisation'
  | 'absenteeism';

export function WfoReportsHub() {
  const [activeReport, setActiveReport] = useState<ReportType>('staffing');
  const [loading, setLoading] = useState(false);

  // Report datasets
  const [staffing, setStaffing] = useState<WfoStaffingReportRowV1[]>([]);
  const [timeLabour, setTimeLabour] = useState<WfoTimeLabourReportRowV1[]>([]);
  const [payroll, setPayroll] = useState<WfoPayrollSummaryReportRowV1[]>([]);
  const [compliance, setCompliance] = useState<WfoComplianceStatusReportRowV1[]>([]);
  const [expenses, setExpenses] = useState<WfoExpenseAnalyticsRowV1[]>([]);
  const [utilisation, setUtilisation] = useState<WfoUtilisationAnalyticsRowV1[]>([]);
  const [absenteeism, setAbsenteeism] = useState<WfoAbsenteeismReportRowV1[]>([]);

  const loadReportData = useCallback(async (type: ReportType) => {
    try {
      setLoading(true);
      switch (type) {
        case 'staffing':
          setStaffing(await workforceApi.wfoGetStaffingReport());
          break;
        case 'time-labour':
          setTimeLabour(await workforceApi.wfoGetTimeLabourReport());
          break;
        case 'payroll':
          setPayroll(await workforceApi.wfoGetPayrollSummaryReport());
          break;
        case 'compliance':
          setCompliance(await workforceApi.wfoGetComplianceStatusReport());
          break;
        case 'expenses':
          setExpenses(await workforceApi.wfoGetExpenseAnalytics());
          break;
        case 'utilisation':
          setUtilisation(await workforceApi.wfoGetUtilisationAnalytics());
          break;
        case 'absenteeism':
          setAbsenteeism(await workforceApi.wfoGetAbsenteeismReport());
          break;
      }
    } catch {
      // Empty fallback on connection failure
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReportData(activeReport);
  }, [activeReport, loadReportData]);

  const reportTabs = [
    { id: 'staffing' as ReportType, label: 'Staffing & Fills' },
    { id: 'time-labour' as ReportType, label: 'Time & Labour' },
    { id: 'payroll' as ReportType, label: 'Payroll Summary' },
    { id: 'compliance' as ReportType, label: 'Compliance Status' },
    { id: 'expenses' as ReportType, label: 'Frontline Expenses' },
    { id: 'utilisation' as ReportType, label: 'Worker Utilisation' },
    { id: 'absenteeism' as ReportType, label: 'Attendance & No-Show' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Heading level="h2">Workforce Operational Analytics</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Analytics Studio integrated reporting engine for workforce staffing, time, payroll, compliance, and frontline attendance.
          </Text>
        </div>
        <Button size="small" variant="secondary" onClick={() => loadReportData(activeReport)} disabled={loading}>
          Refresh Report
        </Button>
      </div>

      {/* Report Nav Pills */}
      <div className="flex flex-wrap gap-2 border-b border-ui-border-base pb-3">
        {reportTabs.map((tab) => (
          <Button
            key={tab.id}
            size="small"
            variant={activeReport === tab.id ? 'primary' : 'secondary'}
            onClick={() => setActiveReport(tab.id)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {loading ? (
        <Container className="p-8 text-center text-ui-fg-subtle">
          Generating operational report...
        </Container>
      ) : (
        <Container className="p-0 overflow-hidden border rounded-lg border-ui-border-base">
          {activeReport === 'staffing' && (
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Engagement</Table.HeaderCell>
                  <Table.HeaderCell>Position</Table.HeaderCell>
                  <Table.HeaderCell>Required</Table.HeaderCell>
                  <Table.HeaderCell>Filled</Table.HeaderCell>
                  <Table.HeaderCell>Fill Rate</Table.HeaderCell>
                  <Table.HeaderCell>Status</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {staffing.length === 0 ? (
                  <Table.Row>
                    <Table.Cell className="text-center text-ui-fg-subtle py-8">
                      No engagement positions currently active.
                    </Table.Cell>
                  </Table.Row>
                ) : (
                  staffing.map((r, i) => (
                    <Table.Row key={i}>
                      <Table.Cell className="font-medium">{r.engagementTitle}</Table.Cell>
                      <Table.Cell>{r.positionTitle}</Table.Cell>
                      <Table.Cell>{r.requiredHeadcount}</Table.Cell>
                      <Table.Cell>{r.filledHeadcount}</Table.Cell>
                      <Table.Cell>
                        <Badge color={r.fillRatePct >= 100 ? 'green' : r.fillRatePct > 50 ? 'orange' : 'red'}>
                          {r.fillRatePct}%
                        </Badge>
                      </Table.Cell>
                      <Table.Cell>
                        <StatusBadge color={r.status === 'PUBLISHED' ? 'green' : 'grey'}>
                          {r.status}
                        </StatusBadge>
                      </Table.Cell>
                    </Table.Row>
                  ))
                )}
              </Table.Body>
            </Table>
          )}

          {activeReport === 'time-labour' && (
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Worker</Table.HeaderCell>
                  <Table.HeaderCell>Total Punches</Table.HeaderCell>
                  <Table.HeaderCell>Regular Hours</Table.HeaderCell>
                  <Table.HeaderCell>OT Hours</Table.HeaderCell>
                  <Table.HeaderCell>Total Recorded</Table.HeaderCell>
                  <Table.HeaderCell>Exceptions</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {timeLabour.length === 0 ? (
                  <Table.Row>
                    <Table.Cell className="text-center text-ui-fg-subtle py-8">
                      No punch or time records found.
                    </Table.Cell>
                  </Table.Row>
                ) : (
                  timeLabour.map((r) => (
                    <Table.Row key={r.workerId}>
                      <Table.Cell className="font-medium">{r.workerName}</Table.Cell>
                      <Table.Cell>{r.totalPunches}</Table.Cell>
                      <Table.Cell>{r.regularHours}h</Table.Cell>
                      <Table.Cell>{r.overtimeHours}h</Table.Cell>
                      <Table.Cell className="font-semibold">{r.totalHours}h</Table.Cell>
                      <Table.Cell>
                        <Badge color={r.exceptionsCount > 0 ? 'red' : 'green'}>
                          {r.exceptionsCount} Exceptions
                        </Badge>
                      </Table.Cell>
                    </Table.Row>
                  ))
                )}
              </Table.Body>
            </Table>
          )}

          {activeReport === 'payroll' && (
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Period</Table.HeaderCell>
                  <Table.HeaderCell>Worker Headcount</Table.HeaderCell>
                  <Table.HeaderCell>Gross Pay</Table.HeaderCell>
                  <Table.HeaderCell>Expenses Reimbursed</Table.HeaderCell>
                  <Table.HeaderCell>Net Pay</Table.HeaderCell>
                  <Table.HeaderCell>Batch Status</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {payroll.map((r, i) => (
                  <Table.Row key={i}>
                    <Table.Cell className="font-medium">{r.periodName}</Table.Cell>
                    <Table.Cell>{r.workerCount} Workers</Table.Cell>
                    <Table.Cell>${r.grossPay.toFixed(2)}</Table.Cell>
                    <Table.Cell>${r.totalExpenses.toFixed(2)}</Table.Cell>
                    <Table.Cell className="font-semibold text-ui-fg-interactive">${r.netPay.toFixed(2)}</Table.Cell>
                    <Table.Cell>
                      <StatusBadge color={r.status === 'APPROVED' || r.status === 'CLOSED' ? 'green' : 'orange'}>
                        {r.status}
                      </StatusBadge>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          )}

          {activeReport === 'compliance' && (
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Document Type</Table.HeaderCell>
                  <Table.HeaderCell>Total Submissions</Table.HeaderCell>
                  <Table.HeaderCell>Verified</Table.HeaderCell>
                  <Table.HeaderCell>Pending Review</Table.HeaderCell>
                  <Table.HeaderCell>Expired</Table.HeaderCell>
                  <Table.HeaderCell>Compliance Rate</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {compliance.length === 0 ? (
                  <Table.Row>
                    <Table.Cell className="text-center text-ui-fg-subtle py-8">
                      No compliance documents in registry.
                    </Table.Cell>
                  </Table.Row>
                ) : (
                  compliance.map((r, i) => (
                    <Table.Row key={i}>
                      <Table.Cell className="font-medium">{r.documentName}</Table.Cell>
                      <Table.Cell>{r.totalUploaded}</Table.Cell>
                      <Table.Cell className="text-ui-fg-interactive font-medium">{r.verifiedCount}</Table.Cell>
                      <Table.Cell>{r.pendingCount}</Table.Cell>
                      <Table.Cell className={r.expiredCount > 0 ? 'text-ui-fg-error font-medium' : ''}>{r.expiredCount}</Table.Cell>
                      <Table.Cell>
                        <Badge color={r.complianceRatePct >= 90 ? 'green' : r.complianceRatePct >= 70 ? 'orange' : 'red'}>
                          {r.complianceRatePct}%
                        </Badge>
                      </Table.Cell>
                    </Table.Row>
                  ))
                )}
              </Table.Body>
            </Table>
          )}

          {activeReport === 'expenses' && (
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Expense Type</Table.HeaderCell>
                  <Table.HeaderCell>Reports</Table.HeaderCell>
                  <Table.HeaderCell>Total Claimed</Table.HeaderCell>
                  <Table.HeaderCell>Approved</Table.HeaderCell>
                  <Table.HeaderCell>Pending</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {expenses.length === 0 ? (
                  <Table.Row>
                    <Table.Cell className="text-center text-ui-fg-subtle py-8">
                      No expense claims filed.
                    </Table.Cell>
                  </Table.Row>
                ) : (
                  expenses.map((r, i) => (
                    <Table.Row key={i}>
                      <Table.Cell className="font-medium">{r.expenseType}</Table.Cell>
                      <Table.Cell>{r.totalReports}</Table.Cell>
                      <Table.Cell className="font-semibold">${r.totalAmount.toFixed(2)}</Table.Cell>
                      <Table.Cell className="text-ui-fg-interactive">${r.approvedAmount.toFixed(2)}</Table.Cell>
                      <Table.Cell>${r.pendingAmount.toFixed(2)}</Table.Cell>
                    </Table.Row>
                  ))
                )}
              </Table.Body>
            </Table>
          )}

          {activeReport === 'utilisation' && (
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Worker</Table.HeaderCell>
                  <Table.HeaderCell>Scheduled Hours</Table.HeaderCell>
                  <Table.HeaderCell>Worked Hours</Table.HeaderCell>
                  <Table.HeaderCell>Shifts Completed</Table.HeaderCell>
                  <Table.HeaderCell>Utilisation Rate</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {utilisation.length === 0 ? (
                  <Table.Row>
                    <Table.Cell className="text-center text-ui-fg-subtle py-8">
                      No worker records found.
                    </Table.Cell>
                  </Table.Row>
                ) : (
                  utilisation.map((r) => (
                    <Table.Row key={r.workerId}>
                      <Table.Cell className="font-medium">{r.workerName}</Table.Cell>
                      <Table.Cell>{r.scheduledHours}h</Table.Cell>
                      <Table.Cell>{r.workedHours}h</Table.Cell>
                      <Table.Cell>{r.shiftsCompleted}</Table.Cell>
                      <Table.Cell>
                        <Badge color={r.utilisationPct >= 90 ? 'green' : r.utilisationPct >= 70 ? 'blue' : 'orange'}>
                          {r.utilisationPct}%
                        </Badge>
                      </Table.Cell>
                    </Table.Row>
                  ))
                )}
              </Table.Body>
            </Table>
          )}

          {activeReport === 'absenteeism' && (
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Worker</Table.HeaderCell>
                  <Table.HeaderCell>Scheduled Shifts</Table.HeaderCell>
                  <Table.HeaderCell>Attended Shifts</Table.HeaderCell>
                  <Table.HeaderCell>Missed / Cancelled</Table.HeaderCell>
                  <Table.HeaderCell>No-Show Rate</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {absenteeism.length === 0 ? (
                  <Table.Row>
                    <Table.Cell className="text-center text-ui-fg-subtle py-8">
                      No shift records found.
                    </Table.Cell>
                  </Table.Row>
                ) : (
                  absenteeism.map((r) => (
                    <Table.Row key={r.workerId}>
                      <Table.Cell className="font-medium">{r.workerName}</Table.Cell>
                      <Table.Cell>{r.scheduledShifts}</Table.Cell>
                      <Table.Cell>{r.attendedShifts}</Table.Cell>
                      <Table.Cell>{r.missedShifts}</Table.Cell>
                      <Table.Cell>
                        <Badge color={r.noShowRatePct === 0 ? 'green' : 'red'}>
                          {r.noShowRatePct}% No-Show
                        </Badge>
                      </Table.Cell>
                    </Table.Row>
                  ))
                )}
              </Table.Body>
            </Table>
          )}
        </Container>
      )}
    </div>
  );
}
