import type {
  PayExportReconciliationV1,
  PayExportV1,
  PayPolicyPackV1,
  PayRateV1,
  PayRunDetailV1,
  PayRunV1,
  PayRunVerificationV1,
  SetPayRateV1,
  PunchV1,
  RecordPunchV1,
  RecordTimeCorrectionV1,
  TimeCorrectionV1,
  TimeExceptionV1,
  TimesheetDetailV1,
  TimesheetPreviewV1,
  TimesheetV1,
  BookingCandidateV1,
  BookingV1,
  CreateBookingV1,
  CreateWorkRequirementV1,
  WorkRequirementDetailV1,
  WorkRequirementV1,
  AbsenceTypeV1,
  AbsenceV1,
  AvailabilityPatternV1,
  AvailabilityV1,
  CreateAbsenceTypeV1,
  CreateAvailabilityPatternV1,
  CreateWorkingCalendarV1,
  RequestAbsenceV1,
  WorkingCalendarV1,
  CreateEngagementV1,
  CreateJobProfileV1,
  CreatePositionV1,
  EndEngagementV1,
  EngagementV1,
  JobProfileDetailV1,
  JobProfileV1,
  PositionDetailV1,
  PositionV1,
  ReviseJobProfileV1,
  UpdatePositionV1,
  AssignResourceCapabilityV1,
  CapabilityDefinitionV1,
  CreateCapabilityDefinitionV1,
  CreateWorkforceResourceV1,
  ResourceQualificationV1,
  UpdateWorkforceResourceV1,
  WorkforceRecordStatusV1,
  WorkforceResourceDetailV1,
  WorkforceResourcePageV1,
  WorkforceResourceTypeV1,
} from '@gigalibs/contracts';

export interface WorkforceApiError extends Error {
  status?: number;
  errorCode?: string;
  detail?: string;
}

interface CapabilityDefinitionPage {
  readonly items: readonly CapabilityDefinitionV1[];
  readonly generatedAt: string;
}

export async function requestWorkforce<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `/api/workforce${path.startsWith('/') ? path : `/${path}`}`;
  const headers = new Headers(options.headers);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  const response = await fetch(url, { ...options, headers, cache: 'no-store' });

  if (!response.ok) {
    if (response.status === 401 && typeof window !== 'undefined') window.location.assign('/login');
    const payload: unknown = await response.json().catch(() => null);
    const body = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
    const nested = body.message && typeof body.message === 'object'
      ? body.message as Record<string, unknown>
      : null;
    const issues = Array.isArray(nested?.issues) ? (nested.issues as { path?: unknown; message?: unknown }[]) : [];
    const issue = issues[0] && stringValue(issues[0].message)
      ? `${stringValue(issues[0].path) ? `${String(issues[0].path)}: ` : ''}${String(issues[0].message)}`
      : undefined;
    const detail = issue ?? stringValue(nested?.message) ?? stringValue(body.detail) ??
      stringValue(body.title) ?? stringValue(body.message) ?? `Workforce API error (${response.status})`;
    const error = new Error(detail) as WorkforceApiError;
    error.status = response.status;
    error.errorCode = stringValue(nested?.code) ?? stringValue(body.code);
    error.detail = detail;
    throw error;
  }
  return await response.json() as T;
}

export const workforceApi = {
  listResources: (params?: {
    q?: string;
    resourceType?: WorkforceResourceTypeV1;
    status?: WorkforceRecordStatusV1;
    page?: number;
    pageSize?: number;
  }) => {
    const search = new URLSearchParams();
    if (params?.q) search.set('q', params.q);
    if (params?.resourceType) search.set('resourceType', params.resourceType);
    if (params?.status) search.set('status', params.status);
    if (params?.page) search.set('page', String(params.page));
    if (params?.pageSize) search.set('pageSize', String(params.pageSize));
    const query = search.toString();
    return requestWorkforce<WorkforceResourcePageV1>(`/resources${query ? `?${query}` : ''}`);
  },
  getResource: (id: string) =>
    requestWorkforce<WorkforceResourceDetailV1>(`/resources/${encodeURIComponent(id)}`),
  createResource: (input: CreateWorkforceResourceV1) =>
    requestWorkforce<WorkforceResourceDetailV1>('/resources', jsonRequest('POST', input)),
  updateResource: (id: string, input: UpdateWorkforceResourceV1) =>
    requestWorkforce<WorkforceResourceDetailV1>(
      `/resources/${encodeURIComponent(id)}`,
      jsonRequest('PATCH', input),
    ),
  listCapabilities: () => requestWorkforce<CapabilityDefinitionPage>('/capabilities'),
  createCapability: (input: CreateCapabilityDefinitionV1) =>
    requestWorkforce<CapabilityDefinitionV1>('/capabilities', jsonRequest('POST', input)),
  assignCapability: (resourceId: string, input: AssignResourceCapabilityV1) =>
    requestWorkforce<ResourceQualificationV1>(
      `/resources/${encodeURIComponent(resourceId)}/capabilities`,
      jsonRequest('POST', input),
    ),

  // WI-OI-065: job profiles, positions and engagements (calendar dates, as-of reads).
  listJobProfiles: (asOf?: string) =>
    requestWorkforce<{ items: JobProfileV1[]; asOf: string }>(`/job-profiles${asOf ? `?asOf=${asOf}` : ''}`),
  getJobProfile: (id: string) => requestWorkforce<JobProfileDetailV1>(`/job-profiles/${encodeURIComponent(id)}`),
  createJobProfile: (input: CreateJobProfileV1) =>
    requestWorkforce<JobProfileDetailV1>('/job-profiles', jsonRequest('POST', input)),
  reviseJobProfile: (id: string, input: ReviseJobProfileV1) =>
    requestWorkforce<JobProfileDetailV1>(`/job-profiles/${encodeURIComponent(id)}/revisions`, jsonRequest('POST', input)),
  setJobProfileStatus: (id: string, input: { expectedVersion: number; status: 'ACTIVE' | 'INACTIVE' }) =>
    requestWorkforce<JobProfileDetailV1>(`/job-profiles/${encodeURIComponent(id)}`, jsonRequest('PATCH', input)),
  listPositions: (params: { asOf?: string; vacantOnly?: boolean } = {}) => {
    const search = new URLSearchParams();
    if (params.asOf) search.set('asOf', params.asOf);
    if (params.vacantOnly) search.set('vacantOnly', 'true');
    const query = search.toString();
    return requestWorkforce<{ items: PositionV1[]; asOf: string }>(`/positions${query ? `?${query}` : ''}`);
  },
  getPosition: (id: string) => requestWorkforce<PositionDetailV1>(`/positions/${encodeURIComponent(id)}`),
  createPosition: (input: CreatePositionV1) => requestWorkforce<PositionDetailV1>('/positions', jsonRequest('POST', input)),
  updatePosition: (id: string, input: UpdatePositionV1) =>
    requestWorkforce<PositionDetailV1>(`/positions/${encodeURIComponent(id)}`, jsonRequest('PATCH', input)),
  listEngagements: (params: { resourceId?: string; positionId?: string } = {}) => {
    const search = new URLSearchParams(Object.entries(params).filter(([, value]) => value) as [string, string][]);
    const query = search.toString();
    return requestWorkforce<{ items: EngagementV1[] }>(`/engagements${query ? `?${query}` : ''}`);
  },
  createEngagement: (input: CreateEngagementV1) =>
    requestWorkforce<PositionDetailV1>('/engagements', jsonRequest('POST', input)),
  endEngagement: (id: string, input: EndEngagementV1) =>
    requestWorkforce<PositionDetailV1>(`/engagements/${encodeURIComponent(id)}/end`, jsonRequest('POST', input)),
  cancelEngagement: (id: string, input: { expectedVersion: number; reason: string }) =>
    requestWorkforce<PositionDetailV1>(`/engagements/${encodeURIComponent(id)}/cancel`, jsonRequest('POST', input)),

  // WI-OI-066: availability patterns, absences and working calendars.
  listPatterns: (resourceId: string) =>
    requestWorkforce<{ items: AvailabilityPatternV1[] }>(`/availability-patterns?resourceId=${encodeURIComponent(resourceId)}`),
  createPattern: (input: CreateAvailabilityPatternV1) =>
    requestWorkforce<AvailabilityPatternV1>('/availability-patterns', jsonRequest('POST', input)),
  endPattern: (id: string, input: { expectedVersion: number; effectiveTo: string }) =>
    requestWorkforce<AvailabilityPatternV1>(`/availability-patterns/${encodeURIComponent(id)}/end`, jsonRequest('POST', input)),
  availability: (resourceId: string, from: string, to: string) =>
    requestWorkforce<AvailabilityV1>(
      `/availability?${new URLSearchParams({ resourceId, from, to }).toString()}`,
    ),
  listAbsenceTypes: () => requestWorkforce<{ items: AbsenceTypeV1[] }>('/absence-types'),
  createAbsenceType: (input: CreateAbsenceTypeV1) => requestWorkforce<AbsenceTypeV1>('/absence-types', jsonRequest('POST', input)),
  listAbsences: (params: { resourceId?: string; status?: string } = {}) => {
    const search = new URLSearchParams(Object.entries(params).filter(([, value]) => value) as [string, string][]);
    const query = search.toString();
    return requestWorkforce<{ items: AbsenceV1[] }>(`/absences${query ? `?${query}` : ''}`);
  },
  requestAbsence: (input: RequestAbsenceV1) => requestWorkforce<AbsenceV1>('/absences', jsonRequest('POST', input)),
  decideAbsence: (id: string, decision: 'approve' | 'reject' | 'cancel', input: { expectedVersion: number; reason?: string }) =>
    requestWorkforce<AbsenceV1>(`/absences/${encodeURIComponent(id)}/${decision}`, jsonRequest('POST', input)),
  listCalendars: () => requestWorkforce<{ items: WorkingCalendarV1[] }>('/working-calendars'),
  createCalendar: (input: CreateWorkingCalendarV1) => requestWorkforce<WorkingCalendarV1>('/working-calendars', jsonRequest('POST', input)),
  addClosure: (calendarId: string, input: { closureDate: string; label: string }) =>
    requestWorkforce<WorkingCalendarV1>(`/working-calendars/${encodeURIComponent(calendarId)}/closures`, jsonRequest('POST', input)),
  withdrawClosure: (calendarId: string, closureId: string) =>
    requestWorkforce<WorkingCalendarV1>(
      `/working-calendars/${encodeURIComponent(calendarId)}/closures/${encodeURIComponent(closureId)}/withdraw`,
      jsonRequest('POST', {}),
    ),

  // WI-OI-067: demand requirements and bookings.
  listRequirements: (params: { status?: string; from?: string; to?: string } = {}) => {
    const search = new URLSearchParams(Object.entries(params).filter(([, value]) => value) as [string, string][]);
    const query = search.toString();
    return requestWorkforce<{ items: WorkRequirementV1[] }>(`/work-requirements${query ? `?${query}` : ''}`);
  },
  getRequirement: (id: string) => requestWorkforce<WorkRequirementDetailV1>(`/work-requirements/${encodeURIComponent(id)}`),
  createRequirement: (input: CreateWorkRequirementV1) =>
    requestWorkforce<WorkRequirementDetailV1>('/work-requirements', jsonRequest('POST', input)),
  cancelRequirement: (id: string, input: { expectedVersion: number; reason: string }) =>
    requestWorkforce<WorkRequirementDetailV1>(`/work-requirements/${encodeURIComponent(id)}/cancel`, jsonRequest('POST', input)),
  candidates: (id: string) => requestWorkforce<{ items: BookingCandidateV1[] }>(`/work-requirements/${encodeURIComponent(id)}/candidates`),
  createBooking: (input: CreateBookingV1) => requestWorkforce<BookingV1>('/bookings', jsonRequest('POST', input)),
  changeBookingStatus: (id: string, input: { expectedVersion: number; status: string; reason?: string }) =>
    requestWorkforce<BookingV1>(`/bookings/${encodeURIComponent(id)}/status`, jsonRequest('POST', input)),

  // WI-OI-069: time and attendance. The BFF adds the geofence evidence to a punch; the browser never sends it.
  recordPunch: (input: Omit<RecordPunchV1, 'geofence'>) => requestWorkforce<PunchV1>('/punches', jsonRequest('POST', input)),
  listPunches: (params: { resourceId?: string; from: string; to: string }) =>
    requestWorkforce<{ items: PunchV1[] }>(`/punches?${query(params)}`),
  timesheetPreview: (params: { resourceId?: string; periodStart: string }) =>
    requestWorkforce<TimesheetPreviewV1>(`/timesheets/preview?${query(params)}`),
  listTimesheets: (params: { status?: string; periodStart?: string; resourceId?: string } = {}) =>
    requestWorkforce<{ items: TimesheetV1[] }>(`/timesheets${query(params) ? `?${query(params)}` : ''}`),
  getTimesheet: (id: string) => requestWorkforce<TimesheetDetailV1>(`/timesheets/${encodeURIComponent(id)}`),
  submitTimesheet: (input: { resourceId: string; periodStart: string }) =>
    requestWorkforce<TimesheetDetailV1>('/timesheets', jsonRequest('POST', input)),
  approveTimesheet: (id: string, expectedVersion: number) =>
    requestWorkforce<TimesheetDetailV1>(`/timesheets/${encodeURIComponent(id)}/approve`, jsonRequest('POST', { expectedVersion })),
  rejectTimesheet: (id: string, expectedVersion: number, reason: string) =>
    requestWorkforce<TimesheetDetailV1>(`/timesheets/${encodeURIComponent(id)}/reject`, jsonRequest('POST', { expectedVersion, reason })),
  correctTime: (input: RecordTimeCorrectionV1) => requestWorkforce<TimeCorrectionV1>('/time-corrections', jsonRequest('POST', input)),
  listTimeExceptions: (params: { status?: string; resourceId?: string; from?: string; to?: string } = {}) =>
    requestWorkforce<{ items: TimeExceptionV1[] }>(`/time-exceptions${query(params) ? `?${query(params)}` : ''}`),
  resolveTimeException: (id: string, input: { expectedVersion: number; resolution: string; note: string }) =>
    requestWorkforce<TimeExceptionV1>(`/time-exceptions/${encodeURIComponent(id)}/resolve`, jsonRequest('POST', input)),

  // WI-OI-070: pay policy packs, rates and calculation runs.
  payPacks: () => requestWorkforce<{ items: PayPolicyPackV1[]; referencePacksEnabled: boolean }>('/pay-packs'),
  payRates: (resourceId?: string) => requestWorkforce<{ items: PayRateV1[] }>(`/pay-rates${resourceId ? `?${query({ resourceId })}` : ''}`),
  setPayRate: (input: SetPayRateV1) => requestWorkforce<PayRateV1>('/pay-rates', jsonRequest('POST', input)),
  payRuns: (params: { periodStart?: string; status?: string } = {}) =>
    requestWorkforce<{ items: PayRunV1[] }>(`/pay-runs${query(params) ? `?${query(params)}` : ''}`),
  payRun: (id: string) => requestWorkforce<PayRunDetailV1>(`/pay-runs/${encodeURIComponent(id)}`),
  calculatePayRun: (input: { requestKey: string; periodStart: string }) => requestWorkforce<PayRunDetailV1>('/pay-runs', jsonRequest('POST', input)),
  approvePayRun: (id: string, expectedVersion: number) =>
    requestWorkforce<PayRunDetailV1>(`/pay-runs/${encodeURIComponent(id)}/approve`, jsonRequest('POST', { expectedVersion })),
  voidPayRun: (id: string, expectedVersion: number, reason: string) =>
    requestWorkforce<PayRunDetailV1>(`/pay-runs/${encodeURIComponent(id)}/void`, jsonRequest('POST', { expectedVersion, reason })),
  verifyPayRun: (id: string) => requestWorkforce<PayRunVerificationV1>(`/pay-runs/${encodeURIComponent(id)}/verification`),

  // WI-OI-071: payroll exports and reconciliation. The file itself is a plain download link (`payExportFileUrl`).
  createPayExport: (runId: string) => requestWorkforce<PayExportV1>(`/pay-runs/${encodeURIComponent(runId)}/exports`, jsonRequest('POST', { format: 'PAYROLL_CSV_V1' })),
  payExports: (runId: string) => requestWorkforce<{ items: PayExportV1[] }>(`/pay-exports?${query({ runId })}`),
  payExportReconciliation: (id: string) => requestWorkforce<PayExportReconciliationV1>(`/pay-exports/${encodeURIComponent(id)}/reconciliation`),
  acknowledgePayExport: (id: string, input: { expectedVersion: number; targetReference: string; reportedLineCount: number; reportedTotals: { currency: string; amountMinor: number }[] }) =>
    requestWorkforce<PayExportV1>(`/pay-exports/${encodeURIComponent(id)}/acknowledge`, jsonRequest('POST', input)),

  // ─── Universal WorkforceOps (WI-WFO-001) ──────────────────────────────────
  wfoListWorkers: (params: { status?: string; workerType?: string; orgUnitId?: string; search?: string; page?: string; limit?: string } = {}) =>
    requestWorkforce<{ items: any[]; total: number }>(`/wfo/workers?${query(params)}`),
  wfoGetWorker: (id: string) =>
    requestWorkforce<any>(`/wfo/workers/${encodeURIComponent(id)}`),
  wfoCreateWorker: (input: any) =>
    requestWorkforce<any>('/wfo/workers', jsonRequest('POST', input)),
  wfoApproveWorker: (id: string) =>
    requestWorkforce<any>(`/wfo/workers/${encodeURIComponent(id)}/approve`, jsonRequest('POST', {})),
  wfoDeactivateWorker: (id: string) =>
    requestWorkforce<any>(`/wfo/workers/${encodeURIComponent(id)}/deactivate`, jsonRequest('POST', {})),
  wfoListComplianceDocs: (workerId: string) =>
    requestWorkforce<any[]>(`/wfo/workers/${encodeURIComponent(workerId)}/compliance-docs`),
  wfoAddComplianceDoc: (workerId: string, input: any) =>
    requestWorkforce<any>(`/wfo/workers/${encodeURIComponent(workerId)}/compliance-docs`, jsonRequest('POST', input)),
  wfoVerifyComplianceDoc: (workerId: string, docId: string, input: { decision: 'APPROVE' | 'REJECT'; notes?: string }) =>
    requestWorkforce<any>(`/wfo/workers/${encodeURIComponent(workerId)}/compliance-docs/${encodeURIComponent(docId)}/verify`, jsonRequest('POST', input)),

  wfoListEngagements: (params: { orgUnitId?: string; clientId?: string; status?: string; engagementType?: string; dateFrom?: string; dateTo?: string } = {}) =>
    requestWorkforce<{ items: any[]; total: number }>(`/wfo/engagements?${query(params)}`),
  wfoGetEngagement: (id: string) =>
    requestWorkforce<any>(`/wfo/engagements/${encodeURIComponent(id)}`),
  wfoCreateEngagement: (input: any) =>
    requestWorkforce<any>('/wfo/engagements', jsonRequest('POST', input)),
  wfoPublishEngagement: (id: string) =>
    requestWorkforce<any>(`/wfo/engagements/${encodeURIComponent(id)}/publish`, jsonRequest('POST', {})),
  wfoListEngagementPositions: (engagementId: string) =>
    requestWorkforce<any[]>(`/wfo/engagements/${encodeURIComponent(engagementId)}/positions`),
  wfoCreateEngagementPosition: (engagementId: string, input: any) =>
    requestWorkforce<any>(`/wfo/engagements/${encodeURIComponent(engagementId)}/positions`, jsonRequest('POST', input)),

  // ─── Staffing & Bulk Invitations (WI-WFO-002) ─────────────────────────────
  wfoGetInvitationTemplateUrl: (engagementId: string) =>
    `/api/workforce/wfo/engagements/${encodeURIComponent(engagementId)}/invitations/template`,
  wfoPreviewBulkInvitations: (engagementId: string, rows: any[]) =>
    requestWorkforce<any>(`/wfo/engagements/${encodeURIComponent(engagementId)}/invitations/bulk-preview`, jsonRequest('POST', { rows })),
  wfoSubmitBulkInvitations: (engagementId: string, rows: any[]) =>
    requestWorkforce<any>(`/wfo/engagements/${encodeURIComponent(engagementId)}/invitations/bulk-submit`, jsonRequest('POST', { rows })),
  wfoListInvitations: (params: { engagementId?: string; positionId?: string; workerId?: string; status?: string } = {}) =>
    requestWorkforce<any[]>(`/wfo/invitations?${query(params)}`),
  wfoRespondInvitation: (id: string, input: { decision: 'ACCEPT' | 'DECLINE'; reason?: string }) =>
    requestWorkforce<any>(`/wfo/invitations/${encodeURIComponent(id)}/respond`, jsonRequest('POST', input)),
  wfoGenerateContract: (engagementId: string, input: any) =>
    requestWorkforce<any>(`/wfo/engagements/${encodeURIComponent(engagementId)}/contracts/generate`, jsonRequest('POST', input)),
  wfoSignContract: (id: string, input: { signatureHash: string }) =>
    requestWorkforce<any>(`/wfo/contracts/${encodeURIComponent(id)}/sign`, jsonRequest('POST', input)),
  wfoApproveContract: (id: string) =>
    requestWorkforce<any>(`/wfo/contracts/${encodeURIComponent(id)}/approve`, jsonRequest('POST', {})),

  // ─── Expenses & Payroll Admin (WI-WFO-003) ────────────────────────────────
  wfoCalculateMileage: (miles: number) =>
    requestWorkforce<{ miles: number; ratePerMile: number; reimbursementAmount: number }>(`/wfo/expenses/mileage-calculate?miles=${miles}`),
  wfoCreateExpenseReport: (input: any) =>
    requestWorkforce<any>('/wfo/expenses', jsonRequest('POST', input)),
  wfoListExpenseReports: (params: { workerId?: string; engagementId?: string; status?: string } = {}) =>
    requestWorkforce<any[]>(`/wfo/expenses?${query(params)}`),
  wfoAddExpenseLine: (reportId: string, input: any) =>
    requestWorkforce<any>(`/wfo/expenses/${encodeURIComponent(reportId)}/lines`, jsonRequest('POST', input)),
  wfoVerifyExpenseLine: (reportId: string, lineId: string, input: { decision: 'APPROVE' | 'REJECT'; reason?: string }) =>
    requestWorkforce<any>(`/wfo/expenses/${encodeURIComponent(reportId)}/lines/${encodeURIComponent(lineId)}/verify`, jsonRequest('POST', input)),
  wfoGetPayrollGrid: (periodStart?: string) =>
    requestWorkforce<any>(`/wfo/payroll/grid${periodStart ? `?periodStart=${encodeURIComponent(periodStart)}` : ''}`),
  wfoGenerateErpGlBatch: (periodStart?: string) =>
    requestWorkforce<any>(`/wfo/payroll/erp-gl-batch${periodStart ? `?periodStart=${encodeURIComponent(periodStart)}` : ''}`, jsonRequest('POST', {})),

  // ─── Demand Forecasting & Shift Self-Service (WI-WFO-004) ────────────────────
  wfoGetForecast: (params: { startDate?: string; endDate?: string; orgUnitId?: string; skillId?: string; horizon?: string } = {}) =>
    requestWorkforce<any[]>(`/wfo/planning/forecast?${query(params)}`),
  wfoGetGaps: (params: { startDate?: string; endDate?: string; orgUnitId?: string; skillId?: string; horizon?: string } = {}) =>
    requestWorkforce<any[]>(`/wfo/planning/gaps?${query(params)}`),
  wfoGetUtilisation: (orgUnitId?: string, period?: string) =>
    requestWorkforce<any>(`/wfo/planning/utilisation?${query({ orgUnitId, period })}`),
  wfoRecalculateForecast: (input: { orgUnitId?: string; source?: string; horizonDays?: number } = {}) =>
    requestWorkforce<any>('/wfo/planning/forecast/recalculate', jsonRequest('POST', input)),
  wfoListOpenShifts: (params: { orgUnitId?: string; skillId?: string } = {}) =>
    requestWorkforce<any[]>(`/wfo/shifts/open?${query(params)}`),
  wfoClaimShift: (bookingId: string, input: { workerId?: string; notes?: string } = {}) =>
    requestWorkforce<any>(`/wfo/shifts/${encodeURIComponent(bookingId)}/pickup`, jsonRequest('POST', input)),
  wfoCreateShiftSwap: (input: { fromBookingId: string; fromWorkerId: string; toWorkerId: string; reason?: string }) =>
    requestWorkforce<any>('/wfo/shift-swaps', jsonRequest('POST', input)),
  wfoListShiftSwaps: (status?: string) =>
    requestWorkforce<any[]>(`/wfo/shift-swaps${status ? `?status=${encodeURIComponent(status)}` : ''}`),
  wfoApproveShiftSwap: (id: string, input: { decision?: 'APPROVE' | 'REJECT'; reason?: string } = {}) =>
    requestWorkforce<any>(`/wfo/shift-swaps/${encodeURIComponent(id)}/approve`, jsonRequest('POST', input)),

  // ─── Compliance, Communications & Vendors (WI-WFO-005) ───────────────────────
  wfoGetComplianceDashboard: () =>
    requestWorkforce<any>('/wfo/compliance/dashboard'),
  wfoGetComplianceAuditReport: () =>
    requestWorkforce<any[]>('/wfo/compliance/audit-report'),
  wfoGetComplianceVerifyQueue: () =>
    requestWorkforce<any[]>('/wfo/compliance/verify-queue'),
  wfoSendMessage: (input: any) =>
    requestWorkforce<any>('/wfo/comms/send', jsonRequest('POST', input)),
  wfoListCommsHistory: (params: { channel?: string; limit?: number } = {}) =>
    requestWorkforce<any[]>(`/wfo/comms/history?${query(params as any)}`),
  wfoListVendors: () =>
    requestWorkforce<any[]>('/wfo/vendors'),
  wfoCreateVendor: (input: any) =>
    requestWorkforce<any>('/wfo/vendors', jsonRequest('POST', input)),
  wfoGetVendor: (id: string) =>
    requestWorkforce<any>(`/wfo/vendors/${encodeURIComponent(id)}`),
  wfoCreateSupportTicket: (input: any) =>
    requestWorkforce<any>('/wfo/support/tickets', jsonRequest('POST', input)),
  wfoListSupportTickets: (status?: string) =>
    requestWorkforce<any[]>(`/wfo/support/tickets${status ? `?status=${encodeURIComponent(status)}` : ''}`),

  // ─── Industry Packs & Reports (WI-WFO-006) ──────────────────────────────────
  wfoListPacks: () =>
    requestWorkforce<any[]>('/wfo/packs'),
  wfoActivatePack: (packId: string, countryCode = 'US') =>
    requestWorkforce<any>(`/wfo/packs/${encodeURIComponent(packId)}/activate`, jsonRequest('POST', { countryCode })),
  wfoGetStaffingReport: () =>
    requestWorkforce<any[]>('/wfo/reports/staffing'),
  wfoGetTimeLabourReport: () =>
    requestWorkforce<any[]>('/wfo/reports/time-labour'),
  wfoGetPayrollSummaryReport: () =>
    requestWorkforce<any[]>('/wfo/reports/payroll-summary'),
  wfoGetComplianceStatusReport: () =>
    requestWorkforce<any[]>('/wfo/reports/compliance-status'),
  wfoGetExpenseAnalytics: () =>
    requestWorkforce<any[]>('/wfo/reports/expenses'),
  wfoGetUtilisationAnalytics: () =>
    requestWorkforce<any[]>('/wfo/reports/utilisation'),
  wfoGetAbsenteeismReport: () =>
    requestWorkforce<any[]>('/wfo/reports/absenteeism'),
};

export const payExportFileUrl = (id: string) => `/api/workforce/pay-exports/${encodeURIComponent(id)}/file`;

function query(params: Readonly<Record<string, string | undefined>>): string {
  return new URLSearchParams(Object.entries(params).filter((entry): entry is [string, string] => Boolean(entry[1]))).toString();
}

function jsonRequest(method: 'POST' | 'PATCH', body: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}
