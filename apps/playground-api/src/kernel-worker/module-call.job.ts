/**
 * `module.call` (WI-OI-104c): a scheduled job that calls a module as the schedule owner. Each run rebuilds the owner's
 * current context (membership, roles, permissions, scopes), requires the operation's permission, and signs a context
 * for that module only with the kernel's shared builder. Only the operations listed here can be scheduled. A refusal
 * (owner gone, permission or entitlement missing, module says 4xx) is final; an outage (database, 5xx, network) retries.
 */

import { createPrivateKey } from 'node:crypto';
import { buildPlatformContext, signPlatformContextToken } from '@gigalibs/auth-core';
import {
  ORG_REPLICA_PAGE_SIZE,
  type OrgReplicaCompletionV1,
  type OrgReplicaUnitV1,
  type PackApplicationV1,
  SCHEDULED_OPERATIONS,
} from '@gigalibs/contracts';
import { type EnqueueJobCommand, type JobDefinition, NonRetryableJobError } from '@gigalibs/jobs';
import { HttpException } from '@nestjs/common';

export interface SubjectContextSource {
  getSubjectContext(userId: string, tenantId: string, contextId: string): Promise<Parameters<typeof buildPlatformContext>[0] & { permissions: string[] }>;
}

/**
 * WI-OI-107: where a `pack.apply` job finds what it sends. The job holds only the published pack version; the module's
 * section is read from that version when the job runs, so the payload stays small and the pack immutable.
 */
export interface PackSectionSource {
  application(tenantId: string, publishedVersionId: string, moduleKey: string): Promise<PackApplicationV1 | null>;
}

/** WI-OI-109e2: a published organization version as modules receive it, read tenant-scoped from the control plane. */
export interface OrganizationVersionSource {
  version(tenantId: string, versionId: string): Promise<{ header: Omit<OrgReplicaCompletionV1, 'unit_count'>; units: OrgReplicaUnitV1[] } | null>;
}

interface Operation {
  readonly moduleKey: string;
  readonly audience: string;
  readonly baseUrlEnvironment: string;
  readonly privateKeyEnvironment: string;
  readonly permission: string;
  readonly path: (payload: ModuleCallPayload) => string;
  readonly body: (payload: ModuleCallPayload, jobId: string) => Record<string, unknown>;
  /** Pack applications read their body from the published pack instead: this module's section (its manifest name). */
  readonly packSection?: 'gigaops' | 'geospatial';
  /** Organization syncs send a published version in pages, then complete it (WI-OI-109e2). */
  readonly organizationVersion?: true;
}

export type ModuleCallPayload =
  | { readonly operation: 'analytics.report-run'; readonly reportDefinitionId: string }
  | { readonly operation: 'connector-hub.sync'; readonly connectionId: string }
  | { readonly operation: 'analytics.dataset-build'; readonly mappingId: string }
  /** Chained after a dataset build (never scheduled directly). */
  | { readonly operation: 'analytics.summaries-build'; readonly datasetVersionId: string }
  /** WI-OI-107: queued when a tenant activates an industry or country pack (never scheduled directly). */
  | { readonly operation: 'workforce.pack-apply' | 'geospatial.pack-apply'; readonly publishedVersionId: string }
  | { readonly operation: 'workforce.organization-sync' | 'analytics.organization-sync' | 'product-catalogue.organization-sync'; readonly versionId: string };

/**
 * The pack-apply operation of each module that reads packs, by the module's name in packs (its manifest name), with
 * the catalogue key its tenants are entitled to.
 */
export const PACK_APPLY_OPERATIONS = {
  gigaops: { operation: 'workforce.pack-apply', entitlementKey: 'gigaops' },
  geospatial: { operation: 'geospatial.pack-apply', entitlementKey: 'geospatial-studio' },
} as const;

/** WI-OI-109e2: the modules that keep a copy of activated organization versions, by catalogue key. */
export const ORGANIZATION_SYNC_OPERATIONS = {
  gigaops: { operation: 'workforce.organization-sync' },
  'analytics-studio': { operation: 'analytics.organization-sync' },
  'product-catalogue': { operation: 'product-catalogue.organization-sync' },
} as const;

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
  'workforce.pack-apply': {
    moduleKey: 'gigaops',
    audience: 'gigalibs-workforce-api',
    baseUrlEnvironment: 'WORKFORCE_API_URL',
    privateKeyEnvironment: 'WORKFORCE_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64',
    permission: 'workforce.configuration.manage',
    path: () => 'v1/pack/apply',
    body: () => ({}),
    packSection: 'gigaops',
  },
  'geospatial.pack-apply': {
    moduleKey: 'geospatial-studio',
    audience: 'gigalibs-geospatial-api',
    baseUrlEnvironment: 'GEOSPATIAL_API_URL',
    privateKeyEnvironment: 'GEOSPATIAL_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64',
    permission: 'maps.node-types.manage',
    path: () => 'v1/pack/apply',
    body: () => ({}),
    packSection: 'geospatial',
  },
  'workforce.organization-sync': {
    moduleKey: 'gigaops',
    audience: 'gigalibs-workforce-api',
    baseUrlEnvironment: 'WORKFORCE_API_URL',
    privateKeyEnvironment: 'WORKFORCE_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64',
    permission: 'organization:activate',
    path: (payload) => `v1/organization/versions/${encodeURIComponent(moduleCallTarget(payload))}`,
    body: () => ({}),
    organizationVersion: true,
  },
  'analytics.organization-sync': {
    moduleKey: 'analytics-studio',
    audience: 'gigalibs-analytics-api',
    baseUrlEnvironment: 'ANALYTICS_API_URL',
    privateKeyEnvironment: 'ANALYTICS_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64',
    permission: 'organization:activate',
    path: (payload) => `v1/organization/versions/${encodeURIComponent(moduleCallTarget(payload))}`,
    body: () => ({}),
    organizationVersion: true,
  },
  'product-catalogue.organization-sync': {
    moduleKey: 'product-catalogue',
    audience: 'gigalibs-product-catalogue-api',
    baseUrlEnvironment: 'PRODUCT_CATALOGUE_API_URL',
    privateKeyEnvironment: 'PRODUCT_CATALOGUE_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64',
    permission: 'organization:activate',
    path: (payload) => `product-catalogue/v1/organization/versions/${encodeURIComponent(moduleCallTarget(payload))}`,
    body: () => ({}),
    organizationVersion: true,
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
  // Configuration Studio's published version ids are cuids, not UUIDs.
  if (
    (input.operation === 'workforce.pack-apply' || input.operation === 'geospatial.pack-apply') &&
    typeof input.publishedVersionId === 'string' &&
    /^[A-Za-z0-9_-]{8,64}$/.test(input.publishedVersionId)
  ) {
    return { operation: input.operation, publishedVersionId: input.publishedVersionId };
  }
  if (
    (input.operation === 'workforce.organization-sync' || input.operation === 'analytics.organization-sync' || input.operation === 'product-catalogue.organization-sync') &&
    typeof input.versionId === 'string' &&
    /^[A-Za-z0-9_-]{8,64}$/.test(input.versionId)
  ) {
    return { operation: input.operation, versionId: input.versionId };
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
    'workforce.pack-apply': { publishedVersionId: targetId },
    'geospatial.pack-apply': { publishedVersionId: targetId },
    'workforce.organization-sync': { versionId: targetId },
    'analytics.organization-sync': { versionId: targetId },
    'product-catalogue.organization-sync': { versionId: targetId },
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
    case 'workforce.pack-apply':
    case 'geospatial.pack-apply':
      return payload.publishedVersionId;
    case 'workforce.organization-sync':
    case 'analytics.organization-sync':
    case 'product-catalogue.organization-sync':
      return payload.versionId;
  }
}

/** Enqueues a follow-up kernel job (the worker passes its KernelJobs). */
export type EnqueueFollowUp = (command: EnqueueJobCommand) => Promise<{ readonly id: string }>;

/** True when auth refused the owner (inactive user, tenant or membership); anything else, such as a database outage, is not. */
export function isOwnerRefusal(error: unknown): boolean {
  return error instanceof HttpException && [401, 403].includes(error.getStatus());
}

/** `*`, `<prefix>:*` or the exact permission, as the modules check it (`maps:*` grants `maps.node-types.manage`). */
export function grants(permissions: readonly string[], required: string): boolean {
  return permissions.includes('*') || permissions.includes(required) || permissions.includes(`${required.split(/[:.]/)[0]}:*`);
}

export function moduleCallJob(
  subjects: SubjectContextSource,
  environment: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
  enqueue?: EnqueueFollowUp,
  packs?: PackSectionSource,
  organizations?: OrganizationVersionSource,
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
      let requestBody: Record<string, unknown> = operation.body(context.payload, context.jobId);
      if (operation.packSection) {
        if (!packs) throw new NonRetryableJobError('WORKER_NOT_CONFIGURED', 'The kernel worker cannot read packs.');
        const application = await packs.application(context.tenantId, moduleCallTarget(context.payload), operation.packSection);
        if (!application) throw new NonRetryableJobError('PACK_NOT_FOUND', `The pack version has no ${operation.packSection} section for this workspace.`);
        requestBody = application;
      }
      const token = signPlatformContextToken(claims, signingKey(environment, operation.privateKeyEnvironment));
      const baseUrl = environment[operation.baseUrlEnvironment]?.replace(/\/+$/, '');
      if (!baseUrl) throw new NonRetryableJobError('WORKER_NOT_CONFIGURED', `${operation.baseUrlEnvironment} is not configured for the kernel worker.`);
      if (operation.organizationVersion) {
        if (!organizations) throw new NonRetryableJobError('WORKER_NOT_CONFIGURED', 'The kernel worker cannot read organization versions.');
        const version = await organizations.version(context.tenantId, moduleCallTarget(context.payload));
        if (!version) throw new NonRetryableJobError('VERSION_NOT_FOUND', 'The organization version is not published in this workspace.');
        const post = async (suffix: string, body: unknown) => {
          const response = await fetchImpl(`${baseUrl}/${operation.path(context.payload)}/${suffix}`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
              Accept: 'application/json',
              'X-Correlation-Id': context.correlationId,
            },
            body: JSON.stringify(body),
            signal: context.signal,
          });
          const text = await response.text();
          if (response.status >= 400 && response.status < 500)
            throw new NonRetryableJobError('MODULE_REFUSED', `The module refused the organization version (${response.status}): ${text.slice(0, 300)}`);
          if (!response.ok) throw new Error(`The module answered ${response.status}; the delivery will be retried.`);
          return safeJson(text);
        };
        for (let page = 0; page * ORG_REPLICA_PAGE_SIZE < version.units.length; page += 1) {
          await post('units', { ...version.header, page, units: version.units.slice(page * ORG_REPLICA_PAGE_SIZE, (page + 1) * ORG_REPLICA_PAGE_SIZE) });
        }
        const done = await post('complete', { ...version.header, unit_count: version.units.length });
        return {
          operation: context.payload.operation,
          status: 200,
          resultId: moduleCallTarget(context.payload),
          resultStatus: typeof done?.status === 'string' ? done.status : 'UNKNOWN',
          units: version.units.length,
        };
      }
      const response = await fetchImpl(`${baseUrl}/${operation.path(context.payload)}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Correlation-Id': context.correlationId,
        },
        body: JSON.stringify(requestBody),
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
