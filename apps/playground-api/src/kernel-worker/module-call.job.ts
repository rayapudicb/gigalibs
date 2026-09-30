/**
 * `module.call` (WI-OI-104c): a scheduled job that calls a module as the schedule owner. Each run rebuilds the owner's
 * current context (membership, roles, permissions, scopes), requires the operation's permission, and signs a context
 * for that module only with the kernel's shared builder. Only the operations listed here can be scheduled. A refusal
 * (owner gone, permission or entitlement missing, module says 4xx) is final; an outage (database, 5xx, network) retries.
 */

import { createPrivateKey } from 'node:crypto';
import { buildPlatformContext, signPlatformContextToken } from '@gigalibs/auth-core';
import { SCHEDULED_OPERATIONS } from '@gigalibs/contracts';
import { type EnqueueJobCommand, type JobDefinition, NonRetryableJobError } from '@gigalibs/jobs';
import { HttpException } from '@nestjs/common';

export interface SubjectContextSource {
  getSubjectContext(userId: string, tenantId: string, contextId: string): Promise<Parameters<typeof buildPlatformContext>[0] & { permissions: string[] }>;
}

interface Operation {
  readonly moduleKey: string;
  readonly audience: string;
  readonly baseUrlEnvironment: string;
  readonly privateKeyEnvironment: string;
  readonly permission: string;
  readonly path: (payload: ModuleCallPayload) => string;
  readonly body: (payload: ModuleCallPayload, jobId: string) => Record<string, unknown>;
}

export type ModuleCallPayload =
  | { readonly operation: 'analytics.report-run'; readonly reportDefinitionId: string }
  | { readonly operation: 'connector-hub.sync'; readonly connectionId: string }
  | { readonly operation: 'analytics.dataset-build'; readonly mappingId: string }
  /** Chained after a dataset build (never scheduled directly). */
  | { readonly operation: 'analytics.summaries-build'; readonly datasetVersionId: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IDENTIFIER = /^[A-Za-z0-9._:-]{1,128}$/;

export const MODULE_CALL_OPERATIONS: Readonly<Record<ModuleCallPayload['operation'], Operation>> = {
  'analytics.report-run': {
    moduleKey: SCHEDULED_OPERATIONS['analytics.report-run'].moduleKey,
    audience: 'gigalibs-analytics-api',
    baseUrlEnvironment: 'ANALYTICS_API_URL',
    privateKeyEnvironment: 'ANALYTICS_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64',
    permission: SCHEDULED_OPERATIONS['analytics.report-run'].runPermission,
    path: () => 'v1/reports/runs',
    // The job id makes a retried run idempotent at the module.
    body: (payload, jobId) => ({ reportDefinitionId: (payload as { reportDefinitionId: string }).reportDefinitionId, idempotencyKey: jobId }),
  },
  'connector-hub.sync': {
    moduleKey: SCHEDULED_OPERATIONS['connector-hub.sync'].moduleKey,
    audience: 'gigalibs-connector-hub-api',
    baseUrlEnvironment: 'CONNECTOR_HUB_API_URL',
    privateKeyEnvironment: 'CONNECTOR_HUB_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64',
    permission: SCHEDULED_OPERATIONS['connector-hub.sync'].runPermission,
    path: (payload) => `api/connectors/v1/connections/${encodeURIComponent((payload as { connectionId: string }).connectionId)}/sync`,
    body: () => ({}),
  },
  'analytics.dataset-build': {
    moduleKey: SCHEDULED_OPERATIONS['analytics.dataset-build'].moduleKey,
    audience: 'gigalibs-analytics-api',
    baseUrlEnvironment: 'ANALYTICS_API_URL',
    privateKeyEnvironment: 'ANALYTICS_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64',
    permission: SCHEDULED_OPERATIONS['analytics.dataset-build'].runPermission,
    path: () => 'v1/datasets/build',
    body: (payload) => ({ mappingId: (payload as { mappingId: string }).mappingId }),
  },
  'analytics.summaries-build': {
    moduleKey: 'analytics-studio',
    audience: 'gigalibs-analytics-api',
    baseUrlEnvironment: 'ANALYTICS_API_URL',
    privateKeyEnvironment: 'ANALYTICS_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64',
    permission: 'analytics:mappings:write',
    path: (payload) => `v1/datasets/${(payload as { datasetVersionId: string }).datasetVersionId}/summaries`,
    body: () => ({}),
  },
};

export function parseModuleCallPayload(value: unknown): ModuleCallPayload {
  const input = (value ?? {}) as Record<string, unknown>;
  if (input.operation === 'analytics.report-run' && typeof input.reportDefinitionId === 'string' && UUID.test(input.reportDefinitionId)) {
    return { operation: 'analytics.report-run', reportDefinitionId: input.reportDefinitionId };
  }
  if (input.operation === 'connector-hub.sync' && typeof input.connectionId === 'string' && IDENTIFIER.test(input.connectionId)) {
    return { operation: 'connector-hub.sync', connectionId: input.connectionId };
  }
  if (input.operation === 'analytics.dataset-build' && typeof input.mappingId === 'string' && UUID.test(input.mappingId)) {
    return { operation: 'analytics.dataset-build', mappingId: input.mappingId };
  }
  if (input.operation === 'analytics.summaries-build' && typeof input.datasetVersionId === 'string' && UUID.test(input.datasetVersionId)) {
    return { operation: 'analytics.summaries-build', datasetVersionId: input.datasetVersionId };
  }
  throw new NonRetryableJobError('NOT_SCHEDULABLE', 'The scheduled operation is not one that can be scheduled.');
}

/** The job payload for an operation and its target (a report definition or a connection). */
export function moduleCallPayload(operation: ModuleCallPayload['operation'], targetId: string): ModuleCallPayload {
  const target = {
    'analytics.report-run': { reportDefinitionId: targetId },
    'connector-hub.sync': { connectionId: targetId },
    'analytics.dataset-build': { mappingId: targetId },
    'analytics.summaries-build': { datasetVersionId: targetId },
  }[operation];
  return parseModuleCallPayload({ operation, ...target });
}

/** The target id inside a stored payload. */
export function moduleCallTarget(payload: ModuleCallPayload): string {
  switch (payload.operation) {
    case 'analytics.report-run':
      return payload.reportDefinitionId;
    case 'connector-hub.sync':
      return payload.connectionId;
    case 'analytics.dataset-build':
      return payload.mappingId;
    case 'analytics.summaries-build':
      return payload.datasetVersionId;
  }
}

/** Enqueues a follow-up kernel job (the worker passes its KernelJobs). */
export type EnqueueFollowUp = (command: EnqueueJobCommand) => Promise<{ readonly id: string }>;

/** True when auth refused the owner (inactive user, tenant or membership); anything else, such as a database outage, is not. */
export function isOwnerRefusal(error: unknown): boolean {
  return error instanceof HttpException && [401, 403].includes(error.getStatus());
}

/** `*`, `resource:*` or the exact permission, as the modules check it. */
export function grants(permissions: readonly string[], required: string): boolean {
  return permissions.includes('*') || permissions.includes(required) || permissions.includes(`${required.split(':')[0]}:*`);
}

export function moduleCallJob(
  subjects: SubjectContextSource,
  environment: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
  enqueue?: EnqueueFollowUp,
): JobDefinition<ModuleCallPayload> {
  return {
    type: 'module.call',
    version: 1,
    backend: 'POSTGRES',
    maxAttempts: 5,
    // Dataset builds and their summaries read every record; ten minutes bounds them.
    timeoutMs: 600_000,
    backoff: { baseMs: 30_000, maxMs: 30 * 60_000 },
    parsePayload: parseModuleCallPayload,
    handler: async (context) => {
      const operation = MODULE_CALL_OPERATIONS[context.payload.operation];
      let subject: Awaited<ReturnType<SubjectContextSource['getSubjectContext']>>;
      try {
        subject = await subjects.getSubjectContext(context.ownerSubjectId, context.tenantId, `job:${context.jobId}`);
      } catch (error) {
        if (!isOwnerRefusal(error)) throw error;
        throw new NonRetryableJobError('OWNER_INACTIVE', `The schedule owner can no longer act here: ${(error as Error).message}`);
      }
      if (!grants(subject.permissions, operation.permission)) {
        throw new NonRetryableJobError('PERMISSION_MISSING', `The schedule owner no longer holds ${operation.permission}.`);
      }
      let claims;
      try {
        claims = buildPlatformContext(subject, operation.moduleKey, operation.audience);
      } catch (error) {
        throw new NonRetryableJobError('ENTITLEMENT_MISSING', (error as Error).message);
      }
      const token = signPlatformContextToken(claims, signingKey(environment, operation.privateKeyEnvironment));
      const baseUrl = environment[operation.baseUrlEnvironment]?.replace(/\/+$/, '');
      if (!baseUrl) throw new NonRetryableJobError('WORKER_NOT_CONFIGURED', `${operation.baseUrlEnvironment} is not configured for the kernel worker.`);
      const response = await fetchImpl(`${baseUrl}/${operation.path(context.payload)}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Correlation-Id': context.correlationId,
        },
        body: JSON.stringify(operation.body(context.payload, context.jobId)),
        signal: context.signal,
      });
      const text = await response.text();
      if (response.status >= 400 && response.status < 500) {
        throw new NonRetryableJobError('MODULE_REFUSED', `The module refused the scheduled ${context.payload.operation} (${response.status}): ${text.slice(0, 300)}`);
      }
      if (!response.ok) throw new Error(`The module answered ${response.status}; the run will be retried.`);
      const body = safeJson(text);
      const resultStatus = typeof body?.status === 'string' ? body.status : typeof body?.buildStatus === 'string' ? body.buildStatus : null;
      let followUpJobId: string | null = null;
      if (context.payload.operation === 'analytics.dataset-build') {
        // A build that ran and failed (for example a mapping that no longer fits the data) will fail again: final.
        if (resultStatus !== 'READY' || typeof body?.id !== 'string') {
          throw new NonRetryableJobError('BUILD_FAILED', `The dataset build ended ${resultStatus ?? 'unknown'}: ${String(body?.buildError ?? 'no detail')}`.slice(0, 500));
        }
        // WI-OI-104e: the new version's summaries are the next kernel job, as the same owner.
        if (enqueue) {
          const followUp = await enqueue({
            tenantId: context.tenantId,
            type: 'module.call',
            version: 1,
            payload: { operation: 'analytics.summaries-build', datasetVersionId: body.id },
            ownerSubjectId: context.ownerSubjectId,
            ownerAuthVersion: context.ownerAuthVersion,
            correlationId: context.correlationId,
            idempotencyKey: `summaries:${body.id}`,
          });
          followUpJobId = followUp.id;
        }
      }
      return {
        operation: context.payload.operation,
        status: response.status,
        ...(typeof body?.id === 'string' ? { resultId: body.id } : typeof body?.datasetVersionId === 'string' ? { resultId: body.datasetVersionId } : {}),
        ...(resultStatus ? { resultStatus } : {}),
        ...(followUpJobId ? { followUpJobId } : {}),
        ...(typeof body?.ready === 'number' ? { summariesReady: body.ready, summariesFailed: Number(body.failed ?? 0) } : {}),
      };
    },
  };
}

function signingKey(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new NonRetryableJobError('WORKER_NOT_CONFIGURED', `${name} is not configured for the kernel worker.`);
  try {
    const key = createPrivateKey({ key: Buffer.from(value, 'base64'), format: 'der', type: 'pkcs8' });
    if (key.asymmetricKeyType !== 'ed25519') throw new Error('wrong key type');
    return key.export({ format: 'pem', type: 'pkcs8' }).toString();
  } catch {
    throw new NonRetryableJobError('WORKER_NOT_CONFIGURED', `${name} is not a valid Ed25519 signing key.`);
  }
}

function safeJson(text: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(text) as unknown;
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
