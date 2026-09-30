/**
 * `module.call` (WI-OI-104c): a scheduled job that calls a module as the schedule owner. Each run rebuilds the owner's
 * current context (membership, roles, permissions, scopes), requires the operation's permission, and signs a context
 * for that module only with the kernel's shared builder. Only the operations listed here can be scheduled. A refusal
 * (owner gone, permission or entitlement missing, module says 4xx) is final; an outage (database, 5xx, network) retries.
 */

import { createPrivateKey } from 'node:crypto';
import { buildPlatformContext, signPlatformContextToken } from '@gigalibs/auth-core';
import { SCHEDULED_OPERATIONS } from '@gigalibs/contracts';
import { type JobDefinition, NonRetryableJobError } from '@gigalibs/jobs';
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
  | { readonly operation: 'connector-hub.sync'; readonly connectionId: string };

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
};

export function parseModuleCallPayload(value: unknown): ModuleCallPayload {
  const input = (value ?? {}) as Record<string, unknown>;
  if (input.operation === 'analytics.report-run' && typeof input.reportDefinitionId === 'string' && UUID.test(input.reportDefinitionId)) {
    return { operation: 'analytics.report-run', reportDefinitionId: input.reportDefinitionId };
  }
  if (input.operation === 'connector-hub.sync' && typeof input.connectionId === 'string' && IDENTIFIER.test(input.connectionId)) {
    return { operation: 'connector-hub.sync', connectionId: input.connectionId };
  }
  throw new NonRetryableJobError('NOT_SCHEDULABLE', 'The scheduled operation is not one that can be scheduled.');
}

/** The job payload for an operation and its target (a report definition or a connection). */
export function moduleCallPayload(operation: ModuleCallPayload['operation'], targetId: string): ModuleCallPayload {
  return parseModuleCallPayload(
    operation === 'analytics.report-run' ? { operation, reportDefinitionId: targetId } : { operation, connectionId: targetId },
  );
}

/** The target id inside a stored payload. */
export function moduleCallTarget(payload: ModuleCallPayload): string {
  return payload.operation === 'analytics.report-run' ? payload.reportDefinitionId : payload.connectionId;
}

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
): JobDefinition<ModuleCallPayload> {
  return {
    type: 'module.call',
    version: 1,
    backend: 'POSTGRES',
    maxAttempts: 5,
    timeoutMs: 120_000,
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
      return {
        operation: context.payload.operation,
        status: response.status,
        ...(typeof body?.id === 'string' ? { resultId: body.id } : {}),
        ...(typeof body?.status === 'string' ? { resultStatus: body.status } : {}),
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
