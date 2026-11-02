import type { IsolationProcedureV1, PermitV1 } from '@gigalibs/contracts';
import { requestCmms } from './api';

// WI-OI-142 M-LOTO: the CMMS permit and isolation routes, as the signed-in user.
const send = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
const id = (value: string) => encodeURIComponent(value);

export const permitsApi = {
  procedures: (status?: string) =>
    requestCmms<{ items: IsolationProcedureV1[] }>(`/isolation-procedures${status ? `?status=${id(status)}` : ''}`),
  createProcedure: (input: Record<string, unknown>) => requestCmms<IsolationProcedureV1>('/isolation-procedures', send('POST', input)),
  updateProcedure: (procedureId: string, input: Record<string, unknown>) =>
    requestCmms<IsolationProcedureV1>(`/isolation-procedures/${id(procedureId)}`, send('PATCH', input)),
  procedureAction: (procedureId: string, action: 'publish' | 'revise', expectedVersion: number) =>
    requestCmms<IsolationProcedureV1>(`/isolation-procedures/${id(procedureId)}/${action}`, send('POST', { expectedVersion })),
  list: (status?: string) => requestCmms<{ items: PermitV1[] }>(`/permits${status ? `?status=${id(status)}` : ''}`),
  get: (permitId: string) => requestCmms<PermitV1>(`/permits/${id(permitId)}`),
  request: (input: Record<string, unknown>) => requestCmms<{ replayed: boolean; permit: PermitV1 }>('/permits', send('POST', input)),
  point: (permitId: string, pointKey: string, action: 'lock' | 'verify' | 'remove' | 'witness', input: Record<string, unknown>) =>
    requestCmms<PermitV1>(`/permits/${id(permitId)}/points/${id(pointKey)}/${action}`, send('POST', input)),
  photo: (permitId: string, pointKey: string) =>
    requestCmms<{ contentType: string; base64: string }>(`/permits/${id(permitId)}/points/${id(pointKey)}/photo`),
  gasTest: (permitId: string, input: Record<string, unknown>) => requestCmms<PermitV1>(`/permits/${id(permitId)}/gas-tests`, send('POST', input)),
  act: (permitId: string, action: 'authorize' | 'countersign' | 'de-isolate' | 'close' | 'cancel', input: Record<string, unknown>) =>
    requestCmms<PermitV1>(`/permits/${id(permitId)}/${action}`, send('POST', input)),
  lock: (permitId: string, action: 'lock-on' | 'lock-off') => requestCmms<PermitV1>(`/permits/${id(permitId)}/${action}`, send('POST', {})),
};
