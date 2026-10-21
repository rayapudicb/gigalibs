import { createHash, randomUUID } from 'node:crypto';
import type { SpeedEnthalpySource, SpeedMaterialRole, SpeedResultV1 } from '@gigalibs/contracts';
import { type ModuleCommandContext, recordMutation } from '@gigalibs/module-sdk';
import {
  ENGINE_VERSION,
  type GateResult,
  type GreenOutcome,
  IUPAC_2021_ABRIDGED,
  type MaterialInput,
  type ThermalConditions,
  greenMetrics,
  oxygenBalance,
  routeRollup,
  runGate,
  runThermal,
  screenInteractions,
} from '@gigalibs/process-safety-engines';
import type { Client } from '../access.js';
import { SCHEMA, TOPIC } from '../config.js';
import type { CriteriaInForce } from '../criteria/criteria.service.js';
import type { LibraryInForce } from '../library/library.service.js';

// WI-OI-120bx/120by (SPEED S4, S5; plan v1.4 §4.3): the server's screening. The stored result is the record: every
// change to a step's content recomputes it with the engine package, and the result keeps the engine, element-table,
// criteria and library versions and a hash of exactly the inputs it used. A recompute adds a row (NFR-10); an unchanged
// input does not. A step that fails the gate stores its gate only (FR-GATE-04).

const ELEMENTS = IUPAC_2021_ABRIDGED;

/** Shown when the workspace has no criteria set in force: no result can be computed without one. */
export const NO_CRITERIA = { code: 'SPEED_NO_CRITERIA_IN_FORCE', requirement: 'BRD-15' } as const;
/** Shown when the workspace has no library set in force: thermal results need its classes, enthalpies and gases. */
export const NO_LIBRARY = { code: 'SPEED_NO_LIBRARY_IN_FORCE', requirement: 'BRD-16.2' } as const;

/** The criteria and library sets in force, read in the caller's transaction. */
export interface ScreeningSets {
  readonly criteria: CriteriaInForce | null;
  readonly library: LibraryInForce | null;
}

interface ResultRow {
  id: string;
  route_id: string;
  step_id: string;
  status: 'OK' | 'DATA_GAP';
  gate_pass: boolean | null;
  engine_version: string;
  elements_version: string;
  criteria_set_id: string | null;
  criteria_version: string | null;
  criteria_reviewed: boolean | null;
  library_set_id: string | null;
  library_version: string | null;
  library_reviewed: boolean | null;
  inputs_hash: string;
  outputs: Record<string, unknown>;
  computed_by: string;
  computed_at: Date;
}

const RESULT_COLUMNS = `id, route_id, step_id, status, gate_pass, engine_version, elements_version, criteria_set_id, criteria_version,
  criteria_reviewed, library_set_id, library_version, library_reviewed, inputs_hash, outputs, computed_by, computed_at`;

export function toResult(row: ResultRow): SpeedResultV1 {
  return {
    id: row.id,
    routeId: row.route_id,
    stepId: row.step_id,
    status: row.status,
    gatePass: row.gate_pass,
    engineVersion: row.engine_version,
    elementsVersion: row.elements_version,
    criteriaSetId: row.criteria_set_id,
    criteriaVersion: row.criteria_version,
    criteriaReviewed: row.criteria_reviewed,
    librarySetId: row.library_set_id,
    libraryVersion: row.library_version,
    libraryReviewed: row.library_reviewed,
    inputsHash: row.inputs_hash,
    outputs: row.outputs,
    computedBy: row.computed_by,
    computedAt: new Date(row.computed_at).toISOString(),
  };
}

/** Canonical JSON: keys sorted at every level, so equal inputs always hash alike. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

const number = (value: string | null): number | null => (value === null ? null : Number(value));

/** The step's materials as the engines read them, in their order on the step. */
export async function stepMaterials(
  client: Client,
  tenantId: string,
  stepId: string,
): Promise<MaterialInput[]> {
  const rows = await client.query<{
    id: string;
    role: SpeedMaterialRole;
    formula: string;
    coefficient: string | null;
    mass_g: string | null;
    energetic_groups: string[];
    library_material_id: string | null;
  }>(
    `SELECT m.id, m.role, s.formula, m.coefficient, m.mass_g, m.energetic_groups, s.library_material_id
       FROM ${SCHEMA}.step_materials m
       JOIN ${SCHEMA}.substances s ON s.tenant_id = m.tenant_id AND s.id = m.substance_id
      WHERE m.tenant_id = $1 AND m.step_id = $2
      ORDER BY m.position, m.id`,
    [tenantId, stepId],
  );
  return rows.rows.map((row) => ({
    id: row.id,
    role: row.role,
    formula: row.formula,
    coefficient: number(row.coefficient),
    massG: number(row.mass_g),
    energeticGroups: [...row.energetic_groups].sort(),
    libraryMaterialId: row.library_material_id,
  }));
}

/** The step's thermal conditions as the engines read them: its process values, ΔHr source and active thermal data. */
export async function stepThermalConditions(
  client: Client,
  tenantId: string,
  stepId: string,
): Promise<ThermalConditions> {
  const conditions = await client.query<{
    process_temperature_c: string | null;
    maximum_technical_temperature_c: string | null;
    heat_capacity_j_per_g_k: string | null;
    accumulation_percent: string | null;
    reaction_enthalpy_source: SpeedEnthalpySource | null;
    reaction_class_id: string | null;
  }>(
    `SELECT process_temperature_c, maximum_technical_temperature_c, heat_capacity_j_per_g_k, accumulation_percent,
            reaction_enthalpy_source, reaction_class_id
       FROM ${SCHEMA}.step_conditions WHERE tenant_id = $1 AND step_id = $2`,
    [tenantId, stepId],
  );
  const data = await client.query<{
    kind: string;
    reaction_enthalpy_kj_per_mol: string | null;
    onset_c: string | null;
    td24_c: string | null;
    activation_energy_kj_per_mol: string | null;
    heat_release_rate_w_per_kg: string | null;
    reference_temperature_c: string | null;
  }>(
    `SELECT kind, reaction_enthalpy_kj_per_mol, onset_c, td24_c, activation_energy_kj_per_mol, heat_release_rate_w_per_kg,
            reference_temperature_c
       FROM ${SCHEMA}.thermal_data WHERE tenant_id = $1 AND step_id = $2 AND status = 'ACTIVE'`,
    [tenantId, stepId],
  );
  const active = (kind: string) => data.rows.find((row) => row.kind === kind);
  const row = conditions.rows[0];
  const measured = number(active('REACTION_ENTHALPY')?.reaction_enthalpy_kj_per_mol ?? null);
  const kinetics = active('DECOMPOSITION_KINETICS');
  const source = row?.reaction_enthalpy_source ?? null;
  return {
    processTemperatureC: number(row?.process_temperature_c ?? null),
    maximumTechnicalTemperatureC: number(row?.maximum_technical_temperature_c ?? null),
    heatCapacityJPerGK: number(row?.heat_capacity_j_per_g_k ?? null),
    accumulationPercent: number(row?.accumulation_percent ?? null),
    reactionEnthalpy:
      source === 'MANUAL'
        ? measured === null
          ? null
          : { source: 'MANUAL', kJPerMol: measured }
        : source === 'REACTION_CLASS' && row?.reaction_class_id
          ? { source: 'REACTION_CLASS', reactionClassId: row.reaction_class_id }
          : source === 'HESS'
            ? { source: 'HESS' }
            : null,
    decomposition: kinetics
      ? {
          activationEnergyKJPerMol: Number(kinetics.activation_energy_kj_per_mol),
          heatReleaseRateWPerKg: Number(kinetics.heat_release_rate_w_per_kg),
          referenceTemperatureC: Number(kinetics.reference_temperature_c),
        }
      : null,
    td24EnteredC: number(active('TD24')?.td24_c ?? null),
    dscOnsetC: number(active('DSC_ONSET')?.onset_c ?? null),
  };
}

/** What the engines compute for one step from these inputs (pure; the same calls the browser preview makes). */
export function screenStep(
  materials: readonly MaterialInput[],
  conditions: ThermalConditions,
  sets: ScreeningSets,
): Record<string, unknown> {
  if (!sets.criteria) return { gate: { status: 'DATA_GAP', missing: [], reason: NO_CRITERIA } };
  const criteria = sets.criteria.criteria;
  const gate = runGate(materials, ELEMENTS, criteria);
  if (gate.status !== 'OK' || !gate.pass) return { gate };
  return {
    gate,
    oxygenBalance: gate.materials
      .filter((material) => material.formula.ok)
      .map((material) => ({
        materialId: material.input.id,
        result: oxygenBalance(material, ELEMENTS, criteria),
      })),
    thermal: sets.library
      ? runThermal(gate, conditions, sets.library.library, criteria)
      : { status: 'DATA_GAP', missing: [], reason: NO_LIBRARY },
    green: greenMetrics(gate),
    interactions: sets.library
      ? screenInteractions(materials, sets.library.library)
      : { status: 'DATA_GAP', missing: [], reason: NO_LIBRARY },
  };
}

/**
 * Computes one step and stores its result unless the latest result already used exactly these inputs and versions.
 * Runs in the caller's transaction; each stored result is audited.
 */
export async function computeStep(
  client: Client,
  context: ModuleCommandContext,
  routeId: string,
  stepId: string,
  sets: ScreeningSets,
): Promise<SpeedResultV1> {
  const { tenantId, subject } = context.principal;
  const materials = await stepMaterials(client, tenantId, stepId);
  const conditions = await stepThermalConditions(client, tenantId, stepId);
  const inputs = {
    engineVersion: ENGINE_VERSION,
    elementsVersion: ELEMENTS.version,
    criteria: sets.criteria ? { id: sets.criteria.id, version: sets.criteria.versionLabel } : null,
    library: sets.library ? { id: sets.library.id, version: sets.library.versionLabel } : null,
    materials,
    conditions,
  };
  const inputsHash = createHash('sha256').update(canonical(inputs)).digest('hex');
  const latest = await client.query<ResultRow>(
    `SELECT ${RESULT_COLUMNS} FROM ${SCHEMA}.results WHERE tenant_id = $1 AND step_id = $2 ORDER BY computed_at DESC, id DESC LIMIT 1`,
    [tenantId, stepId],
  );
  if (latest.rows[0]?.inputs_hash === inputsHash) return toResult(latest.rows[0]);

  const outputs = screenStep(materials, conditions, sets);
  const gate = outputs['gate'] as { status: string; pass?: boolean };
  const ok = gate.status === 'OK';
  const inserted = await client.query<ResultRow>(
    `INSERT INTO ${SCHEMA}.results (id, tenant_id, route_id, step_id, status, gate_pass, engine_version, elements_version, criteria_set_id,
       criteria_version, criteria_reviewed, library_set_id, library_version, library_reviewed, inputs_hash, inputs, outputs, computed_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb, $17::jsonb, $18)
     RETURNING ${RESULT_COLUMNS}`,
    [
      randomUUID(),
      tenantId,
      routeId,
      stepId,
      ok ? 'OK' : 'DATA_GAP',
      ok ? gate.pass === true : null,
      ENGINE_VERSION,
      ELEMENTS.version,
      sets.criteria?.id ?? null,
      sets.criteria?.versionLabel ?? null,
      sets.criteria ? sets.criteria.reviewed : null,
      sets.library?.id ?? null,
      sets.library?.versionLabel ?? null,
      sets.library ? sets.library.reviewed : null,
      inputsHash,
      JSON.stringify(inputs),
      JSON.stringify(outputs),
      subject,
    ],
  );
  const result = toResult(inserted.rows[0] as ResultRow);
  // Who computed what, from which inputs, with which versions; never the chemistry itself.
  await recordMutation(client, { schema: SCHEMA, topic: TOPIC }, context, {
    action: 'SCREENING_RESULT_STORED',
    aggregateType: 'result',
    aggregateId: result.id,
    aggregateVersion: 1,
    payload: {
      routeId,
      stepId,
      status: result.status,
      gatePass: result.gatePass,
      engineVersion: result.engineVersion,
      elementsVersion: result.elementsVersion,
      criteriaVersion: result.criteriaVersion,
      libraryVersion: result.libraryVersion,
      inputsHash: result.inputsHash,
    },
  });
  return result;
}

/** The latest result of each step. */
export async function latestResults(
  client: Client,
  tenantId: string,
  stepIds: readonly string[],
): Promise<Map<string, SpeedResultV1>> {
  if (stepIds.length === 0) return new Map();
  const rows = await client.query<ResultRow>(
    `SELECT DISTINCT ON (step_id) ${RESULT_COLUMNS} FROM ${SCHEMA}.results
      WHERE tenant_id = $1 AND step_id = ANY($2::uuid[])
      ORDER BY step_id, computed_at DESC, id DESC`,
    [tenantId, [...stepIds]],
  );
  return new Map(rows.rows.map((row) => [row.step_id, toResult(row)]));
}

/** A route's results, newest first (the history the dossier and the audit read). */
export async function routeResults(
  client: Client,
  tenantId: string,
  routeId: string,
  limit: number,
): Promise<SpeedResultV1[]> {
  const rows = await client.query<ResultRow>(
    `SELECT ${RESULT_COLUMNS} FROM ${SCHEMA}.results WHERE tenant_id = $1 AND route_id = $2 ORDER BY computed_at DESC, id DESC LIMIT $3`,
    [tenantId, routeId, limit],
  );
  return rows.rows.map(toResult);
}

/** The route roll-up (FR-GRN-04) from the steps' latest results, in step order; null for a route without steps. */
export function rollupOf(
  results: readonly (SpeedResultV1 | null)[],
): Record<string, unknown> | null {
  if (results.length === 0) return null;
  const steps = results.map((result) => {
    const outputs = result?.outputs ?? {};
    const gate = outputs['gate'] as GateResult | undefined;
    const green = (outputs['green'] as GreenOutcome | undefined) ?? ({ status: 'LOCKED' } as const);
    return { gate: gate?.status === 'OK' ? gate : null, green };
  });
  const blocked = steps.findIndex((step) => step.gate === null || step.green.status !== 'OK');
  if (blocked !== -1) return { status: 'BLOCKED', blockedStepIndex: blocked };
  return {
    ...routeRollup(steps.map((step) => ({ gate: step.gate as GateResult, green: step.green }))),
  };
}
