import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import {
  AddSpeedThermalDataInputV1Schema,
  type SpeedLibraryPackV1,
  type SpeedStepV1,
} from '@gigalibs/contracts';
import type { ModuleCommandContext } from '@gigalibs/module-sdk';
import {
  IUPAC_2021_ABRIDGED,
  type MaterialInput,
  greenMetrics,
  missingCriteria,
  oxygenBalance,
  runGate,
  runThermal,
} from '@gigalibs/process-safety-engines';
import { ConflictException, HttpException, UnprocessableEntityException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BRD_CRITERIA } from '../../../../../../packages/process-safety-engines/test/fixtures/criteria.js';
import { PROTOTYPE_LIBRARY } from '../../../../../../packages/process-safety-engines/test/fixtures/library.js';
import {
  type FixtureStep,
  REFERENCE_ROUTE,
} from '../../../../../../packages/process-safety-engines/test/fixtures/reference-route.js';
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
import { RoutesService } from './routes.service.js';
import { StepsService } from './steps.service.js';

// WI-OI-120by (SPEED S5): the reference route entered through the API gives, step by step, exactly what the engines give
// for the same inputs (BRD TC-01 to TC-03, TC-06 to TC-10), and every result stamps the engine, criteria, library and
// atomic-weight versions (NFR-10). TEST FIXTURE data only: the BRD criteria, the prototype library and the illustrative
// charges, every citation saying so.

const TENANT = `tenant-s5-${randomUUID().slice(0, 8)}`;
const ALL = [
  'speed:read',
  'speed.routes.read',
  'speed.routes.write',
  'speed.substances.write',
  'speed.thermal-data.write',
  'speed.engines.run',
  'speed.settings.manage',
];
const FIXTURE = 'TEST FIXTURE: SPEED-BRD-FRD-001 v0.1 and the design prototype';
const ELEMENTS = IUPAC_2021_ABRIDGED;
const { version: _criteriaVersion, ...BRD_VALUES } = BRD_CRITERIA;

/** The prototype library as a pack, every entry cited; plus two energetic groups for the tagging tests. */
const PACK: SpeedLibraryPackV1 = {
  materials: PROTOTYPE_LIBRARY.materials.map((entry) => ({
    id: entry.id,
    classes: [...entry.classes],
    citation: entry.citation,
  })),
  rules: PROTOTYPE_LIBRARY.rules.map((entry) => ({
    id: entry.id,
    classA: entry.classA,
    classB: entry.classB,
    severity: entry.severity,
    citation: entry.citation,
    ...(entry.recommendedTest ? { recommendedTest: entry.recommendedTest } : {}),
  })),
  reactionClasses: PROTOTYPE_LIBRARY.reactionClasses.map((entry) => ({
    id: entry.id,
    typicalReactionEnthalpyKJPerMol: entry.typicalReactionEnthalpyKJPerMol,
    citation: entry.citation,
  })),
  formationEnthalpies: Object.fromEntries(
    Object.entries(PROTOTYPE_LIBRARY.formationEnthalpies).map(([hill, entry]) => [
      hill,
      { kJPerMol: entry.kJPerMol, phase: entry.phase, citation: entry.citation },
    ]),
  ),
  gases: Object.fromEntries(
    Object.entries(PROTOTYPE_LIBRARY.gases).map(([hill, entry]) => [
      hill,
      { id: entry.id, citation: entry.citation },
    ]),
  ),
  energeticGroups: [
    { id: 'peroxide', citation: FIXTURE },
    { id: 'azide', citation: FIXTURE },
  ],
};

const command = (who = admin): ModuleCommandContext => ({
  principal: who,
  correlationId: randomUUID(),
});
const admin = principal(TENANT, 'admin', ALL);
const round = (value: number | null | undefined, digits: number) =>
  typeof value === 'number' ? Number(value.toFixed(digits)) : value;

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

describe.skipIf(!adminUrl)('SPEED screening results through the API (WI-OI-120by)', () => {
  let speed: SpeedDatabase;
  let routes: RoutesService;
  let steps: StepsService;
  let substances: SubstancesService;
  const substanceIds = new Map<string, string>();
  const stepIds = new Map<string, string>();
  let routeId = '';
  let projectId = '';

  const substanceFor = async (formula: string) => {
    const known = substanceIds.get(formula);
    if (known) return known;
    const created = await substances.create(command(), {
      requestKey: randomUUID(),
      name: `Fixture ${formula}`,
      formula,
    });
    substanceIds.set(formula, created.substance.id);
    return created.substance.id;
  };

  /** Enters one fixture step through the API: materials, conditions, cited thermal data. */
  const enter = async (route: string, fixture: FixtureStep): Promise<string> => {
    const step = (
      await steps.addStep(command(), route, {
        requestKey: randomUUID(),
        reason: 'Data entry',
        name: fixture.id,
      })
    ).step;
    for (const material of fixture.materials) {
      await steps.addMaterial(command(), step.id, {
        requestKey: randomUUID(),
        reason: 'Data entry',
        substanceId: await substanceFor(material.formula),
        role: material.role,
        ...(typeof material.coefficient === 'number' ? { coefficient: material.coefficient } : {}),
        ...(typeof material.massG === 'number' ? { massG: material.massG } : {}),
      });
    }
    const c = fixture.conditions;
    const source = c.reactionEnthalpy;
    await steps.replaceConditions(command(), step.id, {
      version: 0,
      reason: 'Data entry',
      processTemperatureC: c.processTemperatureC,
      maximumTechnicalTemperatureC: c.maximumTechnicalTemperatureC,
      heatCapacityJPerGK: c.heatCapacityJPerGK,
      accumulationPercent: c.accumulationPercent,
      reactionEnthalpySource: source?.source ?? null,
      reactionClassId: source?.source === 'REACTION_CLASS' ? source.reactionClassId : null,
    });
    const cited = {
      requestKey: randomUUID(),
      reason: 'Literature value',
      basis: 'LITERATURE' as const,
      citation: FIXTURE,
    };
    if (c.dscOnsetC !== null)
      await steps.addThermalData(command(), step.id, {
        ...cited,
        kind: 'DSC_ONSET',
        onsetC: c.dscOnsetC,
      });
    if (c.decomposition)
      await steps.addThermalData(command(), step.id, {
        ...cited,
        requestKey: randomUUID(),
        kind: 'DECOMPOSITION_KINETICS',
        ...c.decomposition,
      });
    if (c.td24EnteredC !== null)
      await steps.addThermalData(command(), step.id, {
        ...cited,
        requestKey: randomUUID(),
        kind: 'TD24',
        td24C: c.td24EnteredC,
      });
    return step.id;
  };

  const detail = () => routes.get(admin, routeId);
  const stepOf = async (fixtureId: string): Promise<SpeedStepV1> => {
    const found = (await detail()).steps.find((step) => step.id === stepIds.get(fixtureId));
    if (!found) throw new Error(fixtureId);
    return found;
  };
  // biome-ignore lint/suspicious/noExplicitAny: engine outputs are read back as stored JSON.
  const outputs = (step: SpeedStepV1) => step.latestResult?.outputs as Record<string, any>;

  beforeAll(async () => {
    speed = await speedDatabase('screening');
    const criteria = new CriteriaService(speed.database);
    const library = new LibraryService(speed.database);
    substances = new SubstancesService(speed.database);
    routes = new RoutesService(speed.database, criteria, library);
    steps = new StepsService(speed.database, criteria, library);
    const citations = Object.fromEntries(
      missingCriteria({})
        .filter((path) => path !== 'version')
        .map((path) => [path, FIXTURE]),
    );
    const imported = await criteria.import(command(), {
      requestKey: randomUUID(),
      versionLabel: 'brd-0.1',
      source: FIXTURE,
      criteria: BRD_VALUES,
      citations,
    });
    await criteria.putInForce(command(), imported.set.id, { version: 1, reason: 'Pilot start' });
    const pack = await library.import(command(), {
      requestKey: randomUUID(),
      versionLabel: 'prototype-0.1',
      source: FIXTURE,
      library: PACK,
    });
    await library.putInForce(command(), pack.set.id, { version: 1, reason: 'Pilot start' });
    projectId = (
      await new ProjectsService(speed.database).create(command(), {
        requestKey: randomUUID(),
        code: 'REF',
        name: 'Reference route',
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
    for (const fixture of REFERENCE_ROUTE) stepIds.set(fixture.id, await enter(routeId, fixture));
  }, 120_000);

  afterAll(async () => {
    await speed?.close();
  });

  it('gives, step by step, exactly what the engines give for the same inputs', async () => {
    for (const fixture of REFERENCE_ROUTE) {
      const stored = outputs(await stepOf(fixture.id));
      const gate = runGate(fixture.materials, ELEMENTS, BRD_CRITERIA);
      if (gate.status !== 'OK') throw new Error('fixture gate');
      expect(stored['gate'].pass).toBe(gate.pass);
      expect(round(stored['gate'].extentMol, 9)).toBe(round(gate.extentMol, 9));
      const thermal = runThermal(gate, fixture.conditions, PROTOTYPE_LIBRARY, BRD_CRITERIA);
      if (thermal.status !== 'OK') throw new Error(`fixture thermal ${thermal.status}`);
      for (const key of [
        'adiabaticRiseK',
        'mtsrC',
        'mtsrFullAccumulationC',
        'td24C',
        'tmrAtMtsrHours',
        'heatReleasedKJ',
        'reactionEnthalpyKJPerMol',
      ] as const) {
        expect([fixture.id, key, round(stored['thermal'][key], 6)]).toEqual([
          fixture.id,
          key,
          round(thermal[key], 6),
        ]);
      }
      for (const key of [
        'td24Basis',
        'stoesselClass',
        'stoesselClassFullAccumulation',
        'severity',
        'probability',
        'enthalpyIsEstimate',
      ] as const) {
        expect([fixture.id, key, stored['thermal'][key]]).toEqual([fixture.id, key, thermal[key]]);
      }
      expect(
        stored['thermal'].gases.map((gas: { gasId: string; moles: number }) => [
          gas.gasId,
          round(gas.moles, 6),
        ]),
      ).toEqual(thermal.gases.map((gas) => [gas.gasId, round(gas.moles, 6)]));
      const green = greenMetrics(gate);
      expect(stored['green'].status).toBe(green.status);
      if (green.status === 'OK') {
        for (const key of [
          'atomEconomyPercent',
          'processMassIntensity',
          'eFactor',
          'reactionMassEfficiencyPercent',
          'yieldPercent',
        ] as const) {
          expect([fixture.id, key, round(stored['green'][key], 6)]).toEqual([
            fixture.id,
            key,
            round(green[key], 6),
          ]);
        }
      }
      const byFormula = (materials: readonly MaterialInput[], id: string) =>
        materials.find((m) => m.id === id)?.formula;
      const expectedOb = gate.materials
        .filter((m) => m.formula.ok)
        .map((m) => {
          const ob = oxygenBalance(m, ELEMENTS, BRD_CRITERIA);
          return [m.input.formula, ob.status === 'OK' ? round(ob.percent, 6) : ob.status];
        });
      const storedMaterials = (await stepOf(fixture.id)).materials;
      const storedOb = stored['oxygenBalance'].map(
        (entry: { materialId: string; result: { status: string; percent?: number } }) => [
          storedMaterials.find((m) => m.id === entry.materialId)?.formula ??
            byFormula(fixture.materials, entry.materialId),
          entry.result.status === 'OK' ? round(entry.result.percent, 6) : entry.result.status,
        ],
      );
      expect(storedOb).toEqual(expectedOb);
    }
  });

  it('reproduces the BRD figures: TC-06 ξ, TC-07 ΔTad and MTSR, TC-08 TD24 and classes, TC-10 isobutane, TC-03 toluene OB', async () => {
    const s3 = outputs(await stepOf('s3'));
    expect(round(s3['gate'].extentMol, 3)).toBe(0.548);
    expect(round(s3['thermal'].adiabaticRiseK, 1)).toBe(56.5);
    expect(round(s3['thermal'].mtsrC, 1)).toBe(36.3);
    expect(round(s3['thermal'].mtsrFullAccumulationC, 1)).toBe(81.5);
    expect(s3['thermal'].td24Basis).toBe('KINETICS');
    expect(round(s3['thermal'].td24C, 1)).toBe(91.8);
    expect([s3['thermal'].stoesselClass, s3['thermal'].stoesselClassFullAccumulation]).toEqual([
      1, 3,
    ]);
    const s5 = outputs(await stepOf('s5'));
    expect(round(s5['gate'].extentMol, 3)).toBe(0.419);
    expect(
      round(
        s5['thermal'].gases.find((gas: { gasId: string }) => gas.gasId === 'isobutane')?.moles,
        2,
      ),
    ).toBe(1.68);
    const s2 = await stepOf('s2');
    const toluene = s2.materials.find((m) => m.formula === 'C7H8');
    const tolueneOb = outputs(s2)['oxygenBalance'].find(
      (entry: { materialId: string }) => entry.materialId === toluene?.id,
    );
    expect(round(tolueneOb?.result.percent, 1)).toBe(-312.6);
  });

  it('TC-01 and TC-02 through the API: TNT −74.0 % and nitroglycerin +3.5 %', async () => {
    const nitration = (
      await routes.create(command(), { requestKey: randomUUID(), projectId, name: 'Nitrations' })
    ).route.id;
    const tnt = await enter(nitration, {
      id: 'tnt',
      materials: [
        { id: 'a', role: 'Reactant', formula: 'C7H8', coefficient: 1, massG: 92.1 },
        { id: 'b', role: 'Reactant', formula: 'HNO3', coefficient: 3, massG: 189.0 },
        { id: 'p', role: 'Product', formula: 'C7H5N3O6', coefficient: 1, massG: 150 },
        { id: 'w', role: 'By-product', formula: 'H2O', coefficient: 3 },
      ],
      conditions: REFERENCE_ROUTE[0]?.conditions as FixtureStep['conditions'],
    });
    const glycerol = await enter(nitration, {
      id: 'ng',
      materials: [
        { id: 'a', role: 'Reactant', formula: 'C3H8O3', coefficient: 1, massG: 92.1 },
        { id: 'b', role: 'Reactant', formula: 'HNO3', coefficient: 3, massG: 189.0 },
        { id: 'p', role: 'Product', formula: 'C3H5N3O9', coefficient: 1, massG: 150 },
        { id: 'w', role: 'By-product', formula: 'H2O', coefficient: 3 },
      ],
      conditions: REFERENCE_ROUTE[0]?.conditions as FixtureStep['conditions'],
    });
    const route = await routes.get(admin, nitration);
    const obOf = (stepId: string, formula: string) => {
      const step = route.steps.find((s) => s.id === stepId);
      const material = step?.materials.find((m) => m.formula === formula);
      return round(
        outputs(step as SpeedStepV1)['oxygenBalance'].find(
          (entry: { materialId: string }) => entry.materialId === material?.id,
        )?.result.percent,
        1,
      );
    };
    expect(obOf(tnt, 'C7H5N3O6')).toBe(-74.0);
    expect(obOf(glycerol, 'C3H5N3O9')).toBe(3.5);
  });

  it('stamps every result with the engine, criteria, library and atomic-weight versions, and says the inputs are unreviewed', async () => {
    const result = (await stepOf('s3')).latestResult;
    expect(result).toMatchObject({
      criteriaVersion: 'brd-0.1',
      criteriaReviewed: false,
      libraryVersion: 'prototype-0.1',
      libraryReviewed: false,
      elementsVersion: ELEMENTS.version,
    });
    expect(outputs((await stepOf('s3')) as SpeedStepV1)['thermal'].usesUnreviewedLibrary).toBe(
      true,
    );
    expect((await detail()).rollup).toMatchObject({ status: 'OK' });
  });

  it('a step that fails the gate stores its gate only (FR-GATE-04)', async () => {
    const s1 = await stepOf('s1');
    const water = s1.materials.find((m) => m.role === 'By-product');
    if (!water) throw new Error('no water');
    const failed = await steps.removeMaterial(command(), water.id, {
      version: water.version,
      reason: 'Correction',
    });
    expect(Object.keys(failed.step.latestResult?.outputs ?? {})).toEqual(['gate']);
    expect((await detail()).rollup).toMatchObject({ status: 'BLOCKED', blockedStepIndex: 0 });
  });

  it('tags energetic groups from the library: acetic acid in the band becomes High (BRL-02); an unknown group is refused', async () => {
    const s1 = await stepOf('s1');
    const acid = s1.materials.find((m) => m.formula === 'C2H4O2');
    if (!acid) throw new Error('no acid');
    expect(
      await rejection(
        steps.setEnergeticGroups(command(), acid.id, {
          version: acid.version,
          reason: 'Structure',
          groups: ['nitro-made-up'],
        }),
      ),
    ).toMatchObject({
      type: UnprocessableEntityException,
      code: 'SPEED_ENERGETIC_GROUP_UNKNOWN',
    });
    // Put the water back so the gate passes again, then tag.
    await steps.addMaterial(command(), s1.id, {
      requestKey: randomUUID(),
      reason: 'Correction',
      substanceId: await substanceFor('H2O'),
      role: 'By-product',
      coefficient: 1,
    });
    const tagged = await steps.setEnergeticGroups(command(), acid.id, {
      version: acid.version,
      reason: 'Structure',
      groups: ['peroxide'],
    });
    const ob = outputs(tagged.step)['oxygenBalance'].find(
      (entry: { materialId: string }) => entry.materialId === acid.id,
    );
    expect(ob?.result).toMatchObject({ recommendation: 'HIGH', energetic: true });
  });

  it('keeps cited thermal values: a citation is required, a new value supersedes the old one, and values are never edited', async () => {
    const s4 = await stepOf('s4');
    expect(() =>
      AddSpeedThermalDataInputV1Schema.parse({
        requestKey: randomUUID(),
        reason: 'x',
        kind: 'DSC_ONSET',
        onsetC: 170,
        basis: 'MEASURED',
        citation: ' ',
      }),
    ).toThrow();
    const before = s4.thermalData.find((data) => data.kind === 'DSC_ONSET');
    const changed = await steps.addThermalData(command(), s4.id, {
      requestKey: randomUUID(),
      reason: 'Measured value',
      kind: 'DSC_ONSET',
      onsetC: 175,
      basis: 'MEASURED',
      citation: 'TEST FIXTURE: DSC run 2026-10-21',
    });
    expect(
      changed.step.thermalData
        .filter((data) => data.kind === 'DSC_ONSET')
        .map((data) => data.onsetC),
    ).toEqual([175]);
    expect(outputs(changed.step)['thermal'].td24C).toBe(
      175 - BRD_CRITERIA.td24ConservativeOnsetOffsetK,
    );
    await speed.asRuntime(TENANT, async (runtime) => {
      await expect(
        runtime.query(`UPDATE gigalibs_speed.thermal_data SET onset_c = 999 WHERE id = $1`, [
          before?.id,
        ]),
      ).rejects.toMatchObject({ code: '55000' });
    });
  });

  it('records the mitigation of a class 5 step at its current version', async () => {
    const s4 = await stepOf('s4');
    expect(outputs(s4)['thermal'].stoesselClassFullAccumulation).toBeGreaterThanOrEqual(4);
    const recorded = await steps.replaceMitigation(command(), s4.id, {
      version: 0,
      reason: 'Mitigation',
      text: 'Dose NaOH over 2 h below 60 °C.',
    });
    expect(recorded.step.mitigation).toMatchObject({
      text: 'Dose NaOH over 2 h below 60 °C.',
      version: 1,
      recordedBy: 'admin',
      acceptedBy: null,
    });
    expect(
      await rejection(
        steps.replaceMitigation(command(), s4.id, {
          version: 0,
          reason: 'Mitigation',
          text: 'Other',
        }),
      ),
    ).toMatchObject({
      type: ConflictException,
      code: 'SPEED_VERSION_CONFLICT',
    });
  });

  it('refuses a reaction class the library in force does not hold', async () => {
    const s2 = await stepOf('s2');
    const refused = await rejection(
      steps.replaceConditions(command(), s2.id, {
        version: s2.conditions?.version ?? 0,
        reason: 'Correction',
        processTemperatureC: 50,
        maximumTechnicalTemperatureC: 189,
        heatCapacityJPerGK: 2,
        accumulationPercent: 100,
        reactionEnthalpySource: 'REACTION_CLASS',
        reactionClassId: 'RC-99',
      }),
    );
    expect(refused).toMatchObject({
      type: UnprocessableEntityException,
      code: 'SPEED_REACTION_CLASS_UNKNOWN',
    });
  });
});
