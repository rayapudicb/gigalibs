import { generateKeyPairSync } from 'node:crypto';
import { verifyPlatformContextToken } from '@gigalibs/auth-core';
import { NonRetryableJobError } from '@gigalibs/jobs';
import { describe, expect, it, vi } from 'vitest';
import { moduleCallJob, type OrganizationVersionSource, parseModuleCallPayload } from './module-call.job.js';

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const key = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
const environment = {
  WORKFORCE_API_URL: 'http://workforce-api:4700',
  WORKFORCE_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64: key,
  ANALYTICS_API_URL: 'http://analytics-api:4400',
  ANALYTICS_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64: key,
  PRODUCT_CATALOGUE_API_URL: 'http://module-host:4790',
  PRODUCT_CATALOGUE_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64: key,
  BUSINESS_PARTNERS_API_URL: 'http://module-host:4790',
  BUSINESS_PARTNERS_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64: key,
  AR_API_URL: 'http://ar-api:3400',
  AR_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64: key,
} as NodeJS.ProcessEnv;
const owner = (permissions: string[]) => ({
  user: { id: 'admin-1' },
  tenant: { id: 'tenant-1', entitlements: [{ moduleKey: 'gigaops', status: 'ENABLED', version: 'v1' }, { moduleKey: 'analytics-studio', status: 'ENABLED', version: 'v1' }, { moduleKey: 'product-catalogue', status: 'ENABLED', version: 'v1' }, { moduleKey: 'business-partners', status: 'ENABLED', version: 'v1' }, { moduleKey: 'accounts-receivable', status: 'ENABLED', version: 'v1' }] },
  roles: ['TENANT_ADMIN'],
  platformRoles: [],
  permissions,
  authVersion: 3,
  session: { id: 'job:job-9' },
  orgScope: { mode: 'FLAT_TENANT' as const },
  organizationScope: { mode: 'TENANT' as const },
  spatialScope: { mode: 'UNBOUNDED' as const },
});
const header = { tree_id: 'tree-1', tree_kind: 'PRIMARY' as const, version_number: 4, checksum: `sha256:${'b'.repeat(64)}` };
const units = Array.from({ length: 1_001 }, (_, index) => ({
  unit_id: `unit-${String(index).padStart(4, '0')}`,
  parent_unit_id: index === 0 ? null : 'unit-0000',
  code: `U-${index}`,
  name: `Unit ${index}`,
  sort_order: 0,
  status: 'ACTIVE' as const,
  holds_records: true,
  type_code: 'STORE',
}));
const source = (found = true): OrganizationVersionSource => ({ version: async () => (found ? { header, units } : null) });
const run = (permissions: string[], fetchImpl: typeof fetch, organizations?: OrganizationVersionSource, operation = 'workforce.organization-sync') =>
  moduleCallJob({ getSubjectContext: async () => owner(permissions) } as never, environment, fetchImpl, undefined, undefined, organizations).handler({
    jobId: 'job-9', tenantId: 'tenant-1', ownerSubjectId: 'admin-1', ownerAuthVersion: 3, correlationId: 'organization:activation:a1', attempt: 1,
    payload: parseModuleCallPayload({ operation, versionId: 'version-0004' }), signal: new AbortController().signal,
  } as never);

// WI-OI-109e2 (ADR-0018 §3): an activated version reaches each module in pages under its request limit, then completes.
describe('organization sync jobs', () => {
  it('sends 500-unit pages in order, then the completion, as the activating member', async () => {
    const calls: Array<{ url: string; body: { page?: number; units?: unknown[]; unit_count?: number } }> = [];
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      const claims = verifyPlatformContextToken(String((init.headers as Record<string, string>).Authorization).slice(7), publicKey.export({ format: 'pem', type: 'spki' }).toString(), 'gigalibs-workforce-api');
      expect(claims).toMatchObject({ tenant_id: 'tenant-1', sub: 'admin-1', organization: { mode: 'TENANT' } });
      calls.push({ url, body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify({ version_id: 'version-0004', status: url.endsWith('/complete') ? 'READY' : 'RECEIVING', received_units: 0 }), { status: 200 });
    });
    const result = await run(['organization:*'], fetchImpl as never, source());
    expect(calls.map((call) => [call.url.replace('http://workforce-api:4700/', ''), call.body.page, call.body.units?.length, call.body.unit_count])).toEqual([
      ['v1/organization/versions/version-0004/units', 0, 500, undefined],
      ['v1/organization/versions/version-0004/units', 1, 500, undefined],
      ['v1/organization/versions/version-0004/units', 2, 1, undefined],
      ['v1/organization/versions/version-0004/complete', undefined, undefined, 1_001],
    ]);
    expect(calls[0]?.body).toMatchObject(header);
    expect(result).toMatchObject({ resultStatus: 'READY', units: 1_001 });
  });

  it('fails visibly and finally when the module refuses, the version is missing or the owner lost the permission', async () => {
    const refusing = vi.fn(async () => new Response('{"message":"The received units do not match the version checksum."}', { status: 409 }));
    await expect(run(['organization:activate'], refusing as never, source(), 'analytics.organization-sync')).rejects.toMatchObject({ code: 'MODULE_REFUSED' });
    await expect(run(['organization:activate'], vi.fn() as never, source(false))).rejects.toMatchObject({ code: 'VERSION_NOT_FOUND' });
    await expect(run(['organization:activate'], vi.fn() as never)).rejects.toMatchObject({ code: 'WORKER_NOT_CONFIGURED' });
    await expect(run(['workforce:*'], vi.fn() as never, source())).rejects.toBeInstanceOf(NonRetryableJobError);
  });

  it('retries when the module is unavailable', async () => {
    const down = vi.fn(async () => new Response('', { status: 503 }));
    await expect(run(['organization:activate'], down as never, source())).rejects.not.toBeInstanceOf(NonRetryableJobError);
  });

  it('delivers the same held version protocol to the hosted Product Catalogue module', async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      const claims = verifyPlatformContextToken(String((init.headers as Record<string, string>).Authorization).slice(7), publicKey.export({ format: 'pem', type: 'spki' }).toString(), 'gigalibs-product-catalogue-api');
      expect(claims).toMatchObject({ tenant_id: 'tenant-1', entitlement: { module_key: 'product-catalogue' } });
      calls.push(url);
      return new Response(JSON.stringify({ version_id: 'version-0004', status: url.endsWith('/complete') ? 'READY' : 'RECEIVING', received_units: 1_001 }), { status: 200 });
    });
    await run(['organization:activate'], fetchImpl as never, source(), 'product-catalogue.organization-sync');
    expect(calls).toEqual([
      'http://module-host:4790/product-catalogue/v1/organization/versions/version-0004/units',
      'http://module-host:4790/product-catalogue/v1/organization/versions/version-0004/units',
      'http://module-host:4790/product-catalogue/v1/organization/versions/version-0004/units',
      'http://module-host:4790/product-catalogue/v1/organization/versions/version-0004/complete',
    ]);
  });

  it('delivers an activated organization version to Business Partner with its own audience', async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      const claims = verifyPlatformContextToken(String((init.headers as Record<string, string>).Authorization).slice(7), publicKey.export({ format: 'pem', type: 'spki' }).toString(), 'gigalibs-business-partners-api');
      expect(claims).toMatchObject({ tenant_id: 'tenant-1', entitlement: { module_key: 'business-partners' } });
      calls.push(url);
      return new Response(JSON.stringify({ version_id: 'version-0004', status: url.endsWith('/complete') ? 'READY' : 'RECEIVING', received_units: 1_001 }), { status: 200 });
    });
    await run(['organization:activate'], fetchImpl as never, source(), 'business-partners.organization-sync');
    expect(calls).toHaveLength(4);
    expect(calls[0]).toBe('http://module-host:4790/business-partners/v1/organization/versions/version-0004/units');
    expect(calls[3]).toBe('http://module-host:4790/business-partners/v1/organization/versions/version-0004/complete');
  });

  it('delivers an activated organization version to AR with its own audience', async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      const claims = verifyPlatformContextToken(String((init.headers as Record<string, string>).Authorization).slice(7), publicKey.export({ format: 'pem', type: 'spki' }).toString(), 'gigalibs-ar-api');
      expect(claims).toMatchObject({ tenant_id: 'tenant-1', entitlement: { module_key: 'accounts-receivable' } });
      calls.push(url);
      return new Response(JSON.stringify({ version_id: 'version-0004', status: url.endsWith('/complete') ? 'READY' : 'RECEIVING', received_units: 1_001 }), { status: 200 });
    });
    await run(['organization:activate'], fetchImpl as never, source(), 'accounts-receivable.organization-sync');
    expect(calls).toHaveLength(4);
    expect(calls[0]).toBe('http://ar-api:3400/v1/organization/versions/version-0004/units');
    expect(calls[3]).toBe('http://ar-api:3400/v1/organization/versions/version-0004/complete');
  });

  it('accepts only organization sync payloads with a version id', () => {
    expect(parseModuleCallPayload({ operation: 'analytics.organization-sync', versionId: 'cmversion0001' })).toEqual({ operation: 'analytics.organization-sync', versionId: 'cmversion0001' });
    expect(parseModuleCallPayload({ operation: 'product-catalogue.organization-sync', versionId: 'cmversion0001' })).toEqual({ operation: 'product-catalogue.organization-sync', versionId: 'cmversion0001' });
    expect(parseModuleCallPayload({ operation: 'business-partners.organization-sync', versionId: 'cmversion0001' })).toEqual({ operation: 'business-partners.organization-sync', versionId: 'cmversion0001' });
    expect(parseModuleCallPayload({ operation: 'accounts-receivable.organization-sync', versionId: 'cmversion0001' })).toEqual({ operation: 'accounts-receivable.organization-sync', versionId: 'cmversion0001' });
    expect(() => parseModuleCallPayload({ operation: 'analytics.organization-sync', versionId: '../x' })).toThrow();
  });
});
