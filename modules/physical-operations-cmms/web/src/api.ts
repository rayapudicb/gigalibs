import type {
  CmmsAssetClassificationV1,
  CmmsAssetSpecValueV1,
  CmmsAssetV1,
  CmmsClassificationTreeV1,
  CmmsEquipmentNodeV1,
  CmmsFailureCodeV1,
  CmmsFailureHierarchyNodeV1,
  CmmsInventorySummaryV1,
  CmmsMeterReadingV1,
  CmmsMeterV1,
  CmmsJobPlanV1,
  CmmsPageV1,
  CmmsPartV1,
  CmmsPmScheduleV1,
  CmmsSpaceTreeV1,
  CmmsSpaceV1,
  CmmsSpecDefinitionV1,
  CmmsStockMovementV1,
  CmmsWorkOrderDetailV1,
  CmmsWorkOrderEventV1,
  CmmsWorkOrderOverviewV1,
  CmmsWorkOrderV1,
} from '@gigalibs/contracts';

/** A failed CMMS call with the HTTP status, problem code and field issues the UI shows. */
export interface CmmsApiError extends Error {
  status?: number;
  errorCode?: string;
  issues?: readonly { path: string; message: string }[];
}

export async function requestCmms<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `/api/cmms/v1${path.startsWith('/') ? path : `/${path}`}`;
  const headers = new Headers(options.headers);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  const response = await fetch(url, { ...options, headers, cache: 'no-store' });
  if (!response.ok) {
    if (response.status === 401 && typeof window !== 'undefined') window.location.assign('/login');
    const payload: unknown = await response.json().catch(() => null);
    const body = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
    const nested =
      body.message && typeof body.message === 'object'
        ? (body.message as Record<string, unknown>)
        : body;
    const issues = Array.isArray(nested.issues)
      ? (nested.issues as { path: string; message: string }[])
      : undefined;
    const detail =
      (issues?.[0]
        ? `${issues[0].path ? `${issues[0].path}: ` : ''}${issues[0].message}`
        : undefined) ??
      text(nested.message) ??
      text(body.title) ??
      `CMMS request failed (${response.status}).`;
    const error = new Error(detail) as CmmsApiError;
    error.status = response.status;
    error.errorCode = text(nested.code) ?? text(body.code);
    error.issues = issues;
    throw error;
  }
  return (await response.json()) as T;
}

const post = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
const patch = (body: unknown): RequestInit => ({
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
const id = (value: string) => encodeURIComponent(value);

export const cmmsApi = {
  overview: () => requestCmms<CmmsWorkOrderOverviewV1>('/analytics/work-orders/overview'),
  inventory: () => requestCmms<CmmsInventorySummaryV1>('/analytics/inventory/summary'),
  listSpaceTree: () => requestCmms<{ items: CmmsSpaceTreeV1[] }>('/spaces/tree'),
  getSpace: (spaceId: string) => requestCmms<CmmsSpaceV1>(`/spaces/${id(spaceId)}`),
  createSpace: (input: Record<string, unknown>) => requestCmms<CmmsSpaceV1>('/spaces', post(input)),
  updateSpace: (spaceId: string, input: Record<string, unknown>) =>
    requestCmms<CmmsSpaceV1>(`/spaces/${id(spaceId)}`, patch(input)),
  deleteSpace: (spaceId: string) =>
    requestCmms<{ success: boolean }>(`/spaces/${id(spaceId)}`, { method: 'DELETE' }),
  getSpaceAssets: (spaceId: string) =>
    requestCmms<{ items: CmmsAssetV1[] }>(`/spaces/${id(spaceId)}/assets`),
  uploadCadLayer: (spaceId: string, input: Record<string, unknown>) =>
    requestCmms<CmmsSpaceV1>(`/spaces/${id(spaceId)}/cad-layer`, post(input)),

  searchAssets: (query: Record<string, unknown> = {}) =>
    requestCmms<CmmsPageV1<CmmsAssetV1>>('/assets/search', post(query)),
  getAsset: (assetId: string) => requestCmms<CmmsAssetV1>(`/assets/${id(assetId)}`),
  createAsset: (input: Record<string, unknown>) => requestCmms<CmmsAssetV1>('/assets', post(input)),
  updateAsset: (assetId: string, input: Record<string, unknown>) =>
    requestCmms<CmmsAssetV1>(`/assets/${id(assetId)}`, patch(input)),
  archiveAsset: (assetId: string, input: { expectedVersion: number; reason: string }) =>
    requestCmms<CmmsAssetV1>(`/assets/${id(assetId)}/archive`, post(input)),
  getAssetSpecs: (assetId: string) =>
    requestCmms<{ items: CmmsAssetSpecValueV1[] }>(`/assets/${id(assetId)}/specs`),
  setAssetSpecs: (assetId: string, input: { specs: readonly unknown[] }) =>
    requestCmms<{ items: CmmsAssetSpecValueV1[] }>(`/assets/${id(assetId)}/specs`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  getEquipmentTree: (assetId: string) =>
    requestCmms<CmmsEquipmentNodeV1>(`/assets/${id(assetId)}/equipment-tree`),
  cascadeStatus: (assetId: string, input: { targetStatus: string; reason: string }) =>
    requestCmms<{ affectedCount: number; affectedAssetIds: string[]; targetStatus: string }>(
      `/assets/${id(assetId)}/cascade-status`,
      post(input),
    ),

  listClassificationTree: () =>
    requestCmms<{ items: CmmsClassificationTreeV1[] }>('/classifications/tree'),
  getClassification: (classificationId: string) =>
    requestCmms<CmmsAssetClassificationV1>(`/classifications/${id(classificationId)}`),
  createClassification: (input: Record<string, unknown>) =>
    requestCmms<CmmsAssetClassificationV1>('/classifications', post(input)),
  updateClassification: (classificationId: string, input: Record<string, unknown>) =>
    requestCmms<CmmsAssetClassificationV1>(`/classifications/${id(classificationId)}`, patch(input)),
  deleteClassification: (classificationId: string) =>
    requestCmms<{ success: boolean }>(`/classifications/${id(classificationId)}`, { method: 'DELETE' }),
  listSpecDefs: (classificationId: string) =>
    requestCmms<{ items: CmmsSpecDefinitionV1[] }>(
      `/classifications/${id(classificationId)}/spec-definitions`,
    ),
  createSpecDef: (input: Record<string, unknown>) =>
    requestCmms<CmmsSpecDefinitionV1>('/classifications/spec-definitions', post(input)),

  searchWorkOrders: (query: Record<string, unknown> = {}) =>
    requestCmms<CmmsPageV1<CmmsWorkOrderV1>>('/work-orders/search', post(query)),
  getWorkOrder: (workOrderId: string) =>
    requestCmms<CmmsWorkOrderDetailV1>(`/work-orders/${id(workOrderId)}`),
  workOrderHistory: (workOrderId: string) =>
    requestCmms<{ items: CmmsWorkOrderEventV1[] }>(`/work-orders/${id(workOrderId)}/history`),
  createWorkOrder: (input: Record<string, unknown>) =>
    requestCmms<CmmsWorkOrderDetailV1>('/work-orders', post(input)),
  updateWorkOrder: (workOrderId: string, input: Record<string, unknown>) =>
    requestCmms<CmmsWorkOrderDetailV1>(`/work-orders/${id(workOrderId)}`, patch(input)),
  changeStatus: (workOrderId: string, input: Record<string, unknown>) =>
    requestCmms<CmmsWorkOrderDetailV1>(`/work-orders/${id(workOrderId)}/status`, post(input)),
  addTask: (workOrderId: string, input: { label: string; required: boolean }) =>
    requestCmms<CmmsWorkOrderDetailV1>(`/work-orders/${id(workOrderId)}/tasks`, post(input)),
  recordTask: (workOrderId: string, taskId: string, input: Record<string, unknown>) =>
    requestCmms<CmmsWorkOrderDetailV1>(
      `/work-orders/${id(workOrderId)}/tasks/${id(taskId)}`,
      patch(input),
    ),
  logLabour: (workOrderId: string, input: Record<string, unknown>) =>
    requestCmms<CmmsWorkOrderDetailV1>(`/work-orders/${id(workOrderId)}/labour`, post(input)),
  issuePart: (workOrderId: string, input: Record<string, unknown>) =>
    requestCmms<CmmsWorkOrderDetailV1>(`/work-orders/${id(workOrderId)}/parts`, post(input)),
  addNote: (workOrderId: string, body: string) =>
    requestCmms<CmmsWorkOrderDetailV1>(`/work-orders/${id(workOrderId)}/notes`, post({ body })),
  requestStaffing: (workOrderId: string, input: Record<string, unknown>) =>
    requestCmms<CmmsWorkOrderDetailV1>(`/work-orders/${id(workOrderId)}/staffing`, post(input)),
  cancelStaffing: (workOrderId: string, reason: string) =>
    requestCmms<CmmsWorkOrderDetailV1>(
      `/work-orders/${id(workOrderId)}/staffing/cancel`,
      post({ reason }),
    ),

  listSchedules: () => requestCmms<{ items: CmmsPmScheduleV1[] }>('/pm-schedules'),
  createSchedule: (input: Record<string, unknown>) =>
    requestCmms<CmmsPmScheduleV1>('/pm-schedules', post(input)),
  updateSchedule: (scheduleId: string, input: Record<string, unknown>) =>
    requestCmms<CmmsPmScheduleV1>(`/pm-schedules/${id(scheduleId)}`, patch(input)),
  generateWorkOrder: (scheduleId: string, expectedVersion: number) =>
    requestCmms<{ schedule: CmmsPmScheduleV1; workOrder: CmmsWorkOrderDetailV1 }>(
      `/pm-schedules/${id(scheduleId)}/generate`,
      post({ expectedVersion }),
    ),

  listMeters: () => requestCmms<{ items: CmmsMeterV1[] }>('/meters'),
  createMeter: (input: Record<string, unknown>) => requestCmms<CmmsMeterV1>('/meters', post(input)),
  recordReading: (meterId: string, input: Record<string, unknown>) =>
    requestCmms<{ meter: CmmsMeterV1; reading: CmmsMeterReadingV1; replayed: boolean }>(
      `/meters/${id(meterId)}/readings`,
      post(input),
    ),
  readings: (meterId: string) =>
    requestCmms<{ items: CmmsMeterReadingV1[] }>(`/meters/${id(meterId)}/readings`),

  searchParts: (query: Record<string, unknown> = {}) =>
    requestCmms<CmmsPageV1<CmmsPartV1>>('/parts/search', post(query)),
  createPart: (input: Record<string, unknown>) => requestCmms<CmmsPartV1>('/parts', post(input)),
  updatePart: (partId: string, input: Record<string, unknown>) =>
    requestCmms<CmmsPartV1>(`/parts/${id(partId)}`, patch(input)),
  recordMovement: (partId: string, input: Record<string, unknown>) =>
    requestCmms<{ part: CmmsPartV1; movement: CmmsStockMovementV1; replayed: boolean }>(
      `/parts/${id(partId)}/movements`,
      post(input),
    ),
  movements: (partId: string) =>
    requestCmms<{ items: CmmsStockMovementV1[] }>(`/parts/${id(partId)}/movements`),

  // ─── Reliability: Failure Codes ─────────────────────────────────────────────
  listFailureHierarchyTree: (type?: string) =>
    requestCmms<{ items: CmmsFailureHierarchyNodeV1[] }>(
      `/failure-codes/tree${type ? `?type=${encodeURIComponent(type)}` : ''}`,
    ),
  listFailureCodes: (type?: string) =>
    requestCmms<{ items: CmmsFailureCodeV1[] }>(
      `/failure-codes${type ? `?type=${encodeURIComponent(type)}` : ''}`,
    ),
  createFailureCode: (input: Record<string, unknown>) =>
    requestCmms<CmmsFailureCodeV1>('/failure-codes', post(input)),
  updateFailureCode: (failureCodeId: string, input: Record<string, unknown>) =>
    requestCmms<CmmsFailureCodeV1>(`/failure-codes/${id(failureCodeId)}`, patch(input)),
  deleteFailureCode: (failureCodeId: string) =>
    requestCmms<void>(`/failure-codes/${id(failureCodeId)}`, { method: 'DELETE' }),

  // ─── Reliability: Job Plans ──────────────────────────────────────────────────
  listJobPlans: (classificationId?: string) =>
    requestCmms<{ items: CmmsJobPlanV1[] }>(
      `/job-plans${classificationId ? `?classificationId=${encodeURIComponent(classificationId)}` : ''}`,
    ),
  getJobPlan: (jobPlanId: string) =>
    requestCmms<CmmsJobPlanV1>(`/job-plans/${id(jobPlanId)}`),
  createJobPlan: (input: Record<string, unknown>) =>
    requestCmms<CmmsJobPlanV1>('/job-plans', post(input)),
  updateJobPlan: (jobPlanId: string, input: Record<string, unknown>) =>
    requestCmms<CmmsJobPlanV1>(`/job-plans/${id(jobPlanId)}`, patch(input)),
  applyJobPlan: (jobPlanId: string, workOrderId: string) =>
    requestCmms<{ success: boolean }>(
      `/job-plans/${id(jobPlanId)}/apply-to-work-order/${id(workOrderId)}`,
      post({}),
    ),

  // ─── Reliability: Failure Attribution ───────────────────────────────────────
  recordFailureAttribution: (
    workOrderId: string,
    input: { failureProblemId?: string | null; failureCauseId?: string | null; failureRemedyId?: string | null },
  ) =>
    requestCmms<{ success: boolean }>(
      `/work-orders/${id(workOrderId)}/failure-attribution`,
      post(input),
    ),
};

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}
