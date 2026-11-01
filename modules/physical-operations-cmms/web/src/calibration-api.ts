import type {
  CalibrationCertificateV1,
  CalibrationDriftV1,
  CalibrationInstrumentBundleV1,
  CalibrationInstrumentV1,
  CalibrationProfileV1,
  CalibrationRecordV1,
  CalibrationStandardV1,
  SubmitCalibrationResultV1,
} from '@gigalibs/contracts';
import { requestCmms } from './api';

// WI-OI-134 M-CAL: the CMMS calibration routes, as the signed-in user through the CMMS web gateway.
const post = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
const patch = (body: unknown): RequestInit => ({ ...post(body), method: 'PATCH' });
const id = (value: string) => encodeURIComponent(value);

export const calibrationApi = {
  instruments: () => requestCmms<{ items: CalibrationInstrumentV1[] }>('/calibration/instruments'),
  bundle: (assetId: string) => requestCmms<CalibrationInstrumentBundleV1>(`/calibration/instruments/${id(assetId)}/bundle`),
  drift: (assetId: string) => requestCmms<CalibrationDriftV1>(`/calibration/instruments/${id(assetId)}/drift`),
  standards: () => requestCmms<{ items: CalibrationStandardV1[] }>('/calibration/standards'),
  createStandard: (input: Record<string, unknown>) => requestCmms<CalibrationStandardV1>('/calibration/standards', post(input)),
  updateStandard: (standardId: string, input: Record<string, unknown>) =>
    requestCmms<CalibrationStandardV1>(`/calibration/standards/${id(standardId)}`, patch(input)),
  profiles: (assetId?: string) =>
    requestCmms<{ items: CalibrationProfileV1[] }>(`/calibration/profiles${assetId ? `?assetId=${id(assetId)}` : ''}`),
  createProfile: (input: Record<string, unknown>) => requestCmms<CalibrationProfileV1>('/calibration/profiles', post(input)),
  updateProfile: (profileId: string, input: Record<string, unknown>) =>
    requestCmms<CalibrationProfileV1>(`/calibration/profiles/${id(profileId)}`, patch(input)),
  publishProfile: (profileId: string, expectedVersion: number) =>
    requestCmms<CalibrationProfileV1>(`/calibration/profiles/${id(profileId)}/publish`, post({ expectedVersion })),
  records: (query: { status?: string; assetId?: string; page?: number } = {}) => {
    const params = new URLSearchParams();
    if (query.status) params.set('status', query.status);
    if (query.assetId) params.set('assetId', query.assetId);
    if (query.page) params.set('page', String(query.page));
    const search = params.toString();
    return requestCmms<{ items: CalibrationRecordV1[]; total: number; page: number; pageSize: number }>(
      `/calibration/records${search ? `?${search}` : ''}`,
    );
  },
  record: (recordId: string) => requestCmms<CalibrationRecordV1>(`/calibration/records/${id(recordId)}`),
  submit: (input: Record<string, unknown>) => requestCmms<SubmitCalibrationResultV1>('/calibration/records', post(input)),
  decide: (recordId: string, input: Record<string, unknown>) =>
    requestCmms<CalibrationRecordV1>(`/calibration/records/${id(recordId)}/decision`, post(input)),
  certificate: (recordId: string) =>
    requestCmms<CalibrationCertificateV1>(`/calibration/records/${id(recordId)}/certificate`),
};
