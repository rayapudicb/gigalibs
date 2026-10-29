import { randomUUID } from 'node:crypto';
import {
  type AddSpeedMaterialInputV1,
  type AddSpeedStepInputV1,
  type AddSpeedThermalDataInputV1,
  type DocumentSpeedControlInputV1,
  type MoveSpeedStepInputV1,
  type RemoveSpeedRecordInputV1,
  type ReplaceSpeedConditionsInputV1,
  type ReplaceSpeedMitigationInputV1,
  SPEED_EQUATION_ROLES,
  type SetSpeedEnergeticGroupsInputV1,
  type SpeedMaterialRole,
  type SpeedRouteDetailV1,
  type SpeedStepChangeV1,
  type SpeedStepMaterialV1,
  type SpeedStepV1,
  type UpdateSpeedMaterialInputV1,
  type UpdateSpeedStepInputV1,
} from '@gigalibs/contracts';
import { type ModuleCommandContext, recordMutation } from '@gigalibs/module-sdk';
import { validateConditions } from '@gigalibs/process-safety-engines';
import { Injectable } from '@nestjs/common';
import { type Client, resolveAccess } from '../access.js';
import { type FieldChanges, changes } from '../audit.js';
import { SCHEMA, TOPIC } from '../config.js';
import { CriteriaService } from '../criteria/criteria.service.js';
import { DatabaseService } from '../database.service.js';
import { errors, refuse, unprocessable } from '../errors.js';
import { LibraryService } from '../library/library.service.js';
import {
  readRoute,
  readRouteDetail,
  readStep,
  routeForChange,
  routeOfStep,
  stepOfMaterial,
} from './route-store.js';
import { NO_CRITERIA, NO_LIBRARY, type ScreeningSets, computeStep } from './screening.js';

const STEP_FIELDS: readonly (keyof SpeedStepV1)[] = ['position', 'name', 'notes'];
const MATERIAL_FIELDS: readonly (keyof SpeedStepMaterialV1)[] = [
  'substanceId',
  'role',
  'coefficient',
  'massG',
  'position',
];

/**
 * A route's content (WI-OI-120bx; FR-INP-01 to 06, FR-GATE-01 to 06): steps, the materials of each step and its process
 * conditions. Every change locks the route, needs the row version it read and a reason, writes its audit row and outbox
 * fact, and recomputes the step on the server; the stored result is the record (plan v1.4 §4.3).
 */
@Injectable()
export class StepsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly criteria: CriteriaService,
    private readonly library: LibraryService,
  ) {}

  /** Appends a step; idempotent by request key. */
  addStep(
    context: ModuleCommandContext,
    routeId: string,
    input: AddSpeedStepInputV1,
  ): Promise<SpeedStepChangeV1> {
    const { tenantId, subject } = context.principal;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const access = await resolveAccess(client, context.principal);
      await routeForChange(client, context.principal, access, routeId);
      const replay = await client.query<{ id: string }>(
        `SELECT id FROM ${SCHEMA}.steps WHERE tenant_id = $1 AND route_id = $2 AND request_key = $3`,
        [tenantId, routeId, input.requestKey],
      );
      if (replay.rows[0])
        return { step: await readStep(client, tenantId, routeId, replay.rows[0].id), warnings: [] };
      const id = randomUUID();
      const position = await this.nextPosition(client, 'steps', 'route_id', tenantId, routeId);
      await client.query(
        `INSERT INTO ${SCHEMA}.steps (id, tenant_id, request_key, route_id, position, name, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          id,
          tenantId,
          input.requestKey,
          routeId,
          position,
          input.name,
          input.notes ?? null,
          subject,
        ],
      );
      const step = await this.finish(
        client,
        context,
        routeId,
        id,
        'STEP_ADDED',
        'step',
        id,
        null,
        input.reason,
      );
      return { step, warnings: [] };
    });
  }

  updateStep(
    context: ModuleCommandContext,
    stepId: string,
    input: UpdateSpeedStepInputV1,
  ): Promise<SpeedStepChangeV1> {
    const { tenantId } = context.principal;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const routeId = await this.lockRouteOfStep(client, context, stepId);
      const before = await readStep(client, tenantId, routeId, stepId);
      if (before.version !== input.version) return errors.versionConflict('The step');
      await client.query(
        `UPDATE ${SCHEMA}.steps SET name = coalesce($3, name), notes = CASE WHEN $4 THEN $5 ELSE notes END, version = version + 1, updated_at = now()
          WHERE tenant_id = $1 AND id = $2`,
        [tenantId, stepId, input.name ?? null, input.notes !== undefined, input.notes ?? null],
      );
      const after = await readStep(client, tenantId, routeId, stepId);
      await this.audit(
        client,
        context,
        'STEP_UPDATED',
        'step',
        stepId,
        after.version,
        changes(before, after, STEP_FIELDS),
        input.reason,
      );
      return { step: after, warnings: [] };
    });
  }

  /** Moves a step to `position` (1 is first); the others close up around it. */
  moveStep(
    context: ModuleCommandContext,
    stepId: string,
    input: MoveSpeedStepInputV1,
  ): Promise<SpeedRouteDetailV1> {
    const { tenantId } = context.principal;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const routeId = await this.lockRouteOfStep(client, context, stepId);
      const before = await readStep(client, tenantId, routeId, stepId);
      if (before.version !== input.version) return errors.versionConflict('The step');
      const order = await client.query<{ id: string }>(
        `SELECT id FROM ${SCHEMA}.steps WHERE tenant_id = $1 AND route_id = $2 ORDER BY position, id`,
        [tenantId, routeId],
      );
      const ids = order.rows.map((row) => row.id).filter((id) => id !== stepId);
      const target = Math.min(input.position, ids.length + 1);
      ids.splice(target - 1, 0, stepId);
      await this.renumber(client, tenantId, ids);
      await client.query(
        `UPDATE ${SCHEMA}.steps SET version = version + 1, updated_at = now() WHERE tenant_id = $1 AND id = $2`,
        [tenantId, stepId],
      );
      const after = await readStep(client, tenantId, routeId, stepId);
      await this.audit(
        client,
        context,
        'STEP_MOVED',
        'step',
        stepId,
        after.version,
        changes(before, after, STEP_FIELDS),
        input.reason,
      );
      return this.route(client, context, routeId);
    });
  }

  /** Removes a step of a draft route with its materials and conditions; the audit keeps what it held. */
  removeStep(
    context: ModuleCommandContext,
    stepId: string,
    input: RemoveSpeedRecordInputV1,
  ): Promise<SpeedRouteDetailV1> {
    const { tenantId } = context.principal;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const routeId = await this.lockRouteOfStep(client, context, stepId);
      const before = await readStep(client, tenantId, routeId, stepId);
      if (before.version !== input.version) return errors.versionConflict('The step');
      await client.query(`DELETE FROM ${SCHEMA}.steps WHERE tenant_id = $1 AND id = $2`, [
        tenantId,
        stepId,
      ]);
      const rest = await client.query<{ id: string }>(
        `SELECT id FROM ${SCHEMA}.steps WHERE tenant_id = $1 AND route_id = $2 ORDER BY position, id`,
        [tenantId, routeId],
      );
      await this.renumber(
        client,
        tenantId,
        rest.rows.map((row) => row.id),
      );
      await recordMutation(client, { schema: SCHEMA, topic: TOPIC }, context, {
        action: 'STEP_REMOVED',
        aggregateType: 'step',
        aggregateId: stepId,
        aggregateVersion: before.version + 1,
        payload: {
          removed: {
            position: before.position,
            name: before.name,
            notes: before.notes,
            materials: before.materials,
            conditions: before.conditions,
            thermalData: before.thermalData,
            mitigation: before.mitigation,
            controls: before.controls,
          },
          reason: input.reason,
        },
      });
      return this.route(client, context, routeId);
    });
  }

  /** Adds a material to a step; idempotent by request key. The substance must be active. */
  addMaterial(
    context: ModuleCommandContext,
    stepId: string,
    input: AddSpeedMaterialInputV1,
  ): Promise<SpeedStepChangeV1> {
    const { tenantId, subject } = context.principal;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const routeId = await this.lockRouteOfStep(client, context, stepId);
      const replay = await client.query<{ id: string }>(
        `SELECT id FROM ${SCHEMA}.step_materials WHERE tenant_id = $1 AND step_id = $2 AND request_key = $3`,
        [tenantId, stepId, input.requestKey],
      );
      if (replay.rows[0])
        return { step: await readStep(client, tenantId, routeId, stepId), warnings: [] };
      await this.assertSubstance(client, tenantId, input.substanceId);
      const id = randomUUID();
      const position = await this.nextPosition(
        client,
        'step_materials',
        'step_id',
        tenantId,
        stepId,
      );
      await client.query(
        `INSERT INTO ${SCHEMA}.step_materials (id, tenant_id, request_key, step_id, substance_id, position, role, coefficient, mass_g, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          id,
          tenantId,
          input.requestKey,
          stepId,
          input.substanceId,
          position,
          input.role,
          input.coefficient ?? null,
          input.massG ?? null,
          subject,
        ],
      );
      const step = await this.finish(
        client,
        context,
        routeId,
        stepId,
        'MATERIAL_ADDED',
        'material',
        id,
        null,
        input.reason,
      );
      return { step, warnings: [] };
    });
  }

  updateMaterial(
    context: ModuleCommandContext,
    materialId: string,
    input: UpdateSpeedMaterialInputV1,
  ): Promise<SpeedStepChangeV1> {
    const { tenantId } = context.principal;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const access = await resolveAccess(client, context.principal);
      const { stepId, routeId } = await stepOfMaterial(
        client,
        context.principal,
        access,
        materialId,
      );
      await routeForChange(client, context.principal, access, routeId);
      const before = (await readStep(client, tenantId, routeId, stepId)).materials.find(
        (material) => material.id === materialId,
      );
      if (!before) return errors.notFound('The material');
      if (before.version !== input.version) return errors.versionConflict('The material');
      const merged = {
        role: input.role ?? before.role,
        coefficient: input.coefficient === undefined ? before.coefficient : input.coefficient,
        massG: input.massG === undefined ? before.massG : input.massG,
      };
      assertMaterial(merged.role, merged.coefficient, merged.massG);
      if (input.substanceId && input.substanceId !== before.substanceId)
        await this.assertSubstance(client, tenantId, input.substanceId);
      await client.query(
        `UPDATE ${SCHEMA}.step_materials SET substance_id = coalesce($3, substance_id), role = $4, coefficient = $5, mass_g = $6,
                version = version + 1, updated_at = now()
          WHERE tenant_id = $1 AND id = $2`,
        [
          tenantId,
          materialId,
          input.substanceId ?? null,
          merged.role,
          merged.coefficient,
          merged.massG,
        ],
      );
      return {
        step: await this.finish(
          client,
          context,
          routeId,
          stepId,
          'MATERIAL_UPDATED',
          'material',
          materialId,
          before,
          input.reason,
        ),
        warnings: [],
      };
    });
  }

  removeMaterial(
    context: ModuleCommandContext,
    materialId: string,
    input: RemoveSpeedRecordInputV1,
  ): Promise<SpeedStepChangeV1> {
    const { tenantId, subject } = context.principal;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const access = await resolveAccess(client, context.principal);
      const { stepId, routeId } = await stepOfMaterial(
        client,
        context.principal,
        access,
        materialId,
      );
      await routeForChange(client, context.principal, access, routeId);
      const before = (await readStep(client, tenantId, routeId, stepId)).materials.find(
        (material) => material.id === materialId,
      );
      if (!before) return errors.notFound('The material');
      if (before.version !== input.version) return errors.versionConflict('The material');
      await client.query(`DELETE FROM ${SCHEMA}.step_materials WHERE tenant_id = $1 AND id = $2`, [
        tenantId,
        materialId,
      ]);
      await recordMutation(client, { schema: SCHEMA, topic: TOPIC }, context, {
        action: 'MATERIAL_REMOVED',
        aggregateType: 'material',
        aggregateId: materialId,
        aggregateVersion: before.version + 1,
        payload: { removed: before, reason: input.reason },
      });
      await computeStep(client, context, routeId, stepId, await this.sets(client, tenantId));
      return { step: await readStep(client, tenantId, routeId, stepId), warnings: [] };
    });
  }

  /**
   * Replaces a step's process conditions. The ranges come from the criteria in force (BRD §15.1): outside the blocking
   * range the change is refused, outside the usual range it is saved with a warning. Without criteria in force nothing
   * can be checked, so nothing is saved.
   */
  replaceConditions(
    context: ModuleCommandContext,
    stepId: string,
    input: ReplaceSpeedConditionsInputV1,
  ): Promise<SpeedStepChangeV1> {
    const { tenantId, subject } = context.principal;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const routeId = await this.lockRouteOfStep(client, context, stepId);
      const before = await readStep(client, tenantId, routeId, stepId);
      if ((before.conditions?.version ?? 0) !== input.version)
        return errors.versionConflict('The step conditions');
      const criteria = await this.criteria.inForce(client, tenantId);
      if (!criteria)
        refuse(
          NO_CRITERIA.code,
          'No screening criteria are in force in this workspace, so the conditions cannot be checked.',
        );
      const check = validateConditions(
        {
          processTemperatureC: input.processTemperatureC,
          maximumTechnicalTemperatureC: input.maximumTechnicalTemperatureC,
          heatCapacityJPerGK: input.heatCapacityJPerGK,
          accumulationPercent: input.accumulationPercent,
          reactionEnthalpy: null,
          decomposition: null,
          td24EnteredC: null,
          dscOnsetC: null,
        },
        criteria.criteria,
      );
      if (check.errors.length > 0)
        unprocessable(
          'SPEED_CONDITIONS_OUT_OF_RANGE',
          'A condition is outside the range the criteria allow.',
          check.errors,
        );
      const library = await this.library.inForce(client, tenantId);
      if (
        input.reactionClassId &&
        library &&
        !library.library.reactionClasses.some((entry) => entry.id === input.reactionClassId)
      )
        unprocessable(
          'SPEED_REACTION_CLASS_UNKNOWN',
          'The reaction class is not in the library in force.',
          [
            {
              path: 'reactionClassId',
              code: 'THM_REACTION_CLASS_UNKNOWN',
              params: { reactionClassId: input.reactionClassId },
            },
          ],
        );
      await client.query(
        `INSERT INTO ${SCHEMA}.step_conditions (tenant_id, step_id, process_temperature_c, maximum_technical_temperature_c, heat_capacity_j_per_g_k,
           accumulation_percent, reaction_enthalpy_source, reaction_class_id, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (tenant_id, step_id) DO UPDATE
           SET process_temperature_c = EXCLUDED.process_temperature_c,
               maximum_technical_temperature_c = EXCLUDED.maximum_technical_temperature_c,
               heat_capacity_j_per_g_k = EXCLUDED.heat_capacity_j_per_g_k,
               accumulation_percent = EXCLUDED.accumulation_percent,
               reaction_enthalpy_source = EXCLUDED.reaction_enthalpy_source,
               reaction_class_id = EXCLUDED.reaction_class_id,
               updated_by = EXCLUDED.updated_by, updated_at = now(), version = ${SCHEMA}.step_conditions.version + 1`,
        [
          tenantId,
          stepId,
          input.processTemperatureC,
          input.maximumTechnicalTemperatureC,
          input.heatCapacityJPerGK,
          input.accumulationPercent,
          input.reactionEnthalpySource,
          input.reactionClassId,
          subject,
        ],
      );
      // The conditions feed the thermal results (FR-THM-01 to 12): the step is recomputed with them.
      await computeStep(client, context, routeId, stepId, { criteria, library });
      const after = await readStep(client, tenantId, routeId, stepId);
      const conditionChanges = changes(
        before.conditions ?? emptyConditions,
        after.conditions ?? emptyConditions,
        CONDITION_FIELDS,
      );
      await this.audit(
        client,
        context,
        'CONDITIONS_REPLACED',
        'step-conditions',
        stepId,
        after.conditions?.version ?? 1,
        conditionChanges,
        input.reason,
      );
      return { step: after, warnings: check.warnings };
    });
  }

  /**
   * Adds a cited thermal value to a step's mixture (FR-THM-01 to 07, BRL-06); it supersedes the active value of its kind,
   * which stays in the record. Idempotent by request key. The step is recomputed.
   */
  addThermalData(
    context: ModuleCommandContext,
    stepId: string,
    input: AddSpeedThermalDataInputV1,
  ): Promise<SpeedStepChangeV1> {
    const { tenantId, subject } = context.principal;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const routeId = await this.lockRouteOfStep(client, context, stepId);
      const replay = await client.query<{ id: string }>(
        `SELECT id FROM ${SCHEMA}.thermal_data WHERE tenant_id = $1 AND step_id = $2 AND request_key = $3`,
        [tenantId, stepId, input.requestKey],
      );
      if (replay.rows[0])
        return { step: await readStep(client, tenantId, routeId, stepId), warnings: [] };
      const replaced = await client.query<{ id: string }>(
        `UPDATE ${SCHEMA}.thermal_data SET status = 'SUPERSEDED', superseded_by = $4, superseded_at = now()
          WHERE tenant_id = $1 AND step_id = $2 AND kind = $3 AND status = 'ACTIVE'
          RETURNING id`,
        [tenantId, stepId, input.kind, subject],
      );
      const id = randomUUID();
      await client.query(
        `INSERT INTO ${SCHEMA}.thermal_data (id, tenant_id, request_key, step_id, kind, reaction_enthalpy_kj_per_mol, onset_c, td24_c,
           activation_energy_kj_per_mol, heat_release_rate_w_per_kg, reference_temperature_c, basis, citation, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          id,
          tenantId,
          input.requestKey,
          stepId,
          input.kind,
          input.kind === 'REACTION_ENTHALPY' ? input.kJPerMol : null,
          input.kind === 'DSC_ONSET' ? input.onsetC : null,
          input.kind === 'TD24' ? input.td24C : null,
          input.kind === 'DECOMPOSITION_KINETICS' ? input.activationEnergyKJPerMol : null,
          input.kind === 'DECOMPOSITION_KINETICS' ? input.heatReleaseRateWPerKg : null,
          input.kind === 'DECOMPOSITION_KINETICS' ? input.referenceTemperatureC : null,
          input.basis,
          input.citation,
          input.notes ?? null,
          subject,
        ],
      );
      await recordMutation(client, { schema: SCHEMA, topic: TOPIC }, context, {
        action: 'THERMAL_DATA_ADDED',
        aggregateType: 'thermal-data',
        aggregateId: id,
        aggregateVersion: 1,
        payload: {
          stepId,
          kind: input.kind,
          basis: input.basis,
          citation: input.citation,
          superseded: replaced.rows[0]?.id ?? null,
          reason: input.reason,
        },
      });
      await computeStep(client, context, routeId, stepId, await this.sets(client, tenantId));
      return { step: await readStep(client, tenantId, routeId, stepId), warnings: [] };
    });
  }

  /** Tags a material's energetic groups (FR-OB-04), ids from the library in force. The step is recomputed. */
  setEnergeticGroups(
    context: ModuleCommandContext,
    materialId: string,
    input: SetSpeedEnergeticGroupsInputV1,
  ): Promise<SpeedStepChangeV1> {
    const { tenantId } = context.principal;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const access = await resolveAccess(client, context.principal);
      const { stepId, routeId } = await stepOfMaterial(
        client,
        context.principal,
        access,
        materialId,
      );
      await routeForChange(client, context.principal, access, routeId);
      const before = (await readStep(client, tenantId, routeId, stepId)).materials.find(
        (material) => material.id === materialId,
      );
      if (!before) return errors.notFound('The material');
      if (before.version !== input.version) return errors.versionConflict('The material');
      const library = await this.library.inForce(client, tenantId);
      if (!library)
        refuse(
          NO_LIBRARY.code,
          'No screening library is in force in this workspace, so energetic groups cannot be checked.',
        );
      const groups = [...new Set(input.groups)].sort();
      const unknown = groups.filter((group) => !library.energeticGroups.has(group));
      if (unknown.length > 0)
        unprocessable(
          'SPEED_ENERGETIC_GROUP_UNKNOWN',
          'An energetic group is not in the library in force.',
          unknown.map((group) => ({
            path: 'groups',
            code: 'SPEED_ENERGETIC_GROUP_UNKNOWN',
            params: { group },
          })),
        );
      await client.query(
        `UPDATE ${SCHEMA}.step_materials SET energetic_groups = $3::varchar[], version = version + 1, updated_at = now() WHERE tenant_id = $1 AND id = $2`,
        [tenantId, materialId, groups],
      );
      return {
        step: await this.finish(
          client,
          context,
          routeId,
          stepId,
          'ENERGETIC_GROUPS_SET',
          'material',
          materialId,
          before,
          input.reason,
        ),
        warnings: [],
      };
    });
  }

  /**
   * Documents the control of an interaction finding (BRL-04): the pair must have a finding in the step's latest result,
   * whose rule the control is recorded against. Changing it needs the version read and a reason.
   */
  documentControl(
    context: ModuleCommandContext,
    stepId: string,
    input: DocumentSpeedControlInputV1,
  ): Promise<SpeedStepChangeV1> {
    const { tenantId, subject } = context.principal;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const routeId = await this.lockRouteOfStep(client, context, stepId);
      const before = await readStep(client, tenantId, routeId, stepId);
      const interactions = before.latestResult?.outputs['interactions'] as
        | {
            status?: string;
            findings?: readonly { materialAId: string; materialBId: string; ruleId: string }[];
          }
        | undefined;
      const finding = interactions?.findings?.find(
        (candidate) =>
          (candidate.materialAId === input.materialAId &&
            candidate.materialBId === input.materialBId) ||
          (candidate.materialAId === input.materialBId &&
            candidate.materialBId === input.materialAId),
      );
      if (!finding)
        unprocessable(
          'SPEED_FINDING_UNKNOWN',
          'The step has no interaction finding for these two materials.',
          [{ path: 'materialBId', code: 'SPEED_FINDING_UNKNOWN' }],
        );
      const existing = before.controls.find(
        (control) =>
          control.materialAId === finding.materialAId &&
          control.materialBId === finding.materialBId,
      );
      if ((existing?.version ?? 0) !== input.version) return errors.versionConflict('The control');
      await client.query(
        `INSERT INTO ${SCHEMA}.interaction_controls (tenant_id, step_id, material_a_id, material_b_id, rule_id, text, documented_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (tenant_id, step_id, material_a_id, material_b_id) DO UPDATE
           SET rule_id = EXCLUDED.rule_id, text = EXCLUDED.text, documented_by = EXCLUDED.documented_by, documented_at = now(),
               version = ${SCHEMA}.interaction_controls.version + 1`,
        [
          tenantId,
          stepId,
          finding.materialAId,
          finding.materialBId,
          finding.ruleId,
          input.text,
          subject,
        ],
      );
      const after = await readStep(client, tenantId, routeId, stepId);
      const control = after.controls.find(
        (candidate) =>
          candidate.materialAId === finding.materialAId &&
          candidate.materialBId === finding.materialBId,
      );
      await recordMutation(client, { schema: SCHEMA, topic: TOPIC }, context, {
        action: 'CONTROL_DOCUMENTED',
        aggregateType: 'interaction-control',
        aggregateId: stepId,
        aggregateVersion: control?.version ?? 1,
        payload: {
          materialAId: finding.materialAId,
          materialBId: finding.materialBId,
          ruleId: finding.ruleId,
          changes: { text: { from: existing?.text ?? null, to: control?.text ?? null } },
          reason: input.reason,
        },
      });
      return { step: after, warnings: [] };
    });
  }

  /** Records the mitigation of a class 4 or 5 step (BRL-03); acceptance by the safety reviewer is R2. */
  replaceMitigation(
    context: ModuleCommandContext,
    stepId: string,
    input: ReplaceSpeedMitigationInputV1,
  ): Promise<SpeedStepChangeV1> {
    const { tenantId, subject } = context.principal;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const routeId = await this.lockRouteOfStep(client, context, stepId);
      const before = await readStep(client, tenantId, routeId, stepId);
      if ((before.mitigation?.version ?? 0) !== input.version)
        return errors.versionConflict('The mitigation');
      await client.query(
        `INSERT INTO ${SCHEMA}.mitigations (tenant_id, step_id, text, recorded_by) VALUES ($1, $2, $3, $4)
         ON CONFLICT (tenant_id, step_id) DO UPDATE
           SET text = EXCLUDED.text, recorded_by = EXCLUDED.recorded_by, recorded_at = now(), accepted_by = NULL, accepted_at = NULL,
               version = ${SCHEMA}.mitigations.version + 1`,
        [tenantId, stepId, input.text, subject],
      );
      const after = await readStep(client, tenantId, routeId, stepId);
      await this.audit(
        client,
        context,
        'MITIGATION_RECORDED',
        'mitigation',
        stepId,
        after.mitigation?.version ?? 1,
        { text: { from: before.mitigation?.text ?? null, to: after.mitigation?.text ?? null } },
        input.reason,
      );
      return { step: after, warnings: [] };
    });
  }

  private async lockRouteOfStep(
    client: Client,
    context: ModuleCommandContext,
    stepId: string,
  ): Promise<string> {
    const access = await resolveAccess(client, context.principal);
    const routeId = await routeOfStep(client, context.principal, access, stepId);
    await routeForChange(client, context.principal, access, routeId);
    return routeId;
  }

  /** The next position under a parent; the route lock serializes concurrent appends. */
  private async nextPosition(
    client: Client,
    table: 'steps' | 'step_materials',
    parent: 'route_id' | 'step_id',
    tenantId: string,
    parentId: string,
  ): Promise<number> {
    const row = await client.query<{ next: number }>(
      `SELECT coalesce(max(position), 0) + 1 AS next FROM ${SCHEMA}.${table} WHERE tenant_id = $1 AND ${parent} = $2`,
      [tenantId, parentId],
    );
    return Number(row.rows[0]?.next ?? 1);
  }

  private async assertSubstance(
    client: Client,
    tenantId: string,
    substanceId: string,
  ): Promise<void> {
    const found = await client.query<{ status: string }>(
      `SELECT status FROM ${SCHEMA}.substances WHERE tenant_id = $1 AND id = $2`,
      [tenantId, substanceId],
    );
    const row = found.rows[0] ?? errors.notFound('The substance');
    if (row.status !== 'ACTIVE')
      refuse('SPEED_SUBSTANCE_ARCHIVED', 'The substance is archived; choose an active one.');
  }

  /** Positions 1, 2, 3 … in the given order (the unique position constraint is checked at commit). */
  private async renumber(client: Client, tenantId: string, ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    await client.query(
      `UPDATE ${SCHEMA}.steps s SET position = ordered.position
         FROM unnest($2::uuid[]) WITH ORDINALITY AS ordered(id, position)
        WHERE s.tenant_id = $1 AND s.id = ordered.id AND s.position <> ordered.position`,
      [tenantId, [...ids]],
    );
  }

  /** Audits a change to a material or step, recomputes the step, and answers it as stored. */
  private async finish(
    client: Client,
    context: ModuleCommandContext,
    routeId: string,
    stepId: string,
    action: string,
    aggregateType: 'step' | 'material',
    aggregateId: string,
    before: SpeedStepMaterialV1 | null,
    reason: string,
  ): Promise<SpeedStepV1> {
    const { tenantId } = context.principal;
    await computeStep(client, context, routeId, stepId, await this.sets(client, tenantId));
    const step = await readStep(client, tenantId, routeId, stepId);
    if (aggregateType === 'step') {
      await this.audit(
        client,
        context,
        action,
        'step',
        aggregateId,
        step.version,
        changes(null, step, STEP_FIELDS),
        reason,
      );
    } else {
      const after = step.materials.find((material) => material.id === aggregateId);
      if (!after) return errors.notFound('The material');
      await this.audit(
        client,
        context,
        action,
        'material',
        aggregateId,
        after.version,
        changes(before, after, MATERIAL_FIELDS),
        reason,
      );
    }
    return step;
  }

  private async audit(
    client: Client,
    context: ModuleCommandContext,
    action: string,
    aggregateType: string,
    aggregateId: string,
    aggregateVersion: number,
    fieldChanges: FieldChanges,
    reason: string,
  ): Promise<void> {
    await recordMutation(client, { schema: SCHEMA, topic: TOPIC }, context, {
      action,
      aggregateType,
      aggregateId,
      aggregateVersion,
      payload: { changes: fieldChanges, reason },
    });
  }

  private async route(
    client: Client,
    context: ModuleCommandContext,
    routeId: string,
  ): Promise<SpeedRouteDetailV1> {
    const access = await resolveAccess(client, context.principal);
    const row = await readRoute(client, context.principal, access, routeId);
    return readRouteDetail(client, context.principal.tenantId, row);
  }

  /** The criteria and library sets in force. */
  private async sets(client: Client, tenantId: string): Promise<ScreeningSets> {
    return {
      criteria: await this.criteria.inForce(client, tenantId),
      library: await this.library.inForce(client, tenantId),
    };
  }
}

const CONDITION_FIELDS = [
  'processTemperatureC',
  'maximumTechnicalTemperatureC',
  'heatCapacityJPerGK',
  'accumulationPercent',
  'reactionEnthalpySource',
  'reactionClassId',
] as const;
const emptyConditions = {
  processTemperatureC: null,
  maximumTechnicalTemperatureC: null,
  heatCapacityJPerGK: null,
  accumulationPercent: null,
  reactionEnthalpySource: null,
  reactionClassId: null,
};

/** A coefficient belongs to the equation's roles; a by-product has no charge (FR-INP-02). */
function assertMaterial(
  role: SpeedMaterialRole,
  coefficient: number | null,
  massG: number | null,
): void {
  const issues: { path: string; code: string }[] = [];
  if (coefficient !== null && !SPEED_EQUATION_ROLES.includes(role))
    issues.push({ path: 'coefficient', code: 'SPEED_COEFFICIENT_NOT_FOR_ROLE' });
  if (massG !== null && role === 'By-product')
    issues.push({ path: 'massG', code: 'SPEED_BY_PRODUCT_NO_CHARGE' });
  if (issues.length > 0)
    unprocessable('SPEED_MATERIAL_INVALID', 'The material does not fit its role.', issues);
}
