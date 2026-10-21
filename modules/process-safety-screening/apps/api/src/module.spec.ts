/**
 * SPEED (WI-OI-120bw, from `pnpm module:new`): configuration, signed-context authorization on the real project routes,
 * and the V1 project contract. Database behaviour is in `projects.service.integration.test.ts`; live behaviour is checked
 * by `pnpm module:conformance process-safety-screening --live`.
 */
import 'reflect-metadata';
import { generateKeyPairSync } from 'node:crypto';
import { type PlatformContextV1, signPlatformContextToken } from '@gigalibs/auth-core';
import {
  ArchiveSpeedProjectInputV1Schema,
  CreateSpeedProjectInputV1Schema,
  UpdateSpeedProjectInputV1Schema,
} from '@gigalibs/contracts';
import { type ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { AuthorizationGuard } from './authorization.js';
import { AUDIENCE, MODULE_KEY, runtimeConfigProvider } from './config.js';
import { CriteriaController } from './criteria/criteria.controller.js';
import type { DatabaseService } from './database.service.js';
import { DossiersController, RouteDossiersController } from './dossiers/dossiers.controller.js';
import { LibraryController } from './library/library.controller.js';
import { ProjectsController } from './projects/projects.controller.js';
import {
  MaterialsController,
  RoutesController,
  StepsController,
} from './routes/routes.controller.js';
import { SubstancesController } from './substances/substances.controller.js';

const pem = {
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
} as const;
const signer = generateKeyPairSync('ed25519', pem);
const publicKeyBase64 = generateKeyPairSync('ed25519')
  .publicKey.export({ format: 'der', type: 'spki' })
  .toString('base64');

const environment = {
  SPEED_PLATFORM_CONTEXT_AUDIENCE: AUDIENCE,
  SPEED_API_HOST: '0.0.0.0',
  SPEED_API_PORT: '4790',
  SPEED_CORS_ORIGINS: 'http://127.0.0.1:5180',
  SPEED_DATABASE_URL: 'postgresql://runtime:secret@postgres:5432/gigalibs',
  SPEED_DATABASE_POOL_SIZE: '10',
  SPEED_EXPECTED_MIGRATION_VERSION: '5',
  SPEED_PLATFORM_CONTEXT_PUBLIC_KEY_BASE64: publicKeyBase64,
};

function claims(overrides: Partial<PlatformContextV1> = {}): PlatformContextV1 {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: 'gigalibs-control-plane',
    aud: AUDIENCE,
    sub: 'user00000000000000000001',
    tenant_id: 'tenant000000000000000001',
    session_id: 'session-1',
    auth_version: 1,
    roles: ['TENANT_ADMIN'],
    granted_scopes: ['speed.routes.read'],
    persona_type: 'TENANT_ADMIN',
    org_scope: { mode: 'FLAT_TENANT' },
    entitlement: { module_key: MODULE_KEY, status: 'ENABLED', version: 'v1' },
    iat: now,
    exp: now + 60,
    jti: 'jti-1',
    ...overrides,
  };
}

function authorize(handler: keyof ProjectsController, overrides: Partial<PlatformContextV1> = {}) {
  const request = {
    headers: {
      authorization: `Bearer ${signPlatformContextToken(claims(overrides), signer.privateKey)}`,
    },
  };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ProjectsController.prototype[handler],
    getClass: () => ProjectsController,
  } as unknown as ExecutionContext;
  const database = { isContextRevoked: async () => false } as unknown as DatabaseService;
  const config = { platformContextPublicKey: signer.publicKey, platformContextAudience: AUDIENCE };
  return new AuthorizationGuard(config as never, database).canActivate(context);
}

/** Signs a context with `scopes` and asks the real guard whether it may call `controller.handler`. */
function guarded(controller: { prototype: object }, handler: string, scopes: string[]) {
  const request = {
    headers: {
      authorization: `Bearer ${signPlatformContextToken(claims({ granted_scopes: scopes }), signer.privateKey)}`,
    },
  };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => (controller.prototype as Record<string, unknown>)[handler],
    getClass: () => controller,
  } as unknown as ExecutionContext;
  const database = { isContextRevoked: async () => false } as unknown as DatabaseService;
  const config = { platformContextPublicKey: signer.publicKey, platformContextAudience: AUDIENCE };
  return new AuthorizationGuard(config as never, database).canActivate(context);
}

// WI-OI-120bx (SPEED S4, plan v1.4 §3.2 and §4.4): each route's permission, by role. Reading needs speed.routes.read;
// changing a route's content speed.routes.write; substances speed.substances.write; recomputing speed.engines.run;
// importing or putting criteria in force speed.settings.manage (the SPEED Administrator).
const ROUTE_PERMISSIONS: readonly [{ prototype: object; name: string }, string, string][] = [
  [CriteriaController, 'list', 'speed.routes.read'],
  [CriteriaController, 'get', 'speed.routes.read'],
  [CriteriaController, 'import', 'speed.settings.manage'],
  [CriteriaController, 'putInForce', 'speed.settings.manage'],
  [LibraryController, 'list', 'speed.routes.read'],
  [LibraryController, 'get', 'speed.routes.read'],
  [LibraryController, 'import', 'speed.settings.manage'],
  [LibraryController, 'putInForce', 'speed.settings.manage'],
  [SubstancesController, 'list', 'speed.routes.read'],
  [SubstancesController, 'get', 'speed.routes.read'],
  [SubstancesController, 'create', 'speed.substances.write'],
  [SubstancesController, 'update', 'speed.substances.write'],
  [SubstancesController, 'archive', 'speed.substances.write'],
  [RoutesController, 'list', 'speed.routes.read'],
  [RoutesController, 'get', 'speed.routes.read'],
  [RoutesController, 'results', 'speed.routes.read'],
  [RoutesController, 'create', 'speed.routes.write'],
  [RoutesController, 'update', 'speed.routes.write'],
  [RoutesController, 'archive', 'speed.routes.write'],
  [RoutesController, 'addStep', 'speed.routes.write'],
  [RoutesController, 'recompute', 'speed.engines.run'],
  [StepsController, 'update', 'speed.routes.write'],
  [StepsController, 'move', 'speed.routes.write'],
  [StepsController, 'remove', 'speed.routes.write'],
  [StepsController, 'addMaterial', 'speed.routes.write'],
  [StepsController, 'replaceConditions', 'speed.routes.write'],
  [StepsController, 'addThermalData', 'speed.thermal-data.write'],
  [StepsController, 'replaceMitigation', 'speed.routes.write'],
  [StepsController, 'documentControl', 'speed.routes.write'],
  [MaterialsController, 'update', 'speed.routes.write'],
  [MaterialsController, 'remove', 'speed.routes.write'],
  [MaterialsController, 'setEnergeticGroups', 'speed.routes.write'],
  // WI-OI-120ca (S7): dossiers and exports need only speed.routes.read (plan v1.4 §4.4).
  [RouteDossiersController, 'request', 'speed.routes.read'],
  [RouteDossiersController, 'list', 'speed.routes.read'],
  [RouteDossiersController, 'exportJson', 'speed.routes.read'],
  [RouteDossiersController, 'exportCsv', 'speed.routes.read'],
  [DossiersController, 'get', 'speed.routes.read'],
  [DossiersController, 'download', 'speed.routes.read'],
];

describe('SPEED authorization on every S4 route (WI-OI-120bx)', () => {
  it.each(
    ROUTE_PERMISSIONS.map(
      ([controller, handler, permission]) =>
        [`${controller.name}.${handler}`, controller, handler, permission] as const,
    ),
  )('%s needs %s', async (_name, controller, handler, permission) => {
    await expect(guarded(controller, handler, [permission])).resolves.toBe(true);
    const others = [
      'speed.routes.read',
      'speed.routes.write',
      'speed.substances.write',
      'speed.thermal-data.write',
      'speed.engines.run',
      'speed.settings.manage',
    ].filter((scope) => scope !== permission);
    await expect(guarded(controller, handler, others)).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('SPEED runtime configuration', () => {
  const load = (overrides: Record<string, string> = {}) => {
    const saved = { ...process.env };
    Object.assign(process.env, environment, overrides);
    try {
      return (runtimeConfigProvider as { useFactory: () => unknown }).useFactory();
    } finally {
      process.env = saved;
    }
  };
  it('loads the SPEED_* variables', () => {
    expect(load()).toMatchObject({
      platformContextAudience: AUDIENCE,
      expectedMigrationVersion: 5,
    });
  });
  it('refuses another audience', () => {
    expect(() => load({ SPEED_PLATFORM_CONTEXT_AUDIENCE: 'gigalibs-other-api' })).toThrow(AUDIENCE);
  });
});

describe('SPEED authorization on the real project routes (plan v1.4 §3.2)', () => {
  it('lets a reader list and open projects', async () => {
    await expect(authorize('list')).resolves.toBe(true);
    await expect(authorize('get')).resolves.toBe(true);
  });
  it('refuses a reader who tries to create, change or archive a project', async () => {
    await expect(authorize('create')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(authorize('update')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(authorize('archive')).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('lets a writer create, change and archive a project', async () => {
    for (const handler of ['create', 'update', 'archive'] as const) {
      await expect(authorize(handler, { granted_scopes: ['speed.routes.write'] })).resolves.toBe(
        true,
      );
    }
  });
  it('refuses a member without any SPEED permission', async () => {
    await expect(authorize('list', { granted_scopes: ['products:read'] })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
  it('refuses a context for another module', async () => {
    await expect(
      authorize('list', {
        entitlement: { module_key: 'asset-maintenance', status: 'ENABLED', version: 'v1' },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('refuses a context for another audience', async () => {
    await expect(authorize('list', { aud: 'gigalibs-cmms-api' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});

describe('SPEED V1 project contract', () => {
  const requestKey = '5b9f7c1e-4d2a-4e8b-9c3f-1a2b3c4d5e6f';
  const project = { requestKey, code: 'P-1', name: 'Route scouting', siteUnitId: 'unit-north' };
  it('requires a request key, a code, a name and a site', () => {
    expect(CreateSpeedProjectInputV1Schema.safeParse(project).success).toBe(true);
    expect(CreateSpeedProjectInputV1Schema.safeParse({ ...project, requestKey: 'x' }).success).toBe(
      false,
    );
    for (const field of ['code', 'name', 'siteUnitId'] as const) {
      expect(CreateSpeedProjectInputV1Schema.safeParse({ ...project, [field]: '  ' }).success).toBe(
        false,
      );
    }
  });
  it('refuses a tenant, creator or status in the body', () => {
    for (const extra of [{ tenantId: 'x' }, { createdBy: 'x' }, { status: 'ARCHIVED' }]) {
      expect(CreateSpeedProjectInputV1Schema.safeParse({ ...project, ...extra }).success).toBe(
        false,
      );
    }
  });
  it('needs the row version, a reason and at least one change to change a project', () => {
    expect(
      UpdateSpeedProjectInputV1Schema.safeParse({ version: 1, reason: 'Renamed', name: 'B' })
        .success,
    ).toBe(true);
    expect(UpdateSpeedProjectInputV1Schema.safeParse({ version: 1, name: 'B' }).success).toBe(
      false,
    );
    expect(
      UpdateSpeedProjectInputV1Schema.safeParse({ version: 1, reason: 'Nothing' }).success,
    ).toBe(false);
    expect(
      UpdateSpeedProjectInputV1Schema.safeParse({ version: 1, reason: 'Code', code: 'P-2' })
        .success,
    ).toBe(false);
  });
  it('needs the row version and a reason to archive a project', () => {
    expect(
      ArchiveSpeedProjectInputV1Schema.safeParse({ version: 2, reason: 'Programme stopped' })
        .success,
    ).toBe(true);
    expect(ArchiveSpeedProjectInputV1Schema.safeParse({ version: 2, reason: ' ' }).success).toBe(
      false,
    );
  });
});
