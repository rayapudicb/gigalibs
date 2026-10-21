/**
 * WI-OI-120cc (SPEED S9a): the speed-lab preview's test workspace, on project gigalibs-speed-lab only.
 *
 *   pnpm exec tsx infra/compose/scripts/seed-speed-lab.mts accounts    before the platform API starts
 *   pnpm exec tsx infra/compose/scripts/seed-speed-lab.mts screening   once the web app answers
 *
 * `accounts` writes the two administrators, the workspace "SPEED Lab Preview (TEST)" and its SPEED entitlement into the
 * instance's own database, through its host-published port, so it cannot reach UAT or gigalibs-test. `screening` then
 * works only through the platform API and the web gateway, as a person would: it gives the administrator SPEED's
 * Chemist and Administrator roles, builds and activates an organization with two laboratory sites (the second
 * administrator approves it), imports the TEST FIXTURE criteria and library and puts them in force, and enters the
 * reference route. Every record it makes says TEST FIXTURE. Both phases are idempotent; no value is printed.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { REFERENCE_ROUTE } from '../../../packages/process-safety-engines/test/fixtures/reference-route.js';
import {
  BRD_VALUES,
  CRITERIA_CITATIONS,
  FIXTURE,
  PROTOTYPE_PACK,
} from '../../../modules/process-safety-screening/apps/api/src/test-support/speed-fixtures.js';

const composeDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(composeDir, '../..');

function readEnv(file: string): Record<string, string> {
  return Object.fromEntries(
    readFileSync(join(composeDir, file), 'utf8')
      .split('\n')
      .filter((line) => /^[A-Z][A-Z0-9_]*=/.test(line))
      .map((line) => {
        const at = line.indexOf('=');
        return [line.slice(0, at), line.slice(at + 1).replace(/^"(.*)"$/, '$1')];
      }),
  );
}

const base = readEnv('.env.speed-lab');
const accounts = readEnv('.env.speed-lab.accounts');
if (accounts.SPEED_LAB_TARGET !== 'speed-lab' || base.ENVIRONMENT_KEY !== 'speed-lab-preview') {
  throw new Error('These are not speed-lab files; refusing to seed.');
}
const WORKSPACE = accounts.SPEED_LAB_WORKSPACE as string;
const ADMIN = { email: accounts.SPEED_LAB_ADMIN_EMAIL as string, password: accounts.SPEED_LAB_ADMIN_PASSWORD as string };
const APPROVER = {
  email: accounts.SPEED_LAB_APPROVER_EMAIL as string,
  password: accounts.SPEED_LAB_APPROVER_PASSWORD as string,
};
const API = `http://127.0.0.1:${base.API_PUBLIC_PORT}/api/v1`;
const WEB = `http://127.0.0.1:${base.WEB_PUBLIC_PORT}`;
const MODULE_KEYS = ['tenant-access', 'process-safety-screening'];
const REASON = 'speed-lab preview (TEST FIXTURE)';

// ---------------------------------------------------------------------------------------------------------------------
// Phase 1: accounts, directly in the instance's own database.

async function seedAccounts(): Promise<void> {
  const database = readEnv('.env.speed-lab.database');
  process.env.DATABASE_URL = `postgresql://gigalibs:${encodeURIComponent(database.SPEED_LAB_DATABASE_SUPERUSER_PASSWORD as string)}@127.0.0.1:${base.SPEED_LAB_POSTGRES_HOST_PORT}/gigalibs`;
  const load = (pkg: string) => import(pathToFileURL(join(repoRoot, pkg, 'dist/index.js')).href);
  const { prisma } = await load('packages/db');
  const { hashPassword } = await load('packages/auth-core');
  try {
    const ensureUser = async ({ email, password }: { email: string; password: string }, name: string) => {
      const passwordHash = await hashPassword(password);
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        await prisma.user.update({ where: { id: existing.id }, data: { passwordHash, status: 'ACTIVE' } });
        return existing.id as string;
      }
      const created = await prisma.user.create({
        data: { email, name, status: 'ACTIVE', emailVerifiedAt: new Date(), passwordHash },
      });
      return created.id as string;
    };
    const adminId = await ensureUser(ADMIN, 'SPEED Lab Admin (TEST)');
    const approverId = await ensureUser(APPROVER, 'SPEED Lab Approver (TEST)');
    const slug = WORKSPACE.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    let tenant = await prisma.tenant.findFirst({ where: { name: WORKSPACE } });
    if (!tenant) {
      tenant = await prisma.tenant.create({
        data: {
          slug,
          name: WORKSPACE,
          status: 'ACTIVE',
          features: MODULE_KEYS,
          settings: {
            create: {
              branding: {},
              security: { enforceMfa: false },
              localization: {},
              features: {},
              metadata: { stack: 'gigalibs-speed-lab', testWorkspace: true },
              updatedById: adminId,
            },
          },
        },
      });
    } else {
      await prisma.tenant.update({ where: { id: tenant.id }, data: { features: MODULE_KEYS } });
    }
    for (const userId of [adminId, approverId]) {
      await prisma.tenantMember.upsert({
        where: { userId_tenantId: { tenantId: tenant.id, userId } },
        create: { tenantId: tenant.id, userId, role: 'TENANT_ADMIN', status: 'ACTIVE' },
        update: { status: 'ACTIVE', role: 'TENANT_ADMIN' },
      });
    }
    const now = new Date();
    for (const moduleKey of MODULE_KEYS) {
      const existing = await prisma.tenantModuleEntitlement.findFirst({ where: { tenantId: tenant.id, moduleKey } });
      if (existing) {
        if (existing.status !== 'ENABLED')
          await prisma.tenantModuleEntitlement.update({
            where: { id: existing.id },
            data: { status: 'ENABLED', startsAt: now, endsAt: null, updatedById: adminId },
          });
        continue;
      }
      await prisma.tenantModuleEntitlement.create({
        data: {
          tenantId: tenant.id,
          moduleKey,
          status: 'ENABLED',
          source: 'PLAN',
          startsAt: now,
          reason: 'WI-OI-120cc speed-lab preview seed',
          updatedById: adminId,
        },
      });
    }
    console.log(JSON.stringify({ phase: 'accounts', workspace: WORKSPACE, modules: MODULE_KEYS }));
  } finally {
    await prisma.$disconnect();
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Phase 2: screening data, through the platform API and the web gateway only.

class Session {
  constructor(
    readonly accessToken: string,
    readonly tenantId: string,
  ) {}

  /** A platform API call with this session's bearer token. */
  async api<T>(method: string, path: string, body?: unknown, ok: number[] = [200, 201]): Promise<T> {
    return call<T>(`${API}${path}`, method, { Authorization: `Bearer ${this.accessToken}` }, body, ok);
  }

  /** A web gateway call with this session's cookie, from the instance's own origin (the gateway refuses others). */
  async web<T>(method: string, path: string, body?: unknown, ok: number[] = [200, 201, 202]): Promise<T> {
    return call<T>(
      `${WEB}${path}`,
      method,
      { Cookie: `gigalibs_access_token=${this.accessToken}`, Origin: WEB },
      body,
      ok,
    );
  }
}

class CallError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    where: string,
  ) {
    super(`${where} answered ${status} ${code}`);
  }
}

async function call<T>(
  url: string,
  method: string,
  headers: Record<string, string>,
  body: unknown,
  ok: number[],
): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!ok.includes(response.status)) {
    const record = (payload ?? {}) as Record<string, unknown>;
    const nested = (typeof record.message === 'object' && record.message ? record.message : record) as Record<string, unknown>;
    throw new CallError(response.status, String(nested.code ?? nested.error ?? 'UNKNOWN'), `${method} ${new URL(url).pathname}`);
  }
  return payload as T;
}

async function signIn(person: { email: string; password: string }, tenantId: string): Promise<Session> {
  const login = await call<{ accessToken: string }>(`${API}/auth/login`, 'POST', {}, person, [200]);
  const selected = await call<{ accessToken: string }>(
    `${API}/auth/select-tenant`,
    'POST',
    { Authorization: `Bearer ${login.accessToken}` },
    { tenantId },
    [200],
  );
  return new Session(selected.accessToken, tenantId);
}

async function workspaceId(): Promise<string> {
  const login = await call<{ accessToken: string }>(`${API}/auth/login`, 'POST', {}, ADMIN, [200]);
  const tenants = await call<unknown>(`${API}/tenants`, 'GET', { Authorization: `Bearer ${login.accessToken}` }, undefined, [200]);
  const list = (Array.isArray(tenants) ? tenants : ((tenants as { items?: unknown[] }).items ?? [])) as {
    id?: string;
    tenantId?: string;
    name?: string;
    tenant?: { id: string; name: string };
  }[];
  const found = list.find((entry) => (entry.name ?? entry.tenant?.name) === WORKSPACE);
  const id = found?.id ?? found?.tenantId ?? found?.tenant?.id;
  if (!id) throw new Error('The speed-lab workspace was not found; run the accounts phase first.');
  return id;
}

const items = <T>(value: unknown): T[] =>
  (Array.isArray(value) ? value : ((value as { items?: T[] })?.items ?? [])) as T[];

/** SPEED's Chemist and Administrator roles for the administrator: entering routes, and the criteria and library. */
async function assignRoles(admin: Session): Promise<void> {
  const roles = items<{ id: string; name: string }>(await admin.api('GET', '/tenants/current/roles'));
  const members = items<{ id: string; user?: { email?: string }; email?: string; roleAssignments?: { customRoleId?: string; customRole?: { id: string } }[] }>(
    await admin.api('GET', '/tenants/current/members'),
  );
  const member = members.find((entry) => (entry.user?.email ?? entry.email) === ADMIN.email);
  if (!member) throw new Error('The administrator is not a member of the workspace.');
  const held = new Set((member.roleAssignments ?? []).map((assignment) => assignment.customRoleId ?? assignment.customRole?.id));
  for (const name of ['SPEED Chemist', 'SPEED Administrator']) {
    const role = roles.find((entry) => entry.name === name);
    if (!role) throw new Error(`${name} is not offered: is SPEED switched on for the workspace?`);
    if (held.has(role.id)) continue;
    await admin.api('POST', `/tenants/current/members/${member.id}/role-assignments`, { customRoleId: role.id, reason: REASON });
  }
}

interface OrgVersion {
  id: string;
  status: string;
  lockVersion: number;
}

/** An organization with two laboratory sites, made by the administrator and approved by the second administrator. */
async function activateOrganization(admin: Session, approver: Session): Promise<void> {
  const org = '/tenants/current/organization';
  const trees = items<{ id: string; kind: string }>(await admin.api('GET', `${org}/trees`));
  let tree = trees.find((entry) => entry.kind === 'PRIMARY');
  if (tree) {
    const active = await admin.api<unknown>('GET', `${org}/trees/${tree.id}/active`, undefined, [200, 404]).catch(() => null);
    if (active && (active as { version?: unknown; id?: unknown }).version !== undefined) return;
    if (active && (active as { id?: unknown }).id) return;
  }
  const types = items<{ code: string }>(await admin.api('GET', `${org}/unit-types`));
  if (!types.some((type) => type.code === 'LAB_SITE'))
    await admin.api('POST', `${org}/unit-types`, {
      code: 'LAB_SITE',
      labels: { one: 'Laboratory site', other: 'Laboratory sites' },
      holdsRecords: true,
      allowAsRoot: true,
      description: 'TEST FIXTURE: a laboratory site of the speed-lab preview.',
    });
  const units = items<{ id: string; code: string }>(await admin.api('GET', `${org}/units?limit=100`));
  const today = new Date().toISOString().slice(0, 10);
  const siteIds: string[] = [];
  for (const [code, name] of [
    ['PD-LAB', 'Process Development Laboratory (TEST FIXTURE)'],
    ['KILO-LAB', 'Kilo Laboratory (TEST FIXTURE)'],
  ] as const) {
    const existing = units.find((unit) => unit.code === code);
    siteIds.push(
      existing
        ? existing.id
        : (await admin.api<{ id: string }>('POST', `${org}/units`, { typeCode: 'LAB_SITE', code, name, effectiveFrom: today })).id,
    );
  }
  tree ??= await admin.api<{ id: string; kind: string }>('POST', `${org}/trees`, {
    code: 'primary',
    name: 'Organization',
    kind: 'PRIMARY',
    purpose: 'AUTHORITY',
  });
  const read = async (id: string) => {
    const body = await admin.api<{ version?: OrgVersion } & OrgVersion>('GET', `${org}/versions/${id}`);
    return body.version ?? body;
  };
  const versions = items<OrgVersion>(await admin.api('GET', `${org}/trees/${tree.id}/versions`));
  let version =
    versions.find((entry) => !['PUBLISHED', 'SUPERSEDED', 'REJECTED', 'WITHDRAWN'].includes(entry.status)) ??
    (await admin.api<{ version?: OrgVersion } & OrgVersion>('POST', `${org}/trees/${tree.id}/versions`, { reason: REASON }));
  version = 'version' in version && version.version ? version.version : version;
  if (version.status === 'DRAFT') {
    await admin.api('PATCH', `${org}/versions/${version.id}/edges`, {
      expectedVersion: (await read(version.id)).lockVersion,
      upsert: siteIds.map((unitId, sortOrder) => ({ unitId, parentUnitId: null, sortOrder })),
    });
    await admin.api('POST', `${org}/versions/${version.id}/validate`, { expectedVersion: (await read(version.id)).lockVersion });
  }
  const step = async (session: Session, action: string, from: string[]) => {
    const current = await read(version.id);
    if (from.includes(current.status))
      await session.api('POST', `${org}/versions/${version.id}/${action}`, { expectedVersion: current.lockVersion, reason: REASON });
  };
  await step(admin, 'submit', ['DRAFT', 'VALIDATED']);
  await step(approver, 'approve', ['SUBMITTED']);
  await step(admin, 'publish', ['APPROVED']);
  await admin.api('POST', `${org}/activations`, { versionId: version.id, reason: REASON, idempotencyKey: `speed-lab-${version.id}` });
}

/** The TEST FIXTURE criteria and library, imported and put in force (skipped when a set is already in force). */
async function importSets(admin: Session): Promise<void> {
  for (const kind of ['criteria-sets', 'library-sets'] as const) {
    const sets = items<{ id: string; inForce: boolean; version: number }>(await admin.web('GET', `/api/speed/v1/${kind}`));
    if (sets.some((set) => set.inForce)) continue;
    const body =
      kind === 'criteria-sets'
        ? { versionLabel: 'brd-0.1-test-fixture', source: FIXTURE, criteria: BRD_VALUES, citations: CRITERIA_CITATIONS }
        : { versionLabel: 'prototype-0.1-test-fixture', source: FIXTURE, library: PROTOTYPE_PACK };
    const imported = await admin.web<{ id: string; version: number }>('POST', `/api/speed/v1/${kind}`, { requestKey: randomUUID(), ...body });
    await admin.web('POST', `/api/speed/v1/${kind}/${imported.id}/put-in-force`, { version: imported.version, reason: REASON });
  }
}

/** Retries while SPEED is still waiting for the organization version (503), for up to two minutes. */
async function untilDelivered<T>(work: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await work();
    } catch (error) {
      if (!(error instanceof CallError) || error.status !== 503 || attempt >= 60) throw error;
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
  }
}

/** The reference route, entered step by step as a chemist would, once SPEED holds the organization's sites. */
async function enterReferenceRoute(admin: Session): Promise<void> {
  // The kernel delivers the organization version to SPEED shortly after activation; until then SPEED answers 503.
  const projects = await untilDelivered(async () =>
    items<{ code: string }>(await admin.web('GET', '/api/speed/v1/projects?search=REF-TEST')),
  );
  if (projects.some((project) => project.code === 'REF-TEST')) return;
  const sites = items<{ value: string; label: string }>(await admin.web('GET', '/api/control/v1/lookups/organization-units?limit=20'));
  const site = sites.find((entry) => entry.label.startsWith('Process Development'))?.value ?? sites[0]?.value;
  if (!site) throw new Error('No organization site is offered yet.');
  const project = await admin.web<{ id: string }>('POST', '/api/speed/v1/projects', {
    requestKey: randomUUID(),
    code: 'REF-TEST',
    name: 'Reference route (TEST FIXTURE)',
    siteUnitId: site,
  });
  const route = await admin.web<{ id: string }>('POST', '/api/speed/v1/routes', {
    requestKey: randomUUID(),
    projectId: project.id,
    name: 'Reference route (TEST FIXTURE)',
  });
  const substanceIds = new Map<string, string>();
  for (const fixture of REFERENCE_ROUTE) {
    const step = (
      await admin.web<{ step: { id: string } }>('POST', `/api/speed/v1/routes/${route.id}/steps`, {
        requestKey: randomUUID(),
        reason: 'Data entry',
        name: `${fixture.id} (TEST FIXTURE)`,
      })
    ).step;
    for (const material of fixture.materials) {
      let substanceId = substanceIds.get(material.formula);
      if (!substanceId) {
        const substance = await admin.web<{ id: string }>('POST', '/api/speed/v1/substances', {
          requestKey: randomUUID(),
          name: `TEST FIXTURE ${material.formula}`,
          formula: material.formula,
          ...(material.libraryMaterialId ? { libraryMaterialId: material.libraryMaterialId } : {}),
        });
        substanceId = substance.id;
        substanceIds.set(material.formula, substanceId);
      }
      await admin.web('POST', `/api/speed/v1/steps/${step.id}/materials`, {
        requestKey: randomUUID(),
        reason: 'Data entry',
        substanceId,
        role: material.role,
        ...(typeof material.coefficient === 'number' ? { coefficient: material.coefficient } : {}),
        ...(typeof material.massG === 'number' ? { massG: material.massG } : {}),
      });
    }
    const c = fixture.conditions;
    await admin.web('PUT', `/api/speed/v1/steps/${step.id}/conditions`, {
      version: 0,
      reason: 'Data entry',
      processTemperatureC: c.processTemperatureC,
      maximumTechnicalTemperatureC: c.maximumTechnicalTemperatureC,
      heatCapacityJPerGK: c.heatCapacityJPerGK,
      accumulationPercent: c.accumulationPercent,
      reactionEnthalpySource: c.reactionEnthalpy?.source ?? null,
      reactionClassId: c.reactionEnthalpy?.source === 'REACTION_CLASS' ? c.reactionEnthalpy.reactionClassId : null,
    });
    const cited = { reason: 'Literature value', basis: 'LITERATURE', citation: FIXTURE };
    if (c.dscOnsetC !== null)
      await admin.web('POST', `/api/speed/v1/steps/${step.id}/thermal-data`, { requestKey: randomUUID(), ...cited, kind: 'DSC_ONSET', onsetC: c.dscOnsetC });
    if (c.decomposition)
      await admin.web('POST', `/api/speed/v1/steps/${step.id}/thermal-data`, {
        requestKey: randomUUID(),
        ...cited,
        kind: 'DECOMPOSITION_KINETICS',
        ...c.decomposition,
      });
    if (c.td24EnteredC !== null)
      await admin.web('POST', `/api/speed/v1/steps/${step.id}/thermal-data`, { requestKey: randomUUID(), ...cited, kind: 'TD24', td24C: c.td24EnteredC });
  }
}

async function seedScreening(): Promise<void> {
  const tenantId = await workspaceId();
  let admin = await signIn(ADMIN, tenantId);
  const approver = await signIn(APPROVER, tenantId);
  await assignRoles(admin);
  // A fresh sign-in carries the roles just given.
  admin = await signIn(ADMIN, tenantId);
  await activateOrganization(admin, approver);
  await importSets(admin);
  await enterReferenceRoute(admin);
  console.log(JSON.stringify({ phase: 'screening', workspace: WORKSPACE, open: `${WEB}/speed/routes` }));
}

const phase = process.argv[2];
if (phase === 'accounts') await seedAccounts();
else if (phase === 'screening') await seedScreening();
else {
  console.error('Usage: seed-speed-lab.mts accounts|screening');
  process.exit(2);
}
