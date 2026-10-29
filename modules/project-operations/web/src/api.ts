import type {
  ProjectBurnMatrixV1,
  ProjectGanttV1,
  ProjectSummaryV1,
  TimesheetApprovalQueueItemV1,
} from '@gigalibs/contracts';

async function requestProjects<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `/api/project-operations/v1${path.startsWith('/') ? path : `/${path}`}`;
  const headers = new Headers(options.headers);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  const response = await fetch(url, { ...options, headers, cache: 'no-store' });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { message?: string; code?: string };
    throw new Error(
      typeof payload?.message === 'string'
        ? payload.message
        : typeof payload?.code === 'string'
          ? payload.code
          : `Project Operations request failed (${response.status}).`,
    );
  }
  return (await response.json()) as T;
}

export const projectOperationsApi = {
  listProjects: () => requestProjects<{ items: ProjectSummaryV1[] }>('/projects'),
  gantt: (projectId: string) => requestProjects<ProjectGanttV1>(`/projects/${projectId}/gantt`),
  burnMatrix: (projectId: string) => requestProjects<ProjectBurnMatrixV1>(`/projects/${projectId}/burn-matrix`),
  approvalQueue: () => requestProjects<{ items: TimesheetApprovalQueueItemV1[] }>('/timesheets/approval-queue'),
  approveTimesheet: (id: string, body: { requestKey: string; expectedVersion: number }) =>
    requestProjects(`/timesheets/${id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  rejectTimesheet: (id: string, body: { requestKey: string; expectedVersion: number; rejectionReason: string }) =>
    requestProjects(`/timesheets/${id}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
};
