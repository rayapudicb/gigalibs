import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { OrganizationService as OrganizationServiceType } from './organization.service.js';

// WI-OI-109g: the same APIs configure unrelated industries and government without code or seeded hierarchy levels.
// The explicit marker prevents this attributable test data from ever reaching a developer or customer database.
const databaseUrl = process.env.ORG_TEST_DATABASE_URL;
const integration = describe.skipIf(!databaseUrl);
const run = randomUUID().slice(0, 8);
const author = `reference-author-${run}`;
const checker = `reference-checker-${run}`;
const operator = `reference-operator-${run}`;

interface ReferenceType {
  code: string;
  one: string;
  other: string;
  holdsRecords: boolean;
  root?: boolean;
  parents?: string[];
  capabilities?: Array<'LEGAL_ENTITY' | 'OPERATIONAL' | 'REPORTING' | 'WORKFORCE' | 'COST_ACCOUNTING' | 'PLACE_OPERATING'>;
}

interface ReferenceUnit {
  code: string;
  name: string;
  type: string;
  parent?: string;
  place?: boolean;
}

interface ReferenceStructure {
  key: string;
  types: ReferenceType[];
  units: ReferenceUnit[];
  grantRoot: string;
}

const structures: ReferenceStructure[] = [
  {
    key: 'retail',
    types: [
      { code: 'COMPANY', one: 'Company', other: 'Companies', holdsRecords: false, root: true, capabilities: ['LEGAL_ENTITY'] },
      { code: 'REGION', one: 'Region', other: 'Regions', holdsRecords: false, parents: ['COMPANY'] },
      { code: 'DISTRICT', one: 'District', other: 'Districts', holdsRecords: false, parents: ['REGION'] },
      { code: 'STORE', one: 'Store', other: 'Stores', holdsRecords: true, parents: ['DISTRICT'], capabilities: ['OPERATIONAL', 'WORKFORCE', 'PLACE_OPERATING'] },
    ],
    units: [
      { code: 'FRESHMART', name: 'FreshMart Group', type: 'COMPANY' },
      { code: 'WEST', name: 'Western Region', type: 'REGION', parent: 'FRESHMART' },
      { code: 'SEA', name: 'Seattle District', type: 'DISTRICT', parent: 'WEST' },
      { code: 'SEA-101', name: 'Seattle Store 101', type: 'STORE', parent: 'SEA', place: true },
    ],
    grantRoot: 'WEST',
  },
  {
    key: 'government',
    types: [
      { code: 'DEPARTMENT', one: 'Department', other: 'Departments', holdsRecords: false, root: true, capabilities: ['LEGAL_ENTITY'] },
      { code: 'DIRECTORATE', one: 'Directorate', other: 'Directorates', holdsRecords: false, parents: ['DEPARTMENT'] },
      { code: 'DISTRICT_OFFICE', one: 'District office', other: 'District offices', holdsRecords: true, parents: ['DIRECTORATE'], capabilities: ['REPORTING'] },
      { code: 'TALUK_OFFICE', one: 'Taluk office', other: 'Taluk offices', holdsRecords: true, parents: ['DISTRICT_OFFICE'] },
      { code: 'HEALTH_CENTRE', one: 'Health centre', other: 'Health centres', holdsRecords: true, parents: ['TALUK_OFFICE', 'HEALTH_CENTRE'], capabilities: ['OPERATIONAL', 'PLACE_OPERATING'] },
    ],
    units: [
      { code: 'HEALTH', name: 'State Health Department', type: 'DEPARTMENT' },
      { code: 'PUBLIC-HEALTH', name: 'Directorate of Public Health', type: 'DIRECTORATE', parent: 'HEALTH' },
      { code: 'MYSURU', name: 'Mysuru District Office', type: 'DISTRICT_OFFICE', parent: 'PUBLIC-HEALTH' },
      { code: 'NANJANGUD', name: 'Nanjangud Taluk Office', type: 'TALUK_OFFICE', parent: 'MYSURU' },
      { code: 'CHC-1', name: 'Community Health Centre', type: 'HEALTH_CENTRE', parent: 'NANJANGUD', place: true },
      { code: 'PHC-1', name: 'Primary Health Centre', type: 'HEALTH_CENTRE', parent: 'CHC-1', place: true },
      { code: 'SUB-1', name: 'Sub-centre', type: 'HEALTH_CENTRE', parent: 'PHC-1', place: true },
    ],
    grantRoot: 'MYSURU',
  },
  {
    key: 'manufacturing',
    types: [
      { code: 'GROUP', one: 'Group', other: 'Groups', holdsRecords: false, root: true },
      { code: 'COMPANY', one: 'Company', other: 'Companies', holdsRecords: false, parents: ['GROUP'], capabilities: ['LEGAL_ENTITY'] },
      { code: 'PLANT', one: 'Plant', other: 'Plants', holdsRecords: false, parents: ['COMPANY'], capabilities: ['OPERATIONAL', 'PLACE_OPERATING'] },
      { code: 'FUNCTION', one: 'Plant function', other: 'Plant functions', holdsRecords: true, parents: ['PLANT'], capabilities: ['WORKFORCE', 'COST_ACCOUNTING'] },
    ],
    units: [
      { code: 'ACME', name: 'Acme Industries', type: 'GROUP' },
      { code: 'ACME-IN', name: 'Acme India', type: 'COMPANY', parent: 'ACME' },
      { code: 'PLANT-PNQ', name: 'Pune Plant', type: 'PLANT', parent: 'ACME-IN', place: true },
      { code: 'PRODUCTION', name: 'Production', type: 'FUNCTION', parent: 'PLANT-PNQ' },
      { code: 'MAINTENANCE', name: 'Maintenance', type: 'FUNCTION', parent: 'PLANT-PNQ' },
      { code: 'QUALITY', name: 'Quality', type: 'FUNCTION', parent: 'PLANT-PNQ' },
      { code: 'PLANT-STORES', name: 'Plant stores', type: 'FUNCTION', parent: 'PLANT-PNQ', place: true },
    ],
    grantRoot: 'PLANT-PNQ',
  },
  {
    key: 'agriculture',
    types: [
      { code: 'COMPANY', one: 'Company', other: 'Companies', holdsRecords: false, root: true, capabilities: ['LEGAL_ENTITY'] },
      { code: 'ESTATE_GROUP', one: 'Estate group', other: 'Estate groups', holdsRecords: false, parents: ['COMPANY'] },
      { code: 'ESTATE', one: 'Estate', other: 'Estates', holdsRecords: true, parents: ['ESTATE_GROUP'], capabilities: ['OPERATIONAL', 'PLACE_OPERATING'] },
      { code: 'DIVISION', one: 'Division', other: 'Divisions', holdsRecords: true, parents: ['ESTATE'], capabilities: ['WORKFORCE', 'PLACE_OPERATING'] },
      { code: 'FACTORY', one: 'Factory', other: 'Factories', holdsRecords: true, parents: ['ESTATE'], capabilities: ['OPERATIONAL', 'PLACE_OPERATING'] },
    ],
    units: [
      { code: 'GREEN-VALLEY', name: 'Green Valley Plantations', type: 'COMPANY' },
      { code: 'WESTERN-ESTATES', name: 'Western Estates', type: 'ESTATE_GROUP', parent: 'GREEN-VALLEY' },
      { code: 'HILLSIDE', name: 'Hillside Estate', type: 'ESTATE', parent: 'WESTERN-ESTATES', place: true },
      { code: 'NORTH-DIVISION', name: 'North Division', type: 'DIVISION', parent: 'HILLSIDE', place: true },
      { code: 'TEA-FACTORY', name: 'Tea Factory', type: 'FACTORY', parent: 'HILLSIDE', place: true },
    ],
    grantRoot: 'HILLSIDE',
  },
  {
    key: 'healthcare',
    types: [
      { code: 'GROUP', one: 'Group', other: 'Groups', holdsRecords: false, root: true },
      { code: 'COMPANY', one: 'Company', other: 'Companies', holdsRecords: false, parents: ['GROUP'], capabilities: ['LEGAL_ENTITY'] },
      { code: 'HOSPITAL', one: 'Hospital', other: 'Hospitals', holdsRecords: false, parents: ['COMPANY'], capabilities: ['OPERATIONAL', 'PLACE_OPERATING'] },
      { code: 'DEPARTMENT', one: 'Department', other: 'Departments', holdsRecords: true, parents: ['HOSPITAL'], capabilities: ['WORKFORCE', 'REPORTING'] },
    ],
    units: [
      { code: 'CAREPLUS', name: 'CarePlus Group', type: 'GROUP' },
      { code: 'CAREPLUS-HOSPITALS', name: 'CarePlus Hospitals Limited', type: 'COMPANY', parent: 'CAREPLUS' },
      { code: 'CENTRAL-HOSPITAL', name: 'Central Hospital', type: 'HOSPITAL', parent: 'CAREPLUS-HOSPITALS', place: true },
      { code: 'CARDIOLOGY', name: 'Cardiology', type: 'DEPARTMENT', parent: 'CENTRAL-HOSPITAL' },
      { code: 'PHARMACY', name: 'Pharmacy', type: 'DEPARTMENT', parent: 'CENTRAL-HOSPITAL' },
    ],
    grantRoot: 'CENTRAL-HOSPITAL',
  },
];

integration('organization reference structures', () => {
  let service: OrganizationServiceType;
  let db: typeof import('@gigalibs/db').prisma;
  const firstUnitByTenant = new Map<string, string>();

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    ({ prisma: db } = await import('@gigalibs/db'));
    const marker = await db.$queryRawUnsafe<Array<{ n: number }>>('SELECT count(*)::int AS n FROM org_proof_marker');
    if (marker[0]?.n !== 1) throw new Error('Refusing to run: not the throwaway proof database.');
    service = new (await import('./organization.service.js')).OrganizationService();
    for (const userId of [author, checker, operator])
      await db.$executeRaw`INSERT INTO users (id, email, name, status, "updatedAt") VALUES (${userId}, ${`${userId}@example.invalid`}, ${userId}, 'ACTIVE', now())`;
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  for (const fixture of structures) {
    it(`configures and publishes the ${fixture.key} hierarchy through the same domain APIs`, async () => {
      const tenantId = `org-reference-${fixture.key}-${run}`;
      await db.tenant.create({
        data: { id: tenantId, slug: tenantId, name: `${fixture.key} reference`, settings: { create: { branding: {}, security: { enforceMfa: false }, localization: {}, features: {}, metadata: {} } } },
      });
      for (const [userId, role] of [[author, 'TENANT_ADMIN'], [checker, 'TENANT_ADMIN'], [operator, 'MEMBER']] as const)
        await db.$executeRaw`INSERT INTO tenant_members (id, "userId", "tenantId", role, "updatedAt") VALUES (${randomUUID()}, ${userId}, ${tenantId}, ${role}::"MemberRole", now())`;

      for (const type of fixture.types)
        await service.createUnitType(tenantId, author, {
          code: type.code,
          labels: { one: type.one, other: type.other },
          holdsRecords: type.holdsRecords,
          capabilities: type.capabilities ?? [],
          allowedParentTypeCodes: type.parents ?? [],
          allowAsRoot: type.root ?? false,
        });

      const units = new Map<string, string>();
      for (const unit of fixture.units) {
        const created = await service.createUnit(tenantId, author, {
          typeCode: unit.type,
          code: unit.code,
          name: unit.name,
          effectiveFrom: '2026-10-01',
        });
        units.set(unit.code, created.id);
        if (unit.place)
          await service.createPlaceLink(tenantId, author, created.id, {
            placeId: randomUUID(), relation: 'OPERATES', effectiveFrom: '2026-10-01', effectiveTo: null, reason: `${fixture.key} certification`,
          });
      }
      firstUnitByTenant.set(tenantId, units.get(fixture.units[0]!.code)!);

      const tree = await service.createTree(tenantId, author, { code: 'primary', name: `${fixture.key} authority`, kind: 'PRIMARY', purpose: 'AUTHORITY' });
      const draft = await service.createDraft(tenantId, author, tree.id, { reason: `${fixture.key} reference structure` });
      await service.updateEdges(tenantId, author, draft.id, {
        expectedVersion: draft.lockVersion,
        upsert: fixture.units.map((unit, sortOrder) => ({ unitId: units.get(unit.code)!, parentUnitId: unit.parent ? units.get(unit.parent)! : null, sortOrder })),
        remove: [],
      });
      const lock = async () => (await service.getVersion(tenantId, draft.id)).lockVersion;
      const validated = await service.validate(tenantId, author, draft.id, { expectedVersion: await lock() });
      expect(validated).toMatchObject({ valid: true, problems: [] });
      await service.submit(tenantId, author, draft.id, { expectedVersion: await lock(), reason: 'Ready for independent review' });
      await service.approve(tenantId, checker, draft.id, { expectedVersion: await lock(), reason: 'Structure matches the organization' });
      const published = await service.publish(tenantId, author, draft.id, { expectedVersion: await lock(), reason: 'Publish reference structure' });
      expect(published).toMatchObject({ status: 'PUBLISHED', approvedBy: checker });
      await service.activate(tenantId, author, { versionId: draft.id, reason: 'Activate reference structure', idempotencyKey: `reference-${fixture.key}-${run}` });
      expect((await service.getActive(tenantId, tree.id, {})).version).toMatchObject({ id: draft.id, checksum: expect.stringMatching(/^sha256:/) });

      const grant = await service.createGrant(tenantId, author, {
        userId: operator,
        unitId: units.get(fixture.grantRoot)!,
        access: 'READ_WRITE',
        reason: `${fixture.key} operational responsibility`,
        idempotencyKey: `reference-grant-${fixture.key}-${run}`,
      });
      expect(grant).toMatchObject({ userId: operator, unitId: units.get(fixture.grantRoot), access: 'READ_WRITE' });

      const audit = await db.auditLog.count({ where: { tenantId, userId: { in: [author, checker] } } });
      expect(audit).toBeGreaterThanOrEqual(fixture.types.length + fixture.units.length + 7);
    });
  }

  it('keeps every reference tenant isolated from every sibling tenant', async () => {
    const tenants = [...firstUnitByTenant.entries()];
    expect(tenants).toHaveLength(structures.length);
    for (let index = 0; index < tenants.length; index += 1) {
      const [tenantId] = tenants[index]!;
      const [, otherUnitId] = tenants[(index + 1) % tenants.length]!;
      let status: number | undefined;
      try {
        await service.getUnit(tenantId, otherUnitId);
      } catch (error) {
        status = (error as { getStatus?: () => number }).getStatus?.();
      }
      expect(status).toBe(404);
    }
  });
});
