import type {
  FleetAssetViewV1,
  FleetEnrollmentV1,
  FleetGroundingV1,
  FleetInspectionV1,
  FleetReadinessV1,
  FleetTemplateV1,
} from '@gigalibs/contracts';
import { requestCmms } from './api';

// WI-OI-139 M-DVIR: the CMMS fleet routes, as the signed-in user.
const send = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
const id = (value: string) => encodeURIComponent(value);

export const fleetApi = {
  readiness: () => requestCmms<{ items: FleetReadinessV1[] }>('/fleet/readiness'),
  asset: (assetId: string) => requestCmms<FleetAssetViewV1>(`/fleet/assets/${id(assetId)}`),
  templates: (status?: string) => requestCmms<{ items: FleetTemplateV1[] }>(`/fleet/templates${status ? `?status=${id(status)}` : ''}`),
  template: (templateId: string) => requestCmms<FleetTemplateV1>(`/fleet/templates/${id(templateId)}`),
  createTemplate: (input: Record<string, unknown>) => requestCmms<FleetTemplateV1>('/fleet/templates', send('POST', input)),
  updateTemplate: (templateId: string, input: Record<string, unknown>) =>
    requestCmms<FleetTemplateV1>(`/fleet/templates/${id(templateId)}`, send('PATCH', input)),
  templateAction: (templateId: string, action: 'publish' | 'revise' | 'retire', expectedVersion: number) =>
    requestCmms<FleetTemplateV1>(`/fleet/templates/${id(templateId)}/${action}`, send('POST', { expectedVersion })),
  enroll: (input: Record<string, unknown>) => requestCmms<FleetEnrollmentV1>('/fleet/enrollments', send('PUT', input)),
  inspections: (query: { assetId?: string; from?: string; to?: string }) => {
    const search = new URLSearchParams(Object.entries(query).filter((entry): entry is [string, string] => Boolean(entry[1])));
    const suffix = search.toString();
    return requestCmms<{ from: string; to: string; items: FleetInspectionV1[] }>(`/fleet/inspections${suffix ? `?${suffix}` : ''}`);
  },
  inspection: (inspectionId: string) => requestCmms<FleetInspectionV1>(`/fleet/inspections/${id(inspectionId)}`),
  photo: (inspectionId: string, itemKey: string) =>
    requestCmms<{ contentType: string; base64: string; sha256: string }>(`/fleet/inspections/${id(inspectionId)}/items/${id(itemKey)}/photo`),
  groundings: (status?: 'ALL') => requestCmms<{ items: FleetGroundingV1[] }>(`/fleet/groundings${status ? '?status=ALL' : ''}`),
  ground: (input: Record<string, unknown>) => requestCmms<FleetGroundingV1>('/fleet/groundings', send('POST', input)),
  certify: (groundingId: string, input: Record<string, unknown>) =>
    requestCmms<FleetGroundingV1>(`/fleet/groundings/${id(groundingId)}/certify`, send('POST', input)),
  clear: (groundingId: string, input: Record<string, unknown>) =>
    requestCmms<FleetGroundingV1>(`/fleet/groundings/${id(groundingId)}/clear`, send('POST', input)),
};
