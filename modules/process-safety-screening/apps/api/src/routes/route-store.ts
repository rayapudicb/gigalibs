import type {
  SpeedEnthalpySource,
  SpeedMaterialRole,
  SpeedMitigationV1,
  SpeedRecordStatus,
  SpeedRouteDetailV1,
  SpeedRouteStatus,
  SpeedRouteV1,
  SpeedStepConditionsV1,
  SpeedStepMaterialV1,
  SpeedStepV1,
  SpeedThermalDataV1,
  SpeedThermalKind,
} from '@gigalibs/contracts';
import type { ModulePrincipal, OrganizationAccess } from '@gigalibs/module-sdk';
import { type Client, assertSiteWrite, readableSite } from '../access.js';
import { SCHEMA } from '../config.js';
import { errors, refuse } from '../errors.js';
import { latestResults, rollupOf } from './screening.js';

// WI-OI-120bx (SPEED S4): reading routes and their content, and the rule every change to a route follows: the member
// may write the route's site, the route is a draft, its project is active, and the route row is locked for the rest of
// the transaction, so concurrent changes to one route apply one after another.

export interface RouteRow {
  id: string;
  project_id: string;
  name: string;
  route_version: number;
  status: SpeedRouteStatus;
  author_subject: string;
  version: number;
  created_by: string;
  created_at: Date;
  updated_at: Date;
  archived_by: string | null;
  archived_at: Date | null;
  site_unit_id: string;
  project_status: SpeedRecordStatus;
  step_count: string;
  steps_passing: string;
}

/** Route columns with the project's site and status and the derived step counts (`r` routes, `p` projects). */
export const ROUTE_COLUMNS = `r.id, r.project_id, r.name, r.route_version, r.status, r.author_subject, r.version, r.created_by, r.created_at,
  r.updated_at, r.archived_by, r.archived_at, p.site_unit_id, p.status AS project_status,
  (SELECT count(*) FROM ${SCHEMA}.steps s WHERE s.tenant_id = r.tenant_id AND s.route_id = r.id) AS step_count,
  (SELECT count(*) FROM ${SCHEMA}.steps s
     JOIN LATERAL (SELECT x.gate_pass FROM ${SCHEMA}.results x WHERE x.tenant_id = s.tenant_id AND x.step_id = s.id
                    ORDER BY x.computed_at DESC, x.id DESC LIMIT 1) latest ON true
    WHERE s.tenant_id = r.tenant_id AND s.route_id = r.id AND latest.gate_pass) AS steps_passing`;

export const ROUTE_FROM = `${SCHEMA}.routes r JOIN ${SCHEMA}.projects p ON p.tenant_id = r.tenant_id AND p.id = r.project_id`;

export function toRoute(row: RouteRow): SpeedRouteV1 {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    routeVersion: Number(row.route_version),
    status: row.status,
    authorSubject: row.author_subject,
    stepCount: Number(row.step_count),
    stepsPassingGate: Number(row.steps_passing),
    version: Number(row.version),
    createdBy: row.created_by,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    archivedBy: row.archived_by,
    archivedAt: row.archived_at ? new Date(row.archived_at).toISOString() : null,
  };
}

/** The route when the member may read its site; outside it answers "not found", as another tenant's route does. */
export async function readRoute(
  client: Client,
  principal: ModulePrincipal,
  access: OrganizationAccess,
  routeId: string,
  lock = false,
): Promise<RouteRow> {
  errors.assertUuid(routeId, 'id');
  const values: unknown[] = [principal.tenantId, routeId];
  const scope = readableSite(access, 'p.site_unit_id', values);
  const row = await client.query<RouteRow>(
    `SELECT ${ROUTE_COLUMNS} FROM ${ROUTE_FROM} WHERE r.tenant_id = $1 AND r.id = $2${scope ? ` AND ${scope}` : ''}${lock ? ' FOR UPDATE OF r' : ''}`,
    values,
  );
  return row.rows[0] ?? errors.notFound('The route');
}

/** Locks a route for a change to it or its content, after checking the member may change it. */
export async function routeForChange(
  client: Client,
  principal: ModulePrincipal,
  access: OrganizationAccess,
  routeId: string,
): Promise<RouteRow> {
  const route = await readRoute(client, principal, access, routeId, true);
  assertSiteWrite(access, route.site_unit_id);
  if (route.project_status !== 'ACTIVE')
    refuse(
      'SPEED_PROJECT_ARCHIVED',
      'The project is archived and its routes can no longer change.',
    );
  if (route.status !== 'DRAFT') refuse('SPEED_ROUTE_NOT_DRAFT', 'Only a draft route changes.');
  return route;
}

/** The route a step belongs to, read within the member's access (before the route is locked). */
export async function routeOfStep(
  client: Client,
  principal: ModulePrincipal,
  access: OrganizationAccess,
  stepId: string,
): Promise<string> {
  errors.assertUuid(stepId, 'id');
  const values: unknown[] = [principal.tenantId, stepId];
  const scope = readableSite(access, 'p.site_unit_id', values);
  const row = await client.query<{ route_id: string }>(
    `SELECT s.route_id FROM ${SCHEMA}.steps s JOIN ${ROUTE_FROM} ON r.tenant_id = s.tenant_id AND r.id = s.route_id
      WHERE s.tenant_id = $1 AND s.id = $2${scope ? ` AND ${scope}` : ''}`,
    values,
  );
  return row.rows[0]?.route_id ?? errors.notFound('The step');
}

/** The step a material belongs to, read within the member's access. */
export async function stepOfMaterial(
  client: Client,
  principal: ModulePrincipal,
  access: OrganizationAccess,
  materialId: string,
): Promise<{ stepId: string; routeId: string }> {
  errors.assertUuid(materialId, 'id');
  const values: unknown[] = [principal.tenantId, materialId];
  const scope = readableSite(access, 'p.site_unit_id', values);
  const row = await client.query<{ step_id: string; route_id: string }>(
    `SELECT m.step_id, s.route_id FROM ${SCHEMA}.step_materials m
       JOIN ${SCHEMA}.steps s ON s.tenant_id = m.tenant_id AND s.id = m.step_id
       JOIN ${ROUTE_FROM} ON r.tenant_id = s.tenant_id AND r.id = s.route_id
      WHERE m.tenant_id = $1 AND m.id = $2${scope ? ` AND ${scope}` : ''}`,
    values,
  );
  const found = row.rows[0] ?? errors.notFound('The material');
  return { stepId: found.step_id, routeId: found.route_id };
}

interface StepRow {
  id: string;
  route_id: string;
  position: number;
  name: string;
  notes: string | null;
  version: number;
}

interface MaterialRow {
  id: string;
  step_id: string;
  position: number;
  substance_id: string;
  substance_name: string;
  formula: string;
  molar_mass_g_per_mol: string;
  role: SpeedMaterialRole;
  coefficient: string | null;
  mass_g: string | null;
  energetic_groups: string[];
  version: number;
}

interface ConditionsRow {
  step_id: string;
  process_temperature_c: string | null;
  maximum_technical_temperature_c: string | null;
  heat_capacity_j_per_g_k: string | null;
  accumulation_percent: string | null;
  reaction_enthalpy_source: SpeedEnthalpySource | null;
  reaction_class_id: string | null;
  version: number;
  updated_by: string;
  updated_at: Date;
}

interface ThermalRow {
  id: string;
  step_id: string;
  kind: SpeedThermalKind;
  reaction_enthalpy_kj_per_mol: string | null;
  onset_c: string | null;
  td24_c: string | null;
  activation_energy_kj_per_mol: string | null;
  heat_release_rate_w_per_kg: string | null;
  reference_temperature_c: string | null;
  basis: 'MEASURED' | 'LITERATURE';
  citation: string;
  notes: string | null;
  status: 'ACTIVE' | 'SUPERSEDED';
  created_by: string;
  created_at: Date;
  superseded_at: Date | null;
}

interface ControlRow {
  step_id: string;
  material_a_id: string;
  material_b_id: string;
  rule_id: string;
  text: string;
  version: number;
  documented_by: string;
  documented_at: Date;
}

interface MitigationRow {
  step_id: string;
  text: string;
  version: number;
  recorded_by: string;
  recorded_at: Date;
  accepted_by: string | null;
  accepted_at: Date | null;
}

export const THERMAL_COLUMNS = `id, step_id, kind, reaction_enthalpy_kj_per_mol, onset_c, td24_c, activation_energy_kj_per_mol,
  heat_release_rate_w_per_kg, reference_temperature_c, basis, citation, notes, status, created_by, created_at, superseded_at`;

export function toThermal(row: ThermalRow): SpeedThermalDataV1 {
  return {
    id: row.id,
    stepId: row.step_id,
    kind: row.kind,
    kJPerMol: number(row.reaction_enthalpy_kj_per_mol),
    onsetC: number(row.onset_c),
    td24C: number(row.td24_c),
    activationEnergyKJPerMol: number(row.activation_energy_kj_per_mol),
    heatReleaseRateWPerKg: number(row.heat_release_rate_w_per_kg),
    referenceTemperatureC: number(row.reference_temperature_c),
    basis: row.basis,
    citation: row.citation,
    notes: row.notes,
    status: row.status,
    createdBy: row.created_by,
    createdAt: new Date(row.created_at).toISOString(),
    supersededAt: row.superseded_at ? new Date(row.superseded_at).toISOString() : null,
  };
}

function toMitigation(row: MitigationRow): SpeedMitigationV1 {
  return {
    text: row.text,
    version: Number(row.version),
    recordedBy: row.recorded_by,
    recordedAt: new Date(row.recorded_at).toISOString(),
    acceptedBy: row.accepted_by,
    acceptedAt: row.accepted_at ? new Date(row.accepted_at).toISOString() : null,
  };
}

const number = (value: string | null): number | null => (value === null ? null : Number(value));

function toMaterial(row: MaterialRow): SpeedStepMaterialV1 {
  return {
    id: row.id,
    stepId: row.step_id,
    position: Number(row.position),
    substanceId: row.substance_id,
    substanceName: row.substance_name,
    formula: row.formula,
    molarMassGPerMol: Number(row.molar_mass_g_per_mol),
    role: row.role,
    coefficient: number(row.coefficient),
    massG: number(row.mass_g),
    energeticGroups: [...row.energetic_groups],
    version: Number(row.version),
  };
}

function toConditions(row: ConditionsRow): SpeedStepConditionsV1 {
  return {
    processTemperatureC: number(row.process_temperature_c),
    maximumTechnicalTemperatureC: number(row.maximum_technical_temperature_c),
    heatCapacityJPerGK: number(row.heat_capacity_j_per_g_k),
    accumulationPercent: number(row.accumulation_percent),
    reactionEnthalpySource: row.reaction_enthalpy_source,
    reactionClassId: row.reaction_class_id,
    version: Number(row.version),
    updatedBy: row.updated_by,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

/** Steps with their materials, conditions and latest result, in order; one step when `stepId` is given. */
export async function readSteps(
  client: Client,
  tenantId: string,
  routeId: string,
  stepId?: string,
): Promise<SpeedStepV1[]> {
  const values: unknown[] = [tenantId, routeId];
  if (stepId) values.push(stepId);
  const only = stepId ? ' AND id = $3' : '';
  const steps = await client.query<StepRow>(
    `SELECT id, route_id, position, name, notes, version FROM ${SCHEMA}.steps WHERE tenant_id = $1 AND route_id = $2${only} ORDER BY position, id`,
    values,
  );
  const ids = steps.rows.map((step) => step.id);
  if (ids.length === 0) return [];
  const materials = await client.query<MaterialRow>(
    `SELECT m.id, m.step_id, m.position, m.substance_id, s.name AS substance_name, s.formula, s.molar_mass_g_per_mol, m.role, m.coefficient,
            m.mass_g, m.energetic_groups, m.version
       FROM ${SCHEMA}.step_materials m JOIN ${SCHEMA}.substances s ON s.tenant_id = m.tenant_id AND s.id = m.substance_id
      WHERE m.tenant_id = $1 AND m.step_id = ANY($2::uuid[]) ORDER BY m.position, m.id`,
    [tenantId, ids],
  );
  const conditions = await client.query<ConditionsRow>(
    `SELECT step_id, process_temperature_c, maximum_technical_temperature_c, heat_capacity_j_per_g_k, accumulation_percent,
            reaction_enthalpy_source, reaction_class_id, version, updated_by, updated_at
       FROM ${SCHEMA}.step_conditions WHERE tenant_id = $1 AND step_id = ANY($2::uuid[])`,
    [tenantId, ids],
  );
  const thermal = await client.query<ThermalRow>(
    `SELECT ${THERMAL_COLUMNS} FROM ${SCHEMA}.thermal_data WHERE tenant_id = $1 AND step_id = ANY($2::uuid[]) AND status = 'ACTIVE'
      ORDER BY kind`,
    [tenantId, ids],
  );
  const mitigations = await client.query<MitigationRow>(
    `SELECT step_id, text, version, recorded_by, recorded_at, accepted_by, accepted_at FROM ${SCHEMA}.mitigations
      WHERE tenant_id = $1 AND step_id = ANY($2::uuid[])`,
    [tenantId, ids],
  );
  const controls = await client.query<ControlRow>(
    `SELECT step_id, material_a_id, material_b_id, rule_id, text, version, documented_by, documented_at FROM ${SCHEMA}.interaction_controls
      WHERE tenant_id = $1 AND step_id = ANY($2::uuid[]) ORDER BY documented_at, material_a_id, material_b_id`,
    [tenantId, ids],
  );
  const results = await latestResults(client, tenantId, ids);
  return steps.rows.map((step) => {
    const found = conditions.rows.find((row) => row.step_id === step.id);
    return {
      id: step.id,
      routeId: step.route_id,
      position: Number(step.position),
      name: step.name,
      notes: step.notes,
      version: Number(step.version),
      materials: materials.rows.filter((row) => row.step_id === step.id).map(toMaterial),
      conditions: found ? toConditions(found) : null,
      thermalData: thermal.rows.filter((row) => row.step_id === step.id).map(toThermal),
      mitigation: (() => {
        const mitigation = mitigations.rows.find((row) => row.step_id === step.id);
        return mitigation ? toMitigation(mitigation) : null;
      })(),
      controls: controls.rows
        .filter((row) => row.step_id === step.id)
        .map((row) => ({
          materialAId: row.material_a_id,
          materialBId: row.material_b_id,
          ruleId: row.rule_id,
          text: row.text,
          version: Number(row.version),
          documentedBy: row.documented_by,
          documentedAt: new Date(row.documented_at).toISOString(),
        })),
      latestResult: results.get(step.id) ?? null,
    };
  });
}

/** One step, which must exist. */
export async function readStep(
  client: Client,
  tenantId: string,
  routeId: string,
  stepId: string,
): Promise<SpeedStepV1> {
  const [step] = await readSteps(client, tenantId, routeId, stepId);
  return step ?? errors.notFound('The step');
}

/** A route with its steps and the roll-up of their latest results (FR-GRN-04). */
export async function readRouteDetail(
  client: Client,
  tenantId: string,
  row: RouteRow,
): Promise<SpeedRouteDetailV1> {
  const steps = await readSteps(client, tenantId, row.id);
  return { ...toRoute(row), steps, rollup: rollupOf(steps.map((step) => step.latestResult)) };
}
