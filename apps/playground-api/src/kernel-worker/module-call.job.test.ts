import { generateKeyPairSync } from 'node:crypto';
import { verifyPlatformContextToken } from '@gigalibs/auth-core';
import { NonRetryableJobError } from '@gigalibs/jobs';
import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { grants, moduleCallJob, parseModuleCallPayload } from './module-call.job.js';

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const environment = {
  ANALYTICS_API_URL: 'http://analytics-api:4400/',
  ANALYTICS_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64: privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'),
  CONNECTOR_HUB_API_URL: 'http://connector-hub-api:4100',
  CONNECTOR_HUB_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64: privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'),
} as NodeJS.ProcessEnv;
const REPORT = '00000000-0000-4000-8000-0000000000aa';

const owner = (permissions: string[], entitlements = [{ moduleKey: 'analytics-studio', status: 'ENABLED', version: 'v1' }, { moduleKey: 'connections', status: 'ENABLED', version: 'v1' }]) => ({
  user: { id: 'owner-1' },
  tenant: { id: 'tenant-1', entitlements },
  roles: ['MEMBER', 'Analytics analyst'],
  platformRoles: [],
  permissions,
  authVersion: 1_790_000_000,
  session: { id: 'job:job-1' },
  orgScope: { mode: 'FLAT_TENANT' as const },
  spatialScope: { mode: 'UNBOUNDED' as const },
});
const context = (payload: unknown) => ({
  jobId: 'job-1',
  tenantId: 'tenant-1',
  ownerSubjectId: 'owner-1',
  ownerAuthVersion: 1,
  correlationId: 'schedule:s-1',
  attempt: 1,
  payload: parseModuleCallPayload(payload),
  signal: new AbortController().signal,
});
const ok = (body: unknown = { id: 'run-9', status: 'SUCCEEDED' }, status = 202) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

// WI-OI-104c: scheduled work calls a module as its owner, with rights re-checked at every run.
describe('module.call job', () => {
  it('accepts only the listed operations with well-formed targets', () => {
    expect(parseModuleCallPayload({ operation: 'analytics.report-run', reportDefinitionId: REPORT })).toEqual({ operation: 'analytics.report-run', reportDefinitionId: REPORT });
    expect(parseModuleCallPayload({ operation: 'connector-hub.sync', connectionId: 'farmos-main' })).toEqual({ operation: 'connector-hub.sync', connectionId: 'farmos-main' });
    for (const bad of [{ operation: 'analytics.report-run', reportDefinitionId: 'nope' }, { operation: 'cmms.delete-everything' }, { operation: 'connector-hub.sync', connectionId: '../etc' }, null]) {
      expect(() => parseModuleCallPayload(bad)).toThrow(NonRetryableJobError);
    }
  });

  it('signs a context for the owner and only the target module, and makes the run idempotent by job id', async () => {
    const fetchImpl = ok();
    const subjects = { getSubjectContext: vi.fn(async () => owner(['analytics:reports:write', 'analytics:read'])) };
    const result = await moduleCallJob(subjects as never, environment, fetchImpl as never).handler(context({ operation: 'analytics.report-run', reportDefinitionId: REPORT }));
    expect(subjects.getSubjectContext).toHaveBeenCalledWith('owner-1', 'tenant-1', 'job:job-1');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://analytics-api:4400/v1/reports/runs');
    expect(JSON.parse(String(init.body))).toEqual({ reportDefinitionId: REPORT, idempotencyKey: 'job-1' });
    const headers = new Headers(init.headers);
    expect(headers.get('x-correlation-id')).toBe('schedule:s-1');
    const claims = verifyPlatformContextToken(headers.get('authorization')!.replace('Bearer ', ''), publicKey.export({ format: 'pem', type: 'spki' }).toString(), 'gigalibs-analytics-api');
    expect(claims).toMatchObject({ sub: 'owner-1', tenant_id: 'tenant-1', session_id: 'job:job-1', entitlement: { module_key: 'analytics-studio' } });
    expect(claims.granted_scopes).toEqual(['analytics:reports:write', 'analytics:read']);
    expect(result).toEqual({ operation: 'analytics.report-run', status: 202, resultId: 'run-9', resultStatus: 'SUCCEEDED' });
  });

  it('refuses for good when the owner left, lost the permission or the module is not enabled, and when the module says no', async () => {
    const run = (subjects: object, fetchImpl = ok()) =>
      moduleCallJob(subjects as never, environment, fetchImpl as never).handler(context({ operation: 'connector-hub.sync', connectionId: 'c-1' }));
    await expect(run({ getSubjectContext: async () => { throw new ForbiddenException('Tenant membership is inactive or has been revoked'); } })).rejects.toMatchObject({ code: 'OWNER_INACTIVE' });
    await expect(run({ getSubjectContext: async () => owner(['connections:read']) })).rejects.toMatchObject({ code: 'PERMISSION_MISSING' });
    await expect(run({ getSubjectContext: async () => owner(['connections:*'], []) })).rejects.toMatchObject({ code: 'ENTITLEMENT_MISSING' });
    await expect(run({ getSubjectContext: async () => owner(['connections:*']) }, ok({ message: 'Missing required permission' }, 403))).rejects.toMatchObject({ code: 'MODULE_REFUSED' });
  });

  it('retries when the owner cannot be checked because the database is down', async () => {
    const error = await moduleCallJob({ getSubjectContext: async () => { throw new Error('Connection terminated'); } } as never, environment, ok() as never)
      .handler(context({ operation: 'connector-hub.sync', connectionId: 'c-1' }))
      .catch((caught: unknown) => caught);
    expect(error).not.toBeInstanceOf(NonRetryableJobError);
  });

  it('retries when the module is down', async () => {
    const failing = vi.fn(async () => new Response('busy', { status: 503 }));
    const error = await moduleCallJob({ getSubjectContext: async () => owner(['connections:sync']) } as never, environment, failing as never)
      .handler(context({ operation: 'connector-hub.sync', connectionId: 'c-1' }))
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(NonRetryableJobError);
    expect(String((failing.mock.calls[0] as unknown as [string])[0])).toBe('http://connector-hub-api:4100/api/connectors/v1/connections/c-1/sync');
  });

  it('checks permissions as the modules do', () => {
    expect(grants(['analytics:*'], 'analytics:reports:write')).toBe(true);
    expect(grants(['*'], 'connections:sync')).toBe(true);
    expect(grants(['analytics:read'], 'analytics:reports:write')).toBe(false);
  });

  // WI-OI-104e: a scheduled dataset build chains the summary build for the new version, as the same owner.
  it('chains the summary build after a ready dataset build, and stops for good when the build failed', async () => {
    const MAPPING = '00000000-0000-4000-8000-0000000000bb';
    const VERSION = '00000000-0000-4000-8000-0000000000cc';
    const enqueue = vi.fn(async () => ({ id: 'job-2' }));
    const writer = { getSubjectContext: async () => owner(['analytics:mappings:write']) };
    const job = moduleCallJob(writer as never, environment, ok({ id: VERSION, buildStatus: 'READY' }, 202) as never, enqueue);
    const result = await job.handler(context({ operation: 'analytics.dataset-build', mappingId: MAPPING }));
    expect(result).toMatchObject({ operation: 'analytics.dataset-build', resultId: VERSION, resultStatus: 'READY', followUpJobId: 'job-2' });
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-1',
      type: 'module.call',
      ownerSubjectId: 'owner-1',
      correlationId: 'schedule:s-1',
      idempotencyKey: `summaries:${VERSION}`,
      payload: { operation: 'analytics.summaries-build', datasetVersionId: VERSION },
    }));
    const failed = moduleCallJob(writer as never, environment, ok({ id: VERSION, buildStatus: 'FAILED', buildError: 'field crop missing' }, 202) as never, enqueue);
    await expect(failed.handler(context({ operation: 'analytics.dataset-build', mappingId: MAPPING }))).rejects.toMatchObject({ code: 'BUILD_FAILED' });
    const fetchSpy = ok({ datasetVersionId: VERSION, ready: 2, failed: 0, building: 0 }, 200);
    const summaries = await moduleCallJob(writer as never, environment, fetchSpy as never).handler(context({ operation: 'analytics.summaries-build', datasetVersionId: VERSION }));
    expect(String((fetchSpy.mock.calls[0] as unknown as [string])[0])).toBe(`http://analytics-api:4400/v1/datasets/${VERSION}/summaries`);
    expect(summaries).toMatchObject({ resultId: VERSION, summariesReady: 2, summariesFailed: 0 });
    expect(() => parseModuleCallPayload({ operation: 'analytics.dataset-build', mappingId: 'not-a-uuid' })).toThrow(NonRetryableJobError);
  });
});
