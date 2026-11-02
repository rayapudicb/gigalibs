import { plainRequestError } from '@gigalibs/web-sdk';
import type {
  ContractorCompanyV1,
  ContractorPassIssuanceV1,
  ContractorRosterV1,
  ContractorWorkerV1,
  HazardInsightsV1,
  HazardReportV1,
  ReportHazardResultV1,
  StopWorkAlertV1,
} from '@gigalibs/contracts';

// WI-OI-141 M-INC: the Safety Operations routes, as the signed-in user, through the web gateway /api/safety-operations.
export const SAFETY_API = '/api/safety-operations/v1';

export class SafetyApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = 'SafetyApiError';
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${SAFETY_API}${path}`, {
    ...init,
    headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    cache: 'no-store',
  });
  const value = (await response.json().catch(() => ({}))) as { code?: string; message?: string };
  if (!response.ok) throw new SafetyApiError(response.status, value.code ?? 'SAFETY_OPERATIONS_UNAVAILABLE', value.message ?? plainRequestError(response.status));
  return value as T;
}
const post = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });
const id = (value: string) => encodeURIComponent(value);

export const safetyApi = {
  report: (input: Record<string, unknown>) => call<ReportHazardResultV1>('/hazards', post(input)),
  mine: () => call<{ items: HazardReportV1[] }>('/hazards/mine'),
  list: (query: { status?: string; severity?: string } = {}) => {
    const search = new URLSearchParams(Object.entries(query).filter((entry): entry is [string, string] => Boolean(entry[1])));
    const suffix = search.toString();
    return call<{ items: HazardReportV1[] }>(`/hazards${suffix ? `?${suffix}` : ''}`);
  },
  insights: (days: number) => call<HazardInsightsV1>(`/hazards/insights?days=${days}`),
  get: (reportId: string) => call<HazardReportV1>(`/hazards/${id(reportId)}`),
  photo: (reportId: string) => call<{ contentType: string; base64: string }>(`/hazards/${id(reportId)}/photo`),
  triage: (reportId: string, input: Record<string, unknown>) => call<HazardReportV1>(`/hazards/${id(reportId)}/triage`, post(input)),
  close: (reportId: string, input: Record<string, unknown>) => call<HazardReportV1>(`/hazards/${id(reportId)}/close`, post(input)),
  investigate: (reportId: string, input: Record<string, unknown>) =>
    call<HazardReportV1>(`/hazards/${id(reportId)}/investigation`, post(input)),
  openAlerts: () => call<{ items: StopWorkAlertV1[] }>('/stop-work'),
  acknowledge: (alertId: string) => call<StopWorkAlertV1>(`/stop-work/${id(alertId)}/acknowledge`, post({})),
  lift: (alertId: string, input: Record<string, unknown>) => call<StopWorkAlertV1>(`/stop-work/${id(alertId)}/lift`, post(input)),
  listContractorCompanies: () => call<{ items: ContractorCompanyV1[] }>('/contractor-companies'),
  createContractorCompany: (input: Record<string, unknown>) => call<ContractorCompanyV1>('/contractor-companies', post(input)),
  updateContractorCompany: (companyId: string, input: Record<string, unknown>) =>
    call<ContractorCompanyV1>(`/contractor-companies/${id(companyId)}`, post(input)),
  createContractorWorker: (companyId: string, input: Record<string, unknown>) =>
    call<ContractorWorkerV1>(`/contractor-companies/${id(companyId)}/workers`, post(input)),
  contractorRoster: () => call<ContractorRosterV1>('/contractor-roster'),
  completeContractorInduction: (input: Record<string, unknown>) =>
    call<ContractorPassIssuanceV1>('/contractor-inductions', post(input)),
};
