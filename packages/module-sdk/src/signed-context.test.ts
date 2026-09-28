/**
 * WI-OI-085a — the SDK's signed-context guard, command helpers and runtime configuration for new modules. Each
 * refusal path of the certified CMMS guard is exercised with real Ed25519-signed platform contexts.
 */
import 'reflect-metadata';
import { generateKeyPairSync } from 'node:crypto';
import { type PlatformContextV1, signPlatformContextToken } from '@gigalibs/auth-core';
import {
  BadRequestException,
  ConflictException,
  type ExecutionContext,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import {
  type ModuleCommandContext,
  RequirePermissions,
  SignedContextGuardBase,
  hasModulePermission,
  loadModuleRuntimeConfig,
  moduleErrors,
  recordMutation,
} from './index.js';

const pem = { privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } } as const;
const signer = generateKeyPairSync('ed25519', pem);
const stranger = generateKeyPairSync('ed25519', pem);
const AUDIENCE = 'gigalibs-inspections-api';

const options = {
  label: 'Inspections',
  moduleKey: 'inspections',
  entitlementName: 'Inspections & Safety',
  permissionPrefix: 'inspections',
  publicKey: signer.publicKey,
  audience: AUDIENCE,
};

function claims(overrides: Partial<PlatformContextV1> = {}): PlatformContextV1 {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: 'gigalibs-control-plane',
    aud: AUDIENCE,
    sub: 'user00000000000000000001',
    tenant_id: 'tenant000000000000000001',
    session_id: 'session-1',
    auth_version: 3,
    roles: ['TENANT_ADMIN'],
    granted_scopes: ['inspections.records.read'],
    persona_type: 'TENANT_ADMIN',
    org_scope: { mode: 'FLAT_TENANT' },
    entitlement: { module_key: 'inspections', status: 'ENABLED', version: 'v1' },
    iat: now,
    exp: now + 60,
    jti: 'jti-1',
    ...overrides,
  };
}

const sign = (overrides: Partial<PlatformContextV1> = {}, key = signer.privateKey) =>
  signPlatformContextToken(claims(overrides), key);

// Routes carry permissions the way Nest applies them: on the handler, overriding the controller.
function readHandler() {}
function openHandler() {}
function Controller() {}
RequirePermissions('inspections.records.read')({}, 'read', { value: readHandler });
RequirePermissions('inspections.records.manage')(Controller);

function run(
  authorization: string | undefined,
  { handler = readHandler as object, revoked = false as boolean | Error } = {},
) {
  const database = {
    isContextRevoked: vi.fn(async () => {
      if (revoked instanceof Error) throw revoked;
      return revoked;
    }),
  };
  const request: Record<string, any> = { headers: authorization === undefined ? {} : { authorization } };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getClass: () => Controller,
  } as unknown as ExecutionContext;
  return { result: new SignedContextGuardBase(options, database).canActivate(context), request, database };
}

describe('SignedContextGuardBase', () => {
  it('admits a valid context and derives the principal from the signed token only', async () => {
    const { result, request, database } = run(`Bearer ${sign()}`);
    await expect(result).resolves.toBe(true);
    expect(request.modulePrincipal).toMatchObject({
      tenantId: 'tenant000000000000000001',
      subject: 'user00000000000000000001',
      departmentScope: { mode: 'ALL' },
      placeScope: { mode: 'ALL' },
    });
    expect(database.isContextRevoked).toHaveBeenCalledWith({
      tenantId: 'tenant000000000000000001',
      subject: 'user00000000000000000001',
      sessionId: 'session-1',
      authVersion: 3,
    });
  });

  it.each([
    ['no Authorization header', undefined],
    ['another scheme', `Basic ${sign()}`],
    ['a token signed with another key', `Bearer ${sign({}, stranger.privateKey)}`],
    ['another audience', `Bearer ${sign({ aud: 'gigalibs-cmms-api' })}`],
    ['an expired token', `Bearer ${sign({ iat: 1, exp: 2 })}`],
  ])('refuses %s with 401', async (_label, authorization) => {
    await expect(run(authorization).result).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it.each([
    ['another module entitlement', { entitlement: { module_key: 'asset-maintenance', status: 'ENABLED', version: 'v1' } }],
    ['a missing permission', { granted_scopes: ['inspections.records.list'] }],
  ] as const)('refuses %s with 403', async (_label, overrides) => {
    await expect(run(`Bearer ${sign(overrides as Partial<PlatformContextV1>)}`).result).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('cannot even carry a disabled entitlement: the signed context format allows only ENABLED', () => {
    expect(() =>
      sign({ entitlement: { module_key: 'inspections', status: 'DISABLED' as 'ENABLED', version: 'v1' } }),
    ).toThrow('Invalid platform context payload');
  });

  it('uses the controller permission when the handler has none', async () => {
    const reader = run(`Bearer ${sign()}`, { handler: openHandler });
    await expect(reader.result).rejects.toThrow('Missing required permission: inspections.records.manage');
    const manager = run(`Bearer ${sign({ granted_scopes: ['inspections.records.manage'] })}`, { handler: openHandler });
    await expect(manager.result).resolves.toBe(true);
  });

  it('refuses a revoked session with 401 and an unavailable revocation store with 503', async () => {
    await expect(run(`Bearer ${sign()}`, { revoked: true }).result).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(run(`Bearer ${sign()}`, { revoked: new Error('down') }).result).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('grants through *, the module wildcard or the exact permission only', () => {
    expect(hasModulePermission(['*'], 'inspections.records.read', 'inspections')).toBe(true);
    expect(hasModulePermission(['inspections:*'], 'inspections.records.read', 'inspections')).toBe(true);
    expect(hasModulePermission(['inspections.records.read'], 'inspections.records.read', 'inspections')).toBe(true);
    expect(hasModulePermission(['cmms:*'], 'inspections.records.read', 'inspections')).toBe(false);
    expect(hasModulePermission(['inspections.records'], 'inspections.records.read', 'inspections')).toBe(false);
  });
});

describe('module command helpers', () => {
  const context: ModuleCommandContext = {
    principal: {
      tenantId: 'tenant-1',
      subject: 'user-1',
      sessionId: 'session-1',
      authVersion: 1,
      permissions: [],
      roles: [],
      persona: 'TENANT_ADMIN',
      departmentScope: { mode: 'ALL' },
      placeScope: { mode: 'ALL' },
    },
    correlationId: 'corr-1',
  };

  it('writes audit and outbox rows in the given schema and topic, in that order', async () => {
    const query = vi.fn(async () => ({}));
    await recordMutation({ query }, { schema: 'gigalibs_inspections', topic: 'inspections.facts.v1' }, context, {
      action: 'RECORD_CREATED',
      aggregateType: 'record',
      aggregateId: 'id-1',
      aggregateVersion: 1,
      payload: { title: 'Weekly round' },
    });
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0]![0]).toContain('INSERT INTO gigalibs_inspections.audit_events');
    expect(query.mock.calls[0]![1]).toEqual(expect.arrayContaining(['tenant-1', 'user-1', 'RECORD_CREATED', 'corr-1']));
    expect(query.mock.calls[1]![0]).toContain('INSERT INTO gigalibs_inspections.outbox_events');
    expect(query.mock.calls[1]![1]).toEqual(
      expect.arrayContaining(['tenant-1', 'inspections.facts.v1', 'RECORD_CREATED_V1', 'record', 'id-1', 1]),
    );
  });

  it.each([
    [{ schema: 'gigalibs_x; DROP TABLE y', topic: 'x.facts.v1' }, 'schema'],
    [{ schema: 'gigalibs_x', topic: 'not a topic' }, 'topic'],
  ])('refuses an unsafe %o', async (recordOptions, field) => {
    const query = vi.fn(async () => ({}));
    await expect(
      recordMutation({ query }, recordOptions, context, {
        action: 'RECORD_CREATED',
        aggregateType: 'record',
        aggregateId: 'id-1',
        aggregateVersion: 1,
        payload: {},
      }),
    ).rejects.toThrow(field);
    expect(query).not.toHaveBeenCalled();
  });

  it('maps errors to codes carrying the module prefix', () => {
    const errors = moduleErrors('INSPECTIONS', 'Inspections');
    expect(() => errors.notFound('Record')).toThrow(NotFoundException);
    expect(() => errors.versionConflict('Record')).toThrow(ConflictException);
    expect(() => errors.assertUuid('nope', 'id')).toThrow(BadRequestException);
    expect(() => errors.translateConstraint({ code: '23505' }, { unique: 'Duplicate.' })).toThrow(ConflictException);
    const failing = { safeParse: () => ({ success: false as const, error: { issues: [{ path: ['title'], message: 'Required' }] } }) };
    try {
      errors.parseInput(failing, {});
      expect.unreachable();
    } catch (error) {
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: 'INSPECTIONS_VALIDATION_FAILED',
        issues: [{ path: 'title', message: 'Required' }],
      });
    }
    expect(() => moduleErrors('bad-prefix', 'X')).toThrow('codePrefix');
  });
});

describe('module runtime configuration', () => {
  const publicKeyBase64 = generateKeyPairSync('ed25519').publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
  const environment = {
    INSPECTIONS_PLATFORM_CONTEXT_AUDIENCE: AUDIENCE,
    INSPECTIONS_API_HOST: '0.0.0.0',
    INSPECTIONS_API_PORT: '4800',
    INSPECTIONS_CORS_ORIGINS: 'http://127.0.0.1:5180',
    INSPECTIONS_DATABASE_URL: 'postgresql://runtime:secret@postgres:5432/gigalibs',
    INSPECTIONS_DATABASE_POOL_SIZE: '10',
    INSPECTIONS_EXPECTED_MIGRATION_VERSION: '1',
    INSPECTIONS_PLATFORM_CONTEXT_PUBLIC_KEY_BASE64: publicKeyBase64,
  };
  const load = (overrides: Record<string, string | undefined> = {}) =>
    loadModuleRuntimeConfig({ prefix: 'INSPECTIONS', audience: AUDIENCE, schemaContractVersion: 1 }, {
      ...environment,
      ...overrides,
    });

  it('loads a complete configuration', () => {
    expect(load()).toMatchObject({ apiPort: 4800, databasePoolSize: 10, expectedMigrationVersion: 1, platformContextAudience: AUDIENCE });
    expect(load().platformContextPublicKey).toContain('BEGIN PUBLIC KEY');
  });

  it.each([
    [{ INSPECTIONS_PLATFORM_CONTEXT_AUDIENCE: 'gigalibs-cmms-api' }, 'INSPECTIONS_PLATFORM_CONTEXT_AUDIENCE must equal'],
    [{ INSPECTIONS_API_PORT: '80a' }, 'INSPECTIONS_API_PORT must be an integer'],
    [{ INSPECTIONS_DATABASE_URL: 'mysql://x/y' }, 'INSPECTIONS_DATABASE_URL must use postgresql'],
    [{ INSPECTIONS_EXPECTED_MIGRATION_VERSION: '2' }, 'INSPECTIONS_EXPECTED_MIGRATION_VERSION must be an integer between 1 and 1'],
    [{ INSPECTIONS_PLATFORM_CONTEXT_PUBLIC_KEY_BASE64: undefined }, 'Configure exactly one of INSPECTIONS_PLATFORM_CONTEXT_PUBLIC_KEY'],
    [{ INSPECTIONS_PLATFORM_CONTEXT_PUBLIC_KEY_BASE64: 'bm90IGEga2V5' }, 'must be an Ed25519 public key'],
    [{ INSPECTIONS_CORS_ORIGINS: ' , ' }, 'INSPECTIONS_CORS_ORIGINS must contain at least one origin'],
  ])('refuses %o', (overrides, message) => {
    expect(() => load(overrides)).toThrow(message);
  });
});
