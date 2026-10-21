import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import {
  AddSpeedMaterialInputV1Schema,
  AddSpeedStepInputV1Schema,
  CreateSpeedRouteInputV1Schema,
  CreateSpeedSubstanceInputV1Schema,
  ImportSpeedCriteriaSetInputV1Schema,
  ReplaceSpeedConditionsInputV1Schema,
  type SpeedMaterialRole,
  type SpeedStepV1,
} from '@gigalibs/contracts';
import type { ModuleCommandContext, ModulePrincipal } from '@gigalibs/module-sdk';
import {
  IUPAC_2021_ABRIDGED,
  missingCriteria,
  molarMass,
  parseFormula,
} from '@gigalibs/process-safety-engines';
import {
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BRD_CRITERIA } from '../../../../../../packages/process-safety-engines/test/fixtures/criteria.js';
import { CriteriaService } from '../criteria/criteria.service.js';
import { LibraryService } from '../library/library.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import { SubstancesService } from '../substances/substances.service.js';
import {
  type SpeedDatabase,
  TREE,
  adminUrl,
  principal,
  seedOrganization,
  speedDatabase,
  units,
} from '../test-support/speed-database.js';
import { RoutesService } from './routes.service.js';
import { StepsService } from './steps.service.js';

// WI-OI-120bx (SPEED S4a): criteria sets, substances, routes, steps, materials and conditions on PostgreSQL 16 as the
// least-privileged runtime role, with the server's gate (FR-INP-01 to 06, FR-GATE-01 to 06; BRD TC-04 and TC-05).
// Inputs go through the published V1 schemas, as the controllers parse them. Test data only: the criteria are the BRD's
// test fixture, and every citation says so.

const TENANT = `tenant-s4-${randomUUID().slice(0, 8)}`;
const BARE = `tenant-bare-${randomUUID().slice(0, 8)}`;
const ALL = [
  'speed:read',
  'speed.routes.read',
  'speed.routes.write',
  'speed.substances.write',
  'speed.engines.run',
  'speed.settings.manage',
];
const { version: _fixtureVersion, ...BRD_VALUES } = BRD_CRITERIA;
const CITATIONS = Object.fromEntries(
  missingCriteria({})
    .filter((path) => path !== 'version')
    .map((path) => [path, 'TEST FIXTURE: SPEED-BRD-FRD-001 v0.1 §15']),
);

const command = (who: ModulePrincipal): ModuleCommandContext => ({
  principal: who,
  correlationId: randomUUID(),
});
const parse = <T>(schema: { parse(value: unknown): T }, value: unknown): T => schema.parse(value);

async function rejection(
  work: Promise<unknown>,
): Promise<{ type: unknown; code: unknown; issues?: unknown }> {
  try {
    await work;
  } catch (error) {
    const body =
      error instanceof HttpException
        ? (error.getResponse() as { code?: unknown; issues?: unknown })
        : null;
    return {
      type: (error as object).constructor,
      code: body?.code,
      ...(body?.issues ? { issues: body.issues } : {}),
    };
  }
  throw new Error('Expected a rejection.');
}

describe.skipIf(!adminUrl)('SPEED routes and the server gate on PostgreSQL (WI-OI-120bx)', () => {
  let speed: SpeedDatabase;
  let criteria: CriteriaService;
  let library: LibraryService;
  let substances: SubstancesService;
  let projects: ProjectsService;
  let routes: RoutesService;
  let steps: StepsService;
  const admin = principal(TENANT, 'admin', ALL);
  const north = principal(TENANT, 'chemist-north', ALL, units(['north']));
  const bare = principal(BARE, 'admin-bare', ALL);
  const ids: Record<string, string> = {};
  let northProject = '';
  let southProject = '';

  const importSet = (
    who: ModulePrincipal,
    versionLabel: string,
    overrides: Record<string, unknown> = {},
  ) =>
    criteria.import(
      command(who),
      parse(ImportSpeedCriteriaSetInputV1Schema, {
        requestKey: randomUUID(),
        versionLabel,
        source: 'TEST FIXTURE: SPEED-BRD-FRD-001 v0.1',
        criteria: BRD_VALUES,
        citations: CITATIONS,
        ...overrides,
      }),
    );
  const substance = async (
    who: ModulePrincipal,
    name: string,
    formula: string,
    casNumber?: string,
  ) =>
    (
      await substances.create(
        command(who),
        parse(CreateSpeedSubstanceInputV1Schema, {
          requestKey: randomUUID(),
          name,
          formula,
          ...(casNumber ? { casNumber } : {}),
        }),
      )
    ).substance;
  const route = async (
    who: ModulePrincipal,
    projectId: string,
    name = `Route ${randomUUID().slice(0, 6)}`,
  ) =>
    (
      await routes.create(
        command(who),
        parse(CreateSpeedRouteInputV1Schema, { requestKey: randomUUID(), projectId, name }),
      )
    ).route;
  const step = async (who: ModulePrincipal, routeId: string, name = 'Knoevenagel condensation') =>
    (
      await steps.addStep(
        command(who),
        routeId,
        parse(AddSpeedStepInputV1Schema, { requestKey: randomUUID(), reason: 'Data entry', name }),
      )
    ).step;
  const material = async (
    who: ModulePrincipal,
    stepId: string,
    substanceId: string,
    role: SpeedMaterialRole,
    coefficient?: number,
    massG?: number,
  ) =>
    (
      await steps.addMaterial(
        command(who),
        stepId,
        parse(AddSpeedMaterialInputV1Schema, {
          requestKey: randomUUID(),
          reason: 'Data entry',
          substanceId,
          role,
          ...(coefficient === undefined ? {} : { coefficient }),
          ...(massG === undefined ? {} : { massG }),
        }),
      )
    ).step;
  const results = async (stepId: string) =>
    Number(
      (
        await speed.admin.query<{ count: string }>(
          `SELECT count(*) FROM gigalibs_speed.results WHERE step_id = $1`,
          [stepId],
        )
      ).rows[0]?.count,
    );
  const gate = (s: SpeedStepV1) =>
    s.latestResult?.outputs['gate'] as {
      pass?: boolean;
      issues?: { code: string; params?: Record<string, unknown> }[];
    };

  beforeAll(async () => {
    speed = await speedDatabase('routes');
    await seedOrganization(speed.admin, TENANT);
    criteria = new CriteriaService(speed.database);
    substances = new SubstancesService(
      speed.database,
      new CriteriaService(speed.database),
      new LibraryService(speed.database),
    );
    projects = new ProjectsService(speed.database);
    library = new LibraryService(speed.database);
    routes = new RoutesService(speed.database, criteria, library);
    steps = new StepsService(speed.database, criteria, library);
    const versioned = principal(TENANT, 'admin', ALL, { mode: 'TENANT', tree_version: TREE });
    northProject = (
      await projects.create(command(versioned), {
        requestKey: randomUUID(),
        code: 'N-1',
        name: 'North scouting',
        siteUnitId: 'north',
      })
    ).project.id;
    southProject = (
      await projects.create(command(versioned), {
        requestKey: randomUUID(),
        code: 'S-1',
        name: 'South scouting',
        siteUnitId: 'south',
      })
    ).project.id;
    await projects.create(command(bare), {
      requestKey: randomUUID(),
      code: 'B-1',
      name: 'Bare',
      siteUnitId: 'bare-site',
    });
    for (const [key, name, formula] of [
      ['aldehyde', '4-Fluorobenzaldehyde', 'C7H5FO'],
      ['ketoester', 'Ethyl isobutyrylacetate', 'C7H12O3'],
      ['product', 'Knoevenagel adduct', 'C14H15FO3'],
      ['water', 'Water', 'H2O'],
      ['solvent', 'Isopropanol', 'C3H8O'],
    ] as const) {
      ids[key] = (await substance(admin, name, formula)).id;
    }
  });

  afterAll(async () => {
    await speed?.close();
  });

  describe('criteria sets (plan v1.4 §4.5)', () => {
    it('refuses a set with an uncited value or a citation that names no value', async () => {
      const { 'inputRanges.temperatureC.min': _dropped, ...partial } = CITATIONS;
      const uncited = await rejection(importSet(admin, 'uncited', { citations: partial }));
      expect(uncited).toMatchObject({
        type: UnprocessableEntityException,
        code: 'SPEED_CRITERIA_UNCITED',
        issues: ['inputRanges.temperatureC.min'],
      });
      const unknown = await rejection(
        importSet(admin, 'unknown', { citations: { ...CITATIONS, madeUp: 'x' } }),
      );
      expect(unknown).toMatchObject({
        code: 'SPEED_CRITERIA_CITATION_UNKNOWN',
        issues: ['madeUp'],
      });
    });

    it('imports a cited set as unreviewed and not in force; its values never change', async () => {
      const { set } = await importSet(admin, 'brd-0.1');
      expect(set).toMatchObject({
        versionLabel: 'brd-0.1',
        reviewStatus: 'UNREVIEWED',
        inForce: false,
        version: 1,
      });
      await speed.asRuntime(TENANT, async (runtime) => {
        await expect(
          runtime.query(
            `UPDATE gigalibs_speed.criteria_sets SET criteria = '{}'::jsonb WHERE id = $1`,
            [set.id],
          ),
        ).rejects.toMatchObject({
          code: '55000',
        });
      });
      ids['criteria1'] = set.id;
    });

    it('keeps one set in force: putting another in force replaces it, with a reason', async () => {
      const first = await criteria.putInForce(command(admin), ids['criteria1'] as string, {
        version: 1,
        reason: 'Pilot start',
      });
      expect(first).toMatchObject({ inForce: true, inForceBy: 'admin' });
      const { set: second } = await importSet(admin, 'brd-0.2');
      await criteria.putInForce(command(admin), second.id, {
        version: 1,
        reason: 'Corrected citation',
      });
      const listed = (await criteria.list(admin)).items.filter((item) => item.inForce);
      expect(listed.map((item) => item.versionLabel)).toEqual(['brd-0.2']);
      expect(
        await rejection(
          criteria.putInForce(command(admin), ids['criteria1'] as string, {
            version: 1,
            reason: 'Back',
          }),
        ),
      ).toMatchObject({
        type: ConflictException,
        code: 'SPEED_VERSION_CONFLICT',
      });
      ids['criteria2'] = second.id;
    });
  });

  describe('substances (screen spec §2.2)', () => {
    it('computes the Hill formula and molar mass on the server with the element table it records', async () => {
      const water = await substance(admin, 'Heavy-free water', 'H2O', '7732-18-5');
      const counts = parseFormula('H2O', IUPAC_2021_ABRIDGED);
      if (!counts.ok) throw new Error('fixture');
      expect(water).toMatchObject({
        hillFormula: 'H2O',
        elementsVersion: IUPAC_2021_ABRIDGED.version,
        casNumber: '7732-18-5',
        inUse: false,
      });
      expect(water.molarMassGPerMol).toBeCloseTo(molarMass(counts.counts, IUPAC_2021_ABRIDGED), 5);
    });

    it("refuses a formula the parser rejects, with the parser's code, and a wrong CAS check digit (FR-GATE-01)", async () => {
      const formula = await rejection(substance(admin, 'Unobtainium', 'C7Xx2'));
      expect(formula).toMatchObject({
        type: UnprocessableEntityException,
        code: 'SPEED_FORMULA_INVALID',
      });
      expect((formula.issues as { code: string }[])[0]?.code).toBe('FORMULA_UNKNOWN_ELEMENT');
      expect(await rejection(substance(admin, 'Wrong CAS', 'H2O', '7732-18-4'))).toMatchObject({
        code: 'SPEED_CAS_INVALID',
      });
      expect(await rejection(substance(admin, 'water', 'H2O'))).toMatchObject({
        type: ConflictException,
        code: 'SPEED_UNIQUE_CONFLICT',
      });
    });
  });

  describe('a route and its steps (FR-INP-01, 02, 04, 05, 06; FR-GATE-01 to 06)', () => {
    it('TC-04 through the API: the balanced step passes the gate, and the result records its versions', async () => {
      const r = await route(north, northProject);
      const s = await step(north, r.id);
      await material(north, s.id, ids['aldehyde'] as string, 'Reactant', 1, 100);
      await material(north, s.id, ids['ketoester'] as string, 'Reactant', 1, 127.8);
      await material(north, s.id, ids['product'] as string, 'Product', 1);
      const done = await material(north, s.id, ids['water'] as string, 'By-product', 1);
      expect(gate(done).pass).toBe(true);
      expect(done.latestResult).toMatchObject({
        status: 'OK',
        gatePass: true,
        criteriaSetId: ids['criteria2'],
        criteriaVersion: 'brd-0.2',
        criteriaReviewed: false,
        elementsVersion: IUPAC_2021_ABRIDGED.version,
      });
      ids['route'] = r.id;
      ids['step'] = s.id;
      ids['waterMaterial'] = done.materials.find((m) => m.role === 'By-product')?.id as string;
    });

    it('TC-05 through the API: removing the water fails the gate on H and O, and every change added a result', async () => {
      const before = await results(ids['step'] as string);
      const after = await steps.removeMaterial(command(north), ids['waterMaterial'] as string, {
        version: 1,
        reason: 'Correction',
      });
      const balance = gate(after.step).issues?.find(
        (issue) => issue.code === 'GATE_ELEMENT_BALANCE',
      );
      expect(gate(after.step).pass).toBe(false);
      expect(balance?.params?.['elements']).toEqual(['H', 'O']);
      expect(await results(ids['step'] as string)).toBe(before + 1);
      const detail = await routes.get(north, ids['route'] as string);
      expect(detail).toMatchObject({ stepCount: 1, stepsPassingGate: 0 });
    });

    it('a recompute with unchanged inputs adds no result; results are immutable', async () => {
      const before = await results(ids['step'] as string);
      await routes.recompute(command(north), ids['route'] as string);
      expect(await results(ids['step'] as string)).toBe(before);
      await speed.asRuntime(TENANT, async (runtime) => {
        await expect(
          runtime.query(`UPDATE gigalibs_speed.results SET gate_pass = true WHERE step_id = $1`, [
            ids['step'],
          ]),
        ).rejects.toMatchObject({
          code: '42501',
        });
      });
    });

    it('a substance a route uses keeps its formula', async () => {
      const used = await substances.get(admin, ids['aldehyde'] as string);
      expect(used.inUse).toBe(true);
      expect(
        await rejection(
          substances.update(command(admin), used.id, {
            version: used.version,
            reason: 'Typo',
            formula: 'C7H6O',
          }),
        ),
      ).toMatchObject({
        type: ForbiddenException,
        code: 'SPEED_SUBSTANCE_IN_USE',
      });
      await expect(
        substances.update(command(admin), used.id, {
          version: used.version,
          reason: 'Spelling',
          name: '4-Fluorobenzaldehyde (FBA)',
        }),
      ).resolves.toMatchObject({
        name: '4-Fluorobenzaldehyde (FBA)',
      });
    });

    it('refuses a coefficient on a role outside the equation and a charge on a by-product', async () => {
      expect(() =>
        parse(AddSpeedMaterialInputV1Schema, {
          requestKey: randomUUID(),
          reason: 'x',
          substanceId: ids['solvent'],
          role: 'Solvent',
          coefficient: 1,
        }),
      ).toThrow();
      const s = await step(north, ids['route'] as string, 'Work-up');
      const withProduct = await material(north, s.id, ids['product'] as string, 'Reactant', 1, 10);
      const reactant = withProduct.materials[0];
      if (!reactant) throw new Error('no material');
      expect(
        await rejection(
          steps.updateMaterial(command(north), reactant.id, {
            version: reactant.version,
            reason: 'Role',
            role: 'Solvent',
          }),
        ),
      ).toMatchObject({ type: UnprocessableEntityException, code: 'SPEED_MATERIAL_INVALID' });
      expect(
        await rejection(
          steps.updateMaterial(command(north), reactant.id, {
            version: reactant.version,
            reason: 'Role',
            role: 'By-product',
          }),
        ),
      ).toMatchObject({ type: UnprocessableEntityException, code: 'SPEED_MATERIAL_INVALID' });
      const byProduct = await steps.updateMaterial(command(north), reactant.id, {
        version: reactant.version,
        reason: 'Role',
        role: 'By-product',
        massG: null,
      });
      expect(byProduct.step.materials[0]).toMatchObject({
        role: 'By-product',
        coefficient: 1,
        massG: null,
        version: reactant.version + 1,
      });
    });

    it('moves and removes steps of a draft route, keeping positions 1, 2, 3 and auditing what a removed step held', async () => {
      const r = await route(north, northProject);
      const a = await step(north, r.id, 'A');
      const b = await step(north, r.id, 'B');
      await step(north, r.id, 'C');
      const moved = await steps.moveStep(command(north), b.id, {
        version: b.version,
        reason: 'Order',
        position: 1,
      });
      expect(moved.steps.map((s) => [s.name, s.position])).toEqual([
        ['B', 1],
        ['A', 2],
        ['C', 3],
      ]);
      const removed = await steps.removeStep(command(north), a.id, {
        version: a.version,
        reason: 'Duplicate',
      });
      expect(removed.steps.map((s) => [s.name, s.position])).toEqual([
        ['B', 1],
        ['C', 2],
      ]);
      const audit = await speed.admin.query<{
        payload: { removed: { name: string }; reason: string };
      }>(
        `SELECT payload FROM gigalibs_speed.audit_events WHERE action = 'STEP_REMOVED' AND entity_id = $1`,
        [a.id],
      );
      expect(audit.rows[0]?.payload).toMatchObject({ removed: { name: 'A' }, reason: 'Duplicate' });
      expect(
        await rejection(
          steps.updateStep(command(north), b.id, {
            version: b.version,
            reason: 'Stale',
            name: 'B2',
          }),
        ),
      ).toMatchObject({
        type: ConflictException,
        code: 'SPEED_VERSION_CONFLICT',
      });
    });

    it('an archived route no longer changes', async () => {
      const r = await route(north, northProject);
      const s = await step(north, r.id);
      await routes.archive(command(north), r.id, { version: r.version, reason: 'Abandoned' });
      expect(
        await rejection(
          steps.updateStep(command(north), s.id, { version: s.version, reason: 'x', name: 'Late' }),
        ),
      ).toMatchObject({
        type: ForbiddenException,
        code: 'SPEED_ROUTE_NOT_DRAFT',
      });
    });

    it("scopes routes by the project's site: a North member cannot see or change a South route", async () => {
      const south = await route(admin, southProject);
      const southStep = await step(admin, south.id);
      expect(
        (await routes.list(north, { page: 1, pageSize: 100 })).items.some(
          (item) => item.id === south.id,
        ),
      ).toBe(false);
      expect((await rejection(routes.get(north, south.id))).type).toBe(NotFoundException);
      expect(
        (
          await rejection(
            steps.updateStep(command(north), southStep.id, {
              version: 1,
              reason: 'x',
              name: 'Taken',
            }),
          )
        ).type,
      ).toBe(NotFoundException);
      expect((await rejection(route(north, southProject))).type).toBe(NotFoundException);
    });
  });

  describe('process conditions (BRD §15.1)', () => {
    it('saves values inside the criteria ranges, warns outside the usual range and refuses outside the blocking range', async () => {
      const saved = await steps.replaceConditions(
        command(north),
        ids['step'] as string,
        conditions(0, { processTemperatureC: 80, heatCapacityJPerGK: 1.8 }),
      );
      expect(saved.step.conditions).toMatchObject({
        processTemperatureC: 80,
        heatCapacityJPerGK: 1.8,
        version: 1,
      });
      expect(saved.warnings).toEqual([]);
      const warned = await steps.replaceConditions(
        command(north),
        ids['step'] as string,
        conditions(1, { processTemperatureC: 80, heatCapacityJPerGK: 4.5 }),
      );
      expect(warned.warnings.map((w) => w.code)).toContain('INPUT_UNUSUAL');
      const refused = await rejection(
        steps.replaceConditions(
          command(north),
          ids['step'] as string,
          conditions(2, { heatCapacityJPerGK: 9 }),
        ),
      );
      expect(refused).toMatchObject({
        type: UnprocessableEntityException,
        code: 'SPEED_CONDITIONS_OUT_OF_RANGE',
      });
      expect(
        await rejection(
          steps.replaceConditions(
            command(north),
            ids['step'] as string,
            conditions(1, { processTemperatureC: 20 }),
          ),
        ),
      ).toMatchObject({
        code: 'SPEED_VERSION_CONFLICT',
      });
    });
  });

  describe('a workspace with no criteria in force', () => {
    it('stores a data-gap result that says so, and refuses conditions it cannot check', async () => {
      const project = (await projects.list(bare, { page: 1, pageSize: 1 })).items[0];
      if (!project) throw new Error('no project');
      const r = await route(bare, project.id);
      const s = await step(bare, r.id);
      expect(s.latestResult).toMatchObject({
        status: 'DATA_GAP',
        gatePass: null,
        criteriaSetId: null,
      });
      expect(s.latestResult?.outputs['gate']).toMatchObject({
        status: 'DATA_GAP',
        reason: { code: 'SPEED_NO_CRITERIA_IN_FORCE' },
      });
      expect(
        await rejection(
          steps.replaceConditions(command(bare), s.id, conditions(0, { processTemperatureC: 20 })),
        ),
      ).toMatchObject({
        type: ForbiddenException,
        code: 'SPEED_NO_CRITERIA_IN_FORCE',
      });
    });
  });
});

function conditions(version: number, values: Record<string, number | null>) {
  return ReplaceSpeedConditionsInputV1Schema.parse({
    version,
    reason: 'Measured value',
    processTemperatureC: null,
    maximumTechnicalTemperatureC: null,
    heatCapacityJPerGK: null,
    accumulationPercent: null,
    ...values,
  });
}
