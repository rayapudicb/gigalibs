import { randomUUID } from 'node:crypto';
import type {
  ImportSpeedCriteriaSetInputV1,
  PutSpeedCriteriaSetInForceInputV1,
  SpeedCriteriaSetV1,
  SpeedCriteriaValuesV1,
  SpeedReviewStatus,
} from '@gigalibs/contracts';
import {
  type ModuleCommandContext,
  type ModulePrincipal,
  recordMutation,
} from '@gigalibs/module-sdk';
import { type ScreeningCriteria, missingCriteria } from '@gigalibs/process-safety-engines';
import { Injectable } from '@nestjs/common';
import type { Client } from '../access.js';
import { SCHEMA, TOPIC } from '../config.js';
import { DatabaseService } from '../database.service.js';
import { errors, unprocessable } from '../errors.js';

const COLUMNS = `id, version_label, source, criteria, citations, review_status, in_force, version, imported_by, imported_at,
  in_force_by, in_force_since`;

interface CriteriaRow {
  id: string;
  version_label: string;
  source: string;
  criteria: SpeedCriteriaValuesV1;
  citations: Record<string, string>;
  review_status: SpeedReviewStatus;
  in_force: boolean;
  version: number;
  imported_by: string;
  imported_at: Date;
  in_force_by: string | null;
  in_force_since: Date | null;
}

function toSet(row: CriteriaRow): SpeedCriteriaSetV1 {
  return {
    id: row.id,
    versionLabel: row.version_label,
    source: row.source,
    criteria: row.criteria,
    citations: row.citations,
    reviewStatus: row.review_status,
    inForce: row.in_force,
    version: Number(row.version),
    importedBy: row.imported_by,
    importedAt: new Date(row.imported_at).toISOString(),
    inForceBy: row.in_force_by,
    inForceSince: row.in_force_since ? new Date(row.in_force_since).toISOString() : null,
  };
}

/**
 * Every value path the engines need (`inputRanges.temperatureC.min` …), from the engine package itself; the set's
 * version is its label, not a value, so it needs no citation.
 */
export const CRITERIA_VALUE_PATHS: readonly string[] = missingCriteria({}).filter(
  (path) => path !== 'version',
);

/** The set in force, as the engines read it, with what a result records about it. */
export interface CriteriaInForce {
  readonly id: string;
  readonly versionLabel: string;
  readonly reviewed: boolean;
  readonly criteria: ScreeningCriteria;
}

/**
 * SPEED screening criteria sets (WI-OI-120bx; plan v1.4 §4.2, §4.5). An administrator imports a cited set: every value
 * the engines need, each with its citation, nothing else. It is unreviewed until the process safety specialist
 * approves it (R2). One set is in force per workspace; putting another in force is audited with a reason. Values never
 * change after import (a trigger refuses it).
 */
@Injectable()
export class CriteriaService {
  constructor(private readonly database: DatabaseService) {}

  list(principal: ModulePrincipal): Promise<{ items: SpeedCriteriaSetV1[] }> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const rows = await client.query<CriteriaRow>(
        `SELECT ${COLUMNS} FROM ${SCHEMA}.criteria_sets WHERE tenant_id = $1 ORDER BY in_force DESC, imported_at DESC, id`,
        [principal.tenantId],
      );
      return { items: rows.rows.map(toSet) };
    });
  }

  get(principal: ModulePrincipal, id: string): Promise<SpeedCriteriaSetV1> {
    errors.assertUuid(id, 'id');
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const row = await client.query<CriteriaRow>(
        `SELECT ${COLUMNS} FROM ${SCHEMA}.criteria_sets WHERE tenant_id = $1 AND id = $2`,
        [principal.tenantId, id],
      );
      return toSet(row.rows[0] ?? errors.notFound('The criteria set'));
    });
  }

  /** Idempotent by request key. Every value must carry a citation, and every citation must name a value. */
  async import(
    context: ModuleCommandContext,
    input: ImportSpeedCriteriaSetInputV1,
  ): Promise<{ set: SpeedCriteriaSetV1; replayed: boolean }> {
    const { tenantId, subject } = context.principal;
    const engineCriteria = { version: input.versionLabel, ...input.criteria };
    const missing = missingCriteria(engineCriteria);
    if (missing.length > 0)
      unprocessable(
        'SPEED_CRITERIA_INCOMPLETE',
        'The criteria set has no value for some paths.',
        missing,
      );
    const uncited = CRITERIA_VALUE_PATHS.filter((path) => !input.citations[path]);
    const unknown = Object.keys(input.citations).filter(
      (path) => !CRITERIA_VALUE_PATHS.includes(path),
    );
    if (uncited.length > 0)
      unprocessable('SPEED_CRITERIA_UNCITED', 'Every criteria value needs a citation.', uncited);
    if (unknown.length > 0)
      unprocessable(
        'SPEED_CRITERIA_CITATION_UNKNOWN',
        'A citation names no criteria value.',
        unknown,
      );
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const replay = await client.query<CriteriaRow>(
        `SELECT ${COLUMNS} FROM ${SCHEMA}.criteria_sets WHERE tenant_id = $1 AND request_key = $2`,
        [tenantId, input.requestKey],
      );
      if (replay.rows[0]) return { set: toSet(replay.rows[0]), replayed: true };
      let row: CriteriaRow | undefined;
      try {
        const inserted = await client.query<CriteriaRow>(
          `INSERT INTO ${SCHEMA}.criteria_sets (id, tenant_id, request_key, version_label, source, criteria, citations, imported_by)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8)
           RETURNING ${COLUMNS}`,
          [
            randomUUID(),
            tenantId,
            input.requestKey,
            input.versionLabel,
            input.source,
            JSON.stringify(input.criteria),
            JSON.stringify(input.citations),
            subject,
          ],
        );
        row = inserted.rows[0];
      } catch (error) {
        errors.translateConstraint(error, {
          unique: 'A criteria set with this version label already exists.',
        });
      }
      if (!row) throw new Error('The criteria set insert returned no row.');
      const set = toSet(row);
      await recordMutation(client, { schema: SCHEMA, topic: TOPIC }, context, {
        action: 'CRITERIA_SET_IMPORTED',
        aggregateType: 'criteria-set',
        aggregateId: set.id,
        aggregateVersion: set.version,
        payload: {
          versionLabel: set.versionLabel,
          source: set.source,
          reviewStatus: set.reviewStatus,
          reason: null,
        },
      });
      return { set, replayed: false };
    });
  }

  /** Puts the set in force in place of the one before it. */
  putInForce(
    context: ModuleCommandContext,
    id: string,
    input: PutSpeedCriteriaSetInForceInputV1,
  ): Promise<SpeedCriteriaSetV1> {
    errors.assertUuid(id, 'id');
    const { tenantId, subject } = context.principal;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const current = await client.query<CriteriaRow>(
        `SELECT ${COLUMNS} FROM ${SCHEMA}.criteria_sets WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
        [tenantId, id],
      );
      const before = current.rows[0] ? toSet(current.rows[0]) : errors.notFound('The criteria set');
      if (before.version !== input.version) return errors.versionConflict('The criteria set');
      if (before.inForce) return before;
      const previous = await client.query<{ id: string; version_label: string; version: number }>(
        `UPDATE ${SCHEMA}.criteria_sets SET in_force = false, in_force_by = NULL, in_force_since = NULL, version = version + 1, updated_at = now()
          WHERE tenant_id = $1 AND in_force
          RETURNING id, version_label, version`,
        [tenantId],
      );
      const updated = await client.query<CriteriaRow>(
        `UPDATE ${SCHEMA}.criteria_sets SET in_force = true, in_force_by = $3, in_force_since = now(), version = version + 1, updated_at = now()
          WHERE tenant_id = $1 AND id = $2
          RETURNING ${COLUMNS}`,
        [tenantId, id, subject],
      );
      const set = toSet(updated.rows[0] as CriteriaRow);
      const replaced = previous.rows[0];
      await recordMutation(client, { schema: SCHEMA, topic: TOPIC }, context, {
        action: 'CRITERIA_SET_PUT_IN_FORCE',
        aggregateType: 'criteria-set',
        aggregateId: set.id,
        aggregateVersion: set.version,
        payload: {
          changes: { inForce: { from: false, to: true } },
          replaced: replaced ? { id: replaced.id, versionLabel: replaced.version_label } : null,
          reason: input.reason,
        },
      });
      return set;
    });
  }

  /** A set by id in the caller's transaction (the set a stored result used), or null. */
  async byId(client: Client, tenantId: string, id: string): Promise<SpeedCriteriaSetV1 | null> {
    const row = await client.query<CriteriaRow>(
      `SELECT ${COLUMNS} FROM ${SCHEMA}.criteria_sets WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id],
    );
    return row.rows[0] ? toSet(row.rows[0]) : null;
  }

  /** The set in force in the caller's transaction, or null when the workspace has none. */
  async inForce(client: Client, tenantId: string): Promise<CriteriaInForce | null> {
    const row = await client.query<CriteriaRow>(
      `SELECT ${COLUMNS} FROM ${SCHEMA}.criteria_sets WHERE tenant_id = $1 AND in_force`,
      [tenantId],
    );
    const found = row.rows[0];
    if (!found) return null;
    return {
      id: found.id,
      versionLabel: found.version_label,
      reviewed: found.review_status === 'APPROVED',
      criteria: { version: found.version_label, ...found.criteria },
    };
  }
}
