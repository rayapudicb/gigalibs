import type {
  SopExecutionResultV1,
  SopExecutionV1,
  SopFeedbackV1,
  SopProcedureV1,
  SopStepDurationsV1,
} from '@gigalibs/contracts';
import { requestCmms } from './api';

// WI-OI-138 M-SOP: the CMMS work-instruction routes, as the signed-in user.
const send = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
const id = (value: string) => encodeURIComponent(value);
type Raster = { contentType: string; base64: string; sha256: string };

export const sopApi = {
  procedures: (status?: string) =>
    requestCmms<{ items: SopProcedureV1[] }>(`/sop/procedures${status ? `?status=${id(status)}` : ''}`),
  procedure: (procedureId: string) => requestCmms<SopProcedureV1>(`/sop/procedures/${id(procedureId)}`),
  create: (input: Record<string, unknown>) => requestCmms<SopProcedureV1>('/sop/procedures', send('POST', input)),
  update: (procedureId: string, input: Record<string, unknown>) =>
    requestCmms<SopProcedureV1>(`/sop/procedures/${id(procedureId)}`, send('PATCH', input)),
  lifecycle: (procedureId: string, action: 'revise' | 'submit' | 'approve' | 'reject' | 'withdraw', expectedVersion: number, note?: string) =>
    requestCmms<SopProcedureV1>(`/sop/procedures/${id(procedureId)}/${action}`, send('POST', { expectedVersion, ...(note ? { note } : {}) })),
  uploadStepImage: (procedureId: string, stepKey: string, input: Record<string, unknown>) =>
    requestCmms<SopProcedureV1>(`/sop/procedures/${id(procedureId)}/steps/${id(stepKey)}/image`, send('PUT', input)),
  stepImage: (procedureId: string, stepKey: string) => requestCmms<Raster>(`/sop/procedures/${id(procedureId)}/steps/${id(stepKey)}/image`),
  durations: (procedureId: string) => requestCmms<SopStepDurationsV1>(`/sop/procedures/${id(procedureId)}/durations`),
  addFeedback: (procedureId: string, input: { stepKey: string; text: string }) =>
    requestCmms<SopFeedbackV1>(`/sop/procedures/${id(procedureId)}/feedback`, send('POST', input)),
  feedback: (status: 'OPEN' | 'RESOLVED') => requestCmms<{ items: SopFeedbackV1[] }>(`/sop/feedback?status=${status}`),
  resolveFeedback: (feedbackId: string, note: string) =>
    requestCmms<SopFeedbackV1>(`/sop/feedback/${id(feedbackId)}/resolve`, send('POST', { note })),
  executions: (query: { procedureId?: string; awaitingCosign?: boolean }) => {
    const search = new URLSearchParams();
    if (query.procedureId) search.set('procedureId', query.procedureId);
    if (query.awaitingCosign) search.set('awaitingCosign', 'true');
    const suffix = search.toString();
    return requestCmms<{ items: SopExecutionV1[] }>(`/sop/executions${suffix ? `?${suffix}` : ''}`);
  },
  start: (input: Record<string, unknown>) => requestCmms<SopExecutionResultV1>('/sop/executions', send('POST', input)),
  execution: (executionId: string) => requestCmms<SopExecutionV1>(`/sop/executions/${id(executionId)}`),
  recordStep: (executionId: string, input: Record<string, unknown>) =>
    requestCmms<SopExecutionResultV1>(`/sop/executions/${id(executionId)}/steps`, send('POST', input)),
  cosign: (executionId: string, stepKey: string) =>
    requestCmms<SopExecutionV1>(`/sop/executions/${id(executionId)}/steps/${id(stepKey)}/cosign`, send('POST', {})),
  complete: (executionId: string) => requestCmms<SopExecutionV1>(`/sop/executions/${id(executionId)}/complete`, send('POST', {})),
  photo: (executionId: string, stepKey: string) => requestCmms<Raster>(`/sop/executions/${id(executionId)}/steps/${id(stepKey)}/photo`),
};
