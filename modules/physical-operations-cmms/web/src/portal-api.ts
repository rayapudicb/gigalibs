import type { CreatedPortalLinkV1, PortalLinkV1, PortalSubmissionV1 } from '@gigalibs/contracts';
import { requestCmms } from './api';

// WI-OI-140 M-REQ: the CMMS request-link routes, as the signed-in manager.
const send = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
const id = (value: string) => encodeURIComponent(value);

export const portalApi = {
  links: (assetId?: string) => requestCmms<{ items: PortalLinkV1[] }>(`/portal/links${assetId ? `?assetId=${id(assetId)}` : ''}`),
  createLink: (input: Record<string, unknown>) => requestCmms<CreatedPortalLinkV1>('/portal/links', send('POST', input)),
  revoke: (linkId: string, reason: string) => requestCmms<PortalLinkV1>(`/portal/links/${id(linkId)}/revoke`, send('POST', { reason })),
  submissions: () => requestCmms<{ items: PortalSubmissionV1[] }>('/portal/submissions'),
  photo: (submissionId: string) =>
    requestCmms<{ contentType: string; base64: string; sha256: string }>(`/portal/submissions/${id(submissionId)}/photo`),
};
