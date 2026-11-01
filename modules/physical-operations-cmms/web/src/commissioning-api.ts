import type {
  AssetAuditReportV1,
  AssetAuditWalkV1,
  AssetPhysicalTagV1,
  AssetTagResolutionV1,
  CommissioningRequestV1,
} from '@gigalibs/contracts';
import { requestCmms } from './api';

// WI-OI-135 M-TAG: the CMMS commissioning, tag and floor-walk routes, as the signed-in user.
const post = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
const id = (value: string) => encodeURIComponent(value);

export const commissioningApi = {
  requests: (status?: string) =>
    requestCmms<{ items: CommissioningRequestV1[]; total: number }>(`/commissioning/requests${status ? `?status=${id(status)}` : ''}`),
  request: (requestId: string) => requestCmms<CommissioningRequestV1>(`/commissioning/requests/${id(requestId)}`),
  decide: (requestId: string, input: Record<string, unknown>) =>
    requestCmms<CommissioningRequestV1>(`/commissioning/requests/${id(requestId)}/decision`, post(input)),
  resolveTag: (kind: string, value: string) =>
    requestCmms<AssetTagResolutionV1>(`/asset-tags/resolve?kind=${id(kind)}&value=${id(value)}`),
  assetTags: (assetId: string) => requestCmms<{ items: AssetPhysicalTagV1[] }>(`/assets/${id(assetId)}/tags`),
  bindTag: (assetId: string, input: { kind: string; value: string }) =>
    requestCmms<AssetPhysicalTagV1>(`/assets/${id(assetId)}/tags`, post(input)),
  retireTag: (tagId: string, reason: string) => requestCmms<AssetPhysicalTagV1>(`/asset-tags/${id(tagId)}/retire`, post({ reason })),
  walks: () => requestCmms<{ items: AssetAuditWalkV1[] }>('/asset-audits'),
  report: (walkId: string) => requestCmms<AssetAuditReportV1>(`/asset-audits/${id(walkId)}/report`),
  finishWalk: (walkId: string) => requestCmms<AssetAuditWalkV1>(`/asset-audits/${id(walkId)}/finish`, post({})),
};
