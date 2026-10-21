import { createHash, randomUUID } from 'node:crypto';
import type { SpeedMaterialRole, SpeedResultV1 } from '@gigalibs/contracts';
import { type ModuleCommandContext, recordMutation } from '@gigalibs/module-sdk';
import {
  ENGINE_VERSION,
  IUPAC_2021_ABRIDGED,
  type MaterialInput,
  runGate,
} from '@gigalibs/process-safety-engines';
import type { Client } from '../access.js';
import { SCHEMA, TOPIC } from '../config.js';
import type { CriteriaInForce } from '../criteria/criteria.service.js';

// WI-OI-120bx (SPEED S4; plan v1.4 §4.3): the server's screening. The stored result is the record: every change to a
// step's content recomputes it with the engine package, and the result keeps the engine, element-table and criteria
// versions and a hash of exactly the inputs it used. A recompute adds a row (NFR-10); an unchanged input does not.

const ELEMENTS = IUPAC_2021_ABRIDGED;

/** Shown when the workspace has no criteria set in force: no result can be computed without one. */
export const NO_CRITERIA = { code: 'SPEED_NO_CRITERIA_IN_FORCE', requirement: 'BRD-15' } as const;

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
  inputs_hash: string;
  outputs: Record<string, unknown>;
  computed_by: string;
  computed_at: Date;
}

const RESULT_COLUMNS = `id, route_id, step_id, status, gate_pass, engine_version, elements_version, criteria_set_id, criteria_version,
  criteria_reviewed, inputs_hash, outputs, computed_by, computed_at`;

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
  }>(
    `SELECT m.id, m.role, s.formula, m.coefficient, m.mass_g
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
  }));
}

/**
 * Computes one step and stores its result unless the latest result already used exactly these inputs and versions.
 * Without a criteria set in force the result is a data gap that says so. Runs in the caller's transaction.
 */
export async function computeStep(
  client: Client,
  context: ModuleCommandContext,
  routeId: string,
  stepId: string,
  criteria: CriteriaInForce | null,
): Promise<SpeedResultV1> {
  const { tenantId, subject } = context.principal;
  const materials = await stepMaterials(client, tenantId, stepId);
  const inputs = {
    engineVersion: ENGINE_VERSION,
    elementsVersion: ELEMENTS.version,
    criteria: criteria ? { id: criteria.id, version: criteria.versionLabel } : null,
    materials,
  };
  const inputsHash = createHash('sha256').update(canonical(inputs)).digest('hex');
  const latest = await client.query<ResultRow>(
    `SELECT ${RESULT_COLUMNS} FROM ${SCHEMA}.results WHERE tenant_id = $1 AND step_id = $2 ORDER BY computed_at DESC, id DESC LIMIT 1`,
    [tenantId, stepId],
  );
  if (latest.rows[0]?.inputs_hash === inputsHash) return toResult(latest.rows[0]);

  const gate = criteria
    ? runGate(materials, ELEMENTS, criteria.criteria)
    : { status: 'DATA_GAP' as const, missing: [], reason: NO_CRITERIA };
  const ok = gate.status === 'OK';
  const inserted = await client.query<ResultRow>(
    `INSERT INTO ${SCHEMA}.results (id, tenant_id, route_id, step_id, status, gate_pass, engine_version, elements_version, criteria_set_id,
       criteria_version, criteria_reviewed, inputs_hash, inputs, outputs, computed_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14::jsonb, $15)
     RETURNING ${RESULT_COLUMNS}`,
    [
      randomUUID(),
      tenantId,
      routeId,
      stepId,
      ok ? 'OK' : 'DATA_GAP',
      ok ? gate.pass : null,
      ENGINE_VERSION,
      ELEMENTS.version,
      criteria?.id ?? null,
      criteria?.versionLabel ?? null,
      criteria ? criteria.reviewed : null,
      inputsHash,
      JSON.stringify(inputs),
      JSON.stringify({ gate }),
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
