import { generateKeyPairSync } from 'node:crypto';
import { verifyPlatformContextToken } from '@gigalibs/auth-core';
import { SHIPPED_INDUSTRY_PACKS } from '@gigalibs/contracts';
import { bundledGovernedCatalogue, compileGovernedCatalogue } from '@gigalibs/configuration-core';
import { describe, expect, it, vi } from 'vitest';
import { grants, moduleCallJob, parseModuleCallPayload } from './module-call.job.js';
import { packApplication } from './pack-sections.js';

const VERSION = '00000000-0000-4000-8000-0000000000b7';
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const key = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
const environment = {
  WORKFORCE_API_URL: 'http://workforce-api:4700',
  WORKFORCE_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64: key,
  GEOSPATIAL_API_URL: 'http://geospatial-api:4720',
  GEOSPATIAL_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64: key,
} as NodeJS.ProcessEnv;
const admin = {
  user: { id: 'admin-1' },
  tenant: { id: 'tenant-1', entitlements: [{ moduleKey: 'gigaops', status: 'ENABLED', version: 'v1' }, { moduleKey: 'geospatial-studio', status: 'ENABLED', version: 'v1' }] },
  roles: ['TENANT_ADMIN'],
  platformRoles: [],
  permissions: ['workforce:*', 'maps:*'],
  authVersion: 3,
  session: { id: 'job:job-7' },
  orgScope: { mode: 'FLAT_TENANT' as const },
  spatialScope: { mode: 'UNBOUNDED' as const },
};
const compiled = (kind: 'INDUSTRY_PACK' | 'COUNTRY_PACK', surfaceKey: string) => compileGovernedCatalogue(bundledGovernedCatalogue(kind, surfaceKey)).manifest!;

// WI-OI-107 (ADR-0016 F10, D3): activating a pack sends each module its section through kernel jobs.
describe('pack.apply jobs', () => {
  it('reads one module section from a published pack, the legacy V1 format included, and nothing else', () => {
    const agriculture = compiled('INDUSTRY_PACK', 'agriculture');
    const workforce = packApplication(agriculture, VERSION, agriculture.checksum, 'gigaops')!;
    expect(workforce).toMatchObject({ kind: 'INDUSTRY', key: 'agriculture', version: '1.0', publishedVersionId: VERSION, checksum: agriculture.checksum });
    expect(workforce.section).toEqual(SHIPPED_INDUSTRY_PACKS.find((pack) => pack.slug === 'agriculture')!.modules.gigaops);
    expect(packApplication(agriculture, VERSION, agriculture.checksum, 'geospatial')!.section).toEqual({
      lists: { placeTypes: [{ code: 'FARM', label: 'Farm' }, { code: 'FIELD', label: 'Field' }, { code: 'BLOCK', label: 'Block' }] },
    });
    expect(packApplication(agriculture, VERSION, agriculture.checksum, 'analytics-studio')).toBeNull();
    const us = compiled('COUNTRY_PACK', 'us');
    expect(packApplication(us, VERSION, us.checksum, 'gigaops')).toMatchObject({ kind: 'COUNTRY', key: 'US', section: { rules: { weeklyOtThreshold: 40 } } });
    expect(packApplication(us, VERSION, us.checksum, 'geospatial')).toBeNull();
    expect(packApplication(compiled('METRIC_CATALOGUE' as never, 'operations'), VERSION, us.checksum, 'gigaops')).toBeNull();
    // A pack installed under Workforce before WI-OI-107 (format 1) is still sent, converted.
    const pack = SHIPPED_INDUSTRY_PACKS.find((candidate) => candidate.slug === 'qsr')!;
    const legacy = {
      contractVersion: '1.0', kind: 'INDUSTRY_PACK', moduleKey: 'gigaops', entityKey: 'industry-pack', surfaceKey: 'qsr', title: 'QSR',
      catalogue: {
        slug: 'qsr', label: pack.label, terminology: pack.modules.gigaops!.vocabulary!.terms, roleLabels: pack.modules.gigaops!.vocabulary!.roleLabels,
        classificationLabels: pack.modules.gigaops!.vocabulary!.classificationLabels, requiredCertifications: pack.modules.gigaops!.lists!.certifications,
        defaultPayTypeCode: pack.modules.gigaops!.capabilities!.defaultPayTypeCode, features: pack.modules.gigaops!.capabilities!.features,
        placeTypes: pack.modules.geospatial!.lists!.placeTypes, demoProfile: pack.demo, ...(pack.emoji ? { emoji: pack.emoji } : {}),
      },
      compilerVersion: 'x', checksum: us.checksum,
    };
    expect(packApplication(legacy, VERSION, us.checksum, 'gigaops')!.section).toEqual(pack.modules.gigaops);
  });

  it('posts the section to the module as the member who activated it, with that module permission', async () => {
    expect(parseModuleCallPayload({ operation: 'geospatial.pack-apply', publishedVersionId: VERSION })).toEqual({ operation: 'geospatial.pack-apply', publishedVersionId: VERSION });
    expect(() => parseModuleCallPayload({ operation: 'geospatial.pack-apply', publishedVersionId: 'latest' })).toThrow();
    const agriculture = compiled('INDUSTRY_PACK', 'agriculture');
    const packs = { application: vi.fn(async (_tenant: string, id: string, moduleKey: string) => packApplication(agriculture, id, agriculture.checksum, moduleKey)) };
    const fetchImpl = vi.fn(async () => Response.json({ status: 'APPLIED', createdPlaceTypes: ['FARM'] }));
    const job = moduleCallJob({ getSubjectContext: async () => admin } as never, environment, fetchImpl as never, undefined, packs);
    const result = await job.handler({
      jobId: 'job-7', tenantId: 'tenant-1', ownerSubjectId: 'admin-1', ownerAuthVersion: 3, correlationId: 'pack:act-1', attempt: 1,
      payload: parseModuleCallPayload({ operation: 'geospatial.pack-apply', publishedVersionId: VERSION }), signal: new AbortController().signal,
    });
    expect(packs.application).toHaveBeenCalledWith('tenant-1', VERSION, 'geospatial');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://geospatial-api:4720/v1/pack/apply');
    expect(JSON.parse(String(init.body))).toMatchObject({ kind: 'INDUSTRY', key: 'agriculture', section: { lists: { placeTypes: expect.any(Array) } } });
    const claims = verifyPlatformContextToken(new Headers(init.headers).get('authorization')!.replace('Bearer ', ''), publicKey.export({ format: 'pem', type: 'spki' }).toString(), 'gigalibs-geospatial-api');
    expect(claims).toMatchObject({ sub: 'admin-1', entitlement: { module_key: 'geospatial-studio' } });
    expect(result).toMatchObject({ operation: 'geospatial.pack-apply', status: 200, resultStatus: 'APPLIED' });
  });

  it('refuses for good when the version has no section for the module, or the member lacks its permission', async () => {
    const payload = parseModuleCallPayload({ operation: 'workforce.pack-apply', publishedVersionId: VERSION });
    const run = (permissions: string[], packs: { application: () => Promise<null> }) =>
      moduleCallJob({ getSubjectContext: async () => ({ ...admin, permissions }) } as never, environment, vi.fn() as never, undefined, packs as never).handler({
        jobId: 'job-8', tenantId: 'tenant-1', ownerSubjectId: 'admin-1', ownerAuthVersion: 3, correlationId: 'pack:act-2', attempt: 1, payload, signal: new AbortController().signal,
      });
    await expect(run(['workforce:*'], { application: async () => null })).rejects.toMatchObject({ code: 'PACK_NOT_FOUND' });
    await expect(run(['workforce:read'], { application: async () => null })).rejects.toMatchObject({ code: 'PERMISSION_MISSING' });
    // `<prefix>:*` grants the module's dotted permissions, as the modules check them.
    expect(grants(['maps:*'], 'maps.node-types.manage')).toBe(true);
    expect(grants(['workforce:*'], 'maps.node-types.manage')).toBe(false);
  });
});
