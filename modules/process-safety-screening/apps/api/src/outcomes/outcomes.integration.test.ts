import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { ModuleCommandContext } from '@gigalibs/module-sdk';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { REFERENCE_ROUTE } from '../../../../../../packages/process-safety-engines/test/fixtures/reference-route.js';
import { CriteriaService } from '../criteria/criteria.service.js';
import { DossierWorker } from '../dossiers/dossier-worker.js';
import { DossiersService } from '../dossiers/dossiers.service.js';
import { SpeedStorage } from '../dossiers/storage.js';
import { LibraryService } from '../library/library.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import { RoutesService } from '../routes/routes.service.js';
import { StepsService } from '../routes/steps.service.js';
import { SubstancesService } from '../substances/substances.service.js';
import {
  type SpeedDatabase,
  adminUrl,
  principal,
  seedOrganization,
  speedDatabase,
  units,
} from '../test-support/speed-database.js';
import {
  BRD_VALUES,
  CRITERIA_CITATIONS,
  FIXTURE,
  PROTOTYPE_PACK,
} from '../test-support/speed-fixtures.js';
import { OutcomesService } from './outcomes.service.js';

// WI-OI-120cc (SPEED S9b; screen spec §3.4; BRD BO-1 to BO-5): the business outcomes from the module's own records, for
// the reference route entered as the speed-lab preview enters it. TEST FIXTURE data only.

const TENANT = `tenant-s9b-${randomUUID().slice(0, 8)}`;
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

/** The object store in memory: the outcomes need finished dossiers, not their files. */
class MemoryStorage extends SpeedStorage {
  private readonly objects = new Map<string, Buffer>();
  constructor() {
    super({
      endpoint: 'http://memory.invalid',
      region: 'us-east-1',
      bucket: 'memory',
      accessKeyId: 'memory',
      secretAccessKey: 'memory',
      forcePathStyle: true,
    });
  }
  override async put(key: string, bytes: Buffer): Promise<void> {
    this.objects.set(key, bytes);
  }
  override async get(key: string): Promise<Buffer> {
    const bytes = this.objects.get(key);
    if (!bytes) throw new Error('missing');
    return bytes;
  }
}

describe.skipIf(!adminUrl)('SPEED business outcomes (WI-OI-120cc)', () => {
  let speed: SpeedDatabase;
  let outcomes: OutcomesService;
  let routes: RoutesService;

  beforeAll(async () => {
    speed = await speedDatabase('outcomes');
    await seedOrganization(speed.admin, TENANT);
    const criteria = new CriteriaService(speed.database);
    const library = new LibraryService(speed.database);
    const substances = new SubstancesService(speed.database, criteria, library);
    routes = new RoutesService(speed.database, criteria, library);
    const steps = new StepsService(speed.database, criteria, library);
    const storage = new MemoryStorage();
    const dossiers = new DossiersService(speed.database, criteria, library, storage);
    const worker = new DossierWorker(speed.database, storage, {
      enabled: true,
      intervalMs: 60_000,
    });
    outcomes = new OutcomesService(speed.database);

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
    const project = async (code: string) =>
      (
        await new ProjectsService(speed.database).create(command(), {
          requestKey: randomUUID(),
          code,
          name: `Outcomes ${code}`,
          siteUnitId: 'north',
        })
      ).project.id;
    const projectId = await project('OUT');

    // The reference route, as seed-speed-lab enters it: library-linked substances, conditions and cited thermal data.
    const reference = (
      await routes.create(command(), {
        requestKey: randomUUID(),
        projectId,
        name: 'Reference route',
      })
    ).route.id;
    const substanceIds = new Map<string, string>();
    for (const fixture of REFERENCE_ROUTE) {
      const step = (
        await steps.addStep(command(), reference, {
          requestKey: randomUUID(),
          reason: 'Data entry',
          name: fixture.id,
        })
      ).step;
      for (const material of fixture.materials) {
        let substanceId = substanceIds.get(material.formula);
        if (!substanceId) {
          substanceId = (
            await substances.create(command(), {
              requestKey: randomUUID(),
              name: `Fixture ${material.formula}`,
              formula: material.formula,
              ...(material.libraryMaterialId
                ? { libraryMaterialId: material.libraryMaterialId }
                : {}),
            })
          ).substance.id;
          substanceIds.set(material.formula, substanceId);
        }
        await steps.addMaterial(command(), step.id, {
          requestKey: randomUUID(),
          reason: 'Data entry',
          substanceId,
          role: material.role,
          ...(typeof material.coefficient === 'number'
            ? { coefficient: material.coefficient }
            : {}),
          ...(typeof material.massG === 'number' ? { massG: material.massG } : {}),
        });
      }
      const c = fixture.conditions;
      await steps.replaceConditions(command(), step.id, {
        version: 0,
        reason: 'Data entry',
        processTemperatureC: c.processTemperatureC,
        maximumTechnicalTemperatureC: c.maximumTechnicalTemperatureC,
        heatCapacityJPerGK: c.heatCapacityJPerGK,
        accumulationPercent: c.accumulationPercent,
        reactionEnthalpySource: c.reactionEnthalpy?.source ?? null,
        reactionClassId:
          c.reactionEnthalpy?.source === 'REACTION_CLASS'
            ? c.reactionEnthalpy.reactionClassId
            : null,
      });
      const cited = { reason: 'Literature value', basis: 'LITERATURE' as const, citation: FIXTURE };
      if (c.dscOnsetC !== null)
        await steps.addThermalData(command(), step.id, {
          requestKey: randomUUID(),
          ...cited,
          kind: 'DSC_ONSET',
          onsetC: c.dscOnsetC,
        });
      if (c.decomposition)
        await steps.addThermalData(command(), step.id, {
          requestKey: randomUUID(),
          ...cited,
          kind: 'DECOMPOSITION_KINETICS',
          ...c.decomposition,
        });
      if (c.td24EnteredC !== null)
        await steps.addThermalData(command(), step.id, {
          requestKey: randomUUID(),
          ...cited,
          kind: 'TD24',
          td24C: c.td24EnteredC,
        });
    }
    await dossiers.request(command(), reference, { requestKey: randomUUID() });
    await worker.tick();

    // A second route with no step yet: counted among the routes, not screened. An archived one is not counted.
    await routes.create(command(), { requestKey: randomUUID(), projectId, name: 'Second route' });
    const archived = (
      await routes.create(command(), { requestKey: randomUUID(), projectId, name: 'Old route' })
    ).route;
    await routes.archive(command(), archived.id, {
      version: archived.version,
      reason: 'Superseded',
    });
  }, 180_000);

  afterAll(async () => {
    await speed?.close();
  });

  it('BO-1: counts the hazards found before the first experiment, from each step’s latest result', async () => {
    const result = await outcomes.get(admin);
    // The reference route: six High findings (steps 3, 4 and 5, as the speed-lab preview shows); step 3 is class 3 at
    // full accumulation with its decomposition kinetics (BRD TC-08) and step 4 is class 5; step 5 releases isobutane.
    expect(result.hazards.highInteractions).toBe(6);
    expect(result.hazards.class3OrWorseSteps).toBe(2);
    expect(result.hazards.gasFormingSteps).toBeGreaterThanOrEqual(1);
    expect(result.hazards.mediumInteractions).toBeGreaterThan(0);
    expect(result.worstClass).toBe(5);
  });

  it('BO-2 to BO-4: the time to the first dossier, the routes screened and the economy shown in dossiers', async () => {
    const result = await outcomes.get(admin);
    expect(result.routes).toBe(2);
    expect(result.screened).toEqual({ screened: 1, routes: 2 });
    expect(result.screening.routesMeasured).toBe(1);
    expect(result.screening.medianMinutes).toBeGreaterThanOrEqual(0);
    expect(result.economy).toEqual({ withEconomy: 1, withDossier: 1 });
  });

  it('counts only the sites the member reads', async () => {
    const south = await outcomes.get(principal(TENANT, 'south-chemist', ALL, units(['south'])));
    expect(south).toMatchObject({
      routes: 0,
      screened: { screened: 0, routes: 0 },
      worstClass: null,
    });
    expect(south.hazards).toEqual({
      highInteractions: 0,
      mediumInteractions: 0,
      class3OrWorseSteps: 0,
      gasFormingSteps: 0,
    });
  });
});
