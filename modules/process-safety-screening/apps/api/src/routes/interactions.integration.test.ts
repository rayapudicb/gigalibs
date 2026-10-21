import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { SpeedStepV1 } from '@gigalibs/contracts';
import type { ModuleCommandContext } from '@gigalibs/module-sdk';
import { ConflictException, HttpException, UnprocessableEntityException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { REFERENCE_ROUTE } from '../../../../../../packages/process-safety-engines/test/fixtures/reference-route.js';
import { CriteriaService } from '../criteria/criteria.service.js';
import { LibraryService } from '../library/library.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import { SubstancesService } from '../substances/substances.service.js';
import {
  type SpeedDatabase,
  adminUrl,
  principal,
  speedDatabase,
} from '../test-support/speed-database.js';
import {
  BRD_VALUES,
  CRITERIA_CITATIONS,
  FIXTURE,
  PROTOTYPE_PACK,
} from '../test-support/speed-fixtures.js';
import { RoutesService } from './routes.service.js';
import { StepsService } from './steps.service.js';

// WI-OI-120bz (SPEED S6; FR-HAZ-01 to 06, BRL-04; BRD TC-11): the interaction screen through the API. A substance's
// reactivity classes come from its library material; every pair of a step's materials is matched against the library's
// rules; a High finding needs a documented control. TEST FIXTURE data only.

const TENANT = `tenant-s6-${randomUUID().slice(0, 8)}`;
const ALL = [
  'speed:read',
  'speed.routes.read',
  'speed.routes.write',
  'speed.substances.write',
  'speed.thermal-data.write',
  'speed.engines.run',
  'speed.settings.manage',
];
const admin = principal(TENANT, 'admin', ALL);
const command = (): ModuleCommandContext => ({ principal: admin, correlationId: randomUUID() });

interface Finding {
  materialAId: string;
  materialBId: string;
  ruleId: string;
  severity: string;
  citation: string;
  reviewed: boolean;
}

async function rejection(work: Promise<unknown>): Promise<{ type: unknown; code: unknown }> {
  try {
    await work;
  } catch (error) {
    const body =
      error instanceof HttpException ? (error.getResponse() as { code?: unknown }) : null;
    return { type: (error as object).constructor, code: body?.code };
  }
  throw new Error('Expected a rejection.');
}

describe.skipIf(!adminUrl)('SPEED interactions and controls through the API (WI-OI-120bz)', () => {
  let speed: SpeedDatabase;
  let routes: RoutesService;
  let steps: StepsService;
  let substances: SubstancesService;
  let routeId = '';
  let step4 = '';
  const substanceIds = new Map<string, string>();

  /** A substance per formula, linked to the fixture's library material unless `unlinked` names its formula. */
  const substanceFor = async (
    formula: string,
    libraryMaterialId: string | null | undefined,
    unlinked: readonly string[],
  ) => {
    const known = substanceIds.get(formula);
    if (known) return known;
    const link = unlinked.includes(formula) || !libraryMaterialId ? {} : { libraryMaterialId };
    const created = await substances.create(command(), {
      requestKey: randomUUID(),
      name: `Fixture ${formula}`,
      formula,
      ...link,
    });
    substanceIds.set(formula, created.substance.id);
    return created.substance.id;
  };

  const interactionsOf = (step: SpeedStepV1) =>
    step.latestResult?.outputs['interactions'] as {
      findings: Finding[];
      notes: { materialId: string; noteKey: string }[];
      unclassifiedMaterialIds: string[];
      usesUnreviewedLibrary: boolean;
    };
  const current = async () => {
    const found = (await routes.get(admin, routeId)).steps.find((step) => step.id === step4);
    if (!found) throw new Error('step 4');
    return found;
  };

  beforeAll(async () => {
    speed = await speedDatabase('interactions');
    const criteria = new CriteriaService(speed.database);
    const library = new LibraryService(speed.database);
    substances = new SubstancesService(speed.database, criteria, library);
    routes = new RoutesService(speed.database, criteria, library);
    steps = new StepsService(speed.database, criteria, library);
    const imported = await criteria.import(command(), {
      requestKey: randomUUID(),
      versionLabel: 'brd-0.1',
      source: FIXTURE,
      criteria: BRD_VALUES,
      citations: CRITERIA_CITATIONS,
    });
    await criteria.putInForce(command(), imported.set.id, { version: 1, reason: 'Pilot start' });
    const pack = await library.import(command(), {
      requestKey: randomUUID(),
      versionLabel: 'prototype-0.1',
      source: FIXTURE,
      library: PROTOTYPE_PACK,
    });
    await library.putInForce(command(), pack.set.id, { version: 1, reason: 'Pilot start' });
    const projectId = (
      await new ProjectsService(speed.database).create(command(), {
        requestKey: randomUUID(),
        code: 'HAZ',
        name: 'Hazards',
        siteUnitId: 'lab',
      })
    ).project.id;
    routeId = (
      await routes.create(command(), {
        requestKey: randomUUID(),
        projectId,
        name: 'Reference route',
      })
    ).route.id;
    // Step 4 of the reference route, with the work-up water left unlinked to the library.
    const fixture = REFERENCE_ROUTE[3];
    if (!fixture) throw new Error('fixture');
    step4 = (
      await steps.addStep(command(), routeId, {
        requestKey: randomUUID(),
        reason: 'Data entry',
        name: 'Amide formation',
      })
    ).step.id;
    for (const material of fixture.materials) {
      await steps.addMaterial(command(), step4, {
        requestKey: randomUUID(),
        reason: 'Data entry',
        substanceId: await substanceFor(material.formula, material.libraryMaterialId, ['H2O']),
        role: material.role,
        ...(typeof material.coefficient === 'number' ? { coefficient: material.coefficient } : {}),
        ...(typeof material.massG === 'number' ? { massG: material.massG } : {}),
      });
    }
  }, 120_000);

  afterAll(async () => {
    await speed?.close();
  });

  it('TC-11: NaOH with DMSO is a High finding, with its rule, citation and an unreviewed library', async () => {
    const step = await current();
    const naoh = step.materials.find((m) => m.formula === 'NaOH');
    const dmso = step.materials.find((m) => m.formula === 'C2H6OS');
    const finding = interactionsOf(step).findings.find(
      (candidate) =>
        [candidate.materialAId, candidate.materialBId].sort().join() ===
        [naoh?.id, dmso?.id].sort().join(),
    );
    expect(finding).toMatchObject({ ruleId: 'R-01', severity: 'High', reviewed: false });
    expect(finding?.citation).toBeTruthy();
    expect(interactionsOf(step).usesUnreviewedLibrary).toBe(true);
  });

  it("lists a material the library cannot classify, and links it: the step's screen is recomputed", async () => {
    const step = await current();
    const water = step.materials.filter((m) => m.formula === 'H2O').map((m) => m.id);
    expect(interactionsOf(step).unclassifiedMaterialIds).toEqual(expect.arrayContaining(water));
    const substance = await substances.get(admin, substanceIds.get('H2O') as string);
    await substances.update(command(), substance.id, {
      version: substance.version,
      reason: 'Library link',
      libraryMaterialId: 'L06',
    });
    const after = await current();
    expect(
      interactionsOf(after).unclassifiedMaterialIds.filter((id) => water.includes(id)),
    ).toEqual([]);
  });

  it('refuses a library material the library in force does not hold', async () => {
    expect(
      await rejection(
        substances.create(command(), {
          requestKey: randomUUID(),
          name: 'Unknown link',
          formula: 'CH4',
          libraryMaterialId: 'L99',
        }),
      ),
    ).toMatchObject({
      type: UnprocessableEntityException,
      code: 'SPEED_LIBRARY_MATERIAL_UNKNOWN',
    });
  });

  it("carries a linked material's library note", async () => {
    const step = await current();
    const dmso = step.materials.find((m) => m.formula === 'C2H6OS');
    expect(interactionsOf(step).notes).toContainEqual(
      expect.objectContaining({ materialId: dmso?.id, noteKey: 'L09' }),
    );
  });

  it('documents the control of a High finding (BRL-04), at its current version, only for a pair the screen found', async () => {
    const step = await current();
    const high = interactionsOf(step).findings.find((finding) => finding.severity === 'High');
    if (!high) throw new Error('no High finding');
    const documented = await steps.documentControl(command(), step.id, {
      version: 0,
      reason: 'Control',
      materialAId: high.materialBId,
      materialBId: high.materialAId,
      text: 'Dose NaOH as an aqueous solution below 40 °C; DMSO kept under 5 vol %.',
    });
    expect(documented.step.controls).toEqual([
      expect.objectContaining({
        materialAId: high.materialAId,
        materialBId: high.materialBId,
        ruleId: high.ruleId,
        version: 1,
        documentedBy: 'admin',
      }),
    ]);
    expect(
      await rejection(
        steps.documentControl(command(), step.id, {
          version: 0,
          reason: 'Again',
          materialAId: high.materialAId,
          materialBId: high.materialBId,
          text: 'x',
        }),
      ),
    ).toMatchObject({
      type: ConflictException,
      code: 'SPEED_VERSION_CONFLICT',
    });
    const product = step.materials.find((m) => m.role === 'Product');
    const reactant = step.materials.find((m) => m.role === 'Reactant');
    expect(
      await rejection(
        steps.documentControl(command(), step.id, {
          version: 0,
          reason: 'x',
          materialAId: product?.id as string,
          materialBId: reactant?.id as string,
          text: 'x',
        }),
      ),
    ).toMatchObject({ type: UnprocessableEntityException, code: 'SPEED_FINDING_UNKNOWN' });
  });

  it('removing a material takes its controls with it, and the removal is audited with what it held', async () => {
    const step = await current();
    const control = step.controls[0];
    if (!control) throw new Error('no control');
    const material = step.materials.find((m) => m.id === control.materialAId);
    if (!material) throw new Error('no material');
    const after = await steps.removeMaterial(command(), material.id, {
      version: material.version,
      reason: 'Correction',
    });
    expect(after.step.controls).toEqual([]);
  });
});
