import { randomUUID } from 'node:crypto';
import type {
  ImportSpeedLibrarySetInputV1,
  PutSpeedLibrarySetInForceInputV1,
  SpeedLibraryPackV1,
  SpeedLibrarySetV1,
  SpeedReviewStatus,
  SpeedStoredLibraryV1,
} from '@gigalibs/contracts';
import {
  type ModuleCommandContext,
  type ModulePrincipal,
  recordMutation,
} from '@gigalibs/module-sdk';
import type { ScreeningLibrary } from '@gigalibs/process-safety-engines';
import { Injectable } from '@nestjs/common';
import type { Client } from '../access.js';
import { SCHEMA, TOPIC } from '../config.js';
import { DatabaseService } from '../database.service.js';
import { errors } from '../errors.js';

const COLUMNS = `id, version_label, source, library, review_status, in_force, version, imported_by, imported_at, in_force_by,
  in_force_since`;

interface LibraryRow {
  id: string;
  version_label: string;
  source: string;
  library: SpeedLibraryPackV1;
  review_status: SpeedReviewStatus;
  in_force: boolean;
  version: number;
  imported_by: string;
  imported_at: Date;
  in_force_by: string | null;
  in_force_since: Date | null;
}

/** A set's entries are reviewed when the set is: its content never changes, so review is a property of the set. */
function stored(pack: SpeedLibraryPackV1, reviewed: boolean): SpeedStoredLibraryV1 {
  const mark = <T extends object>(entry: T) => ({ ...entry, reviewed });
  const record = <T extends object>(entries: Readonly<Record<string, T>>) =>
    Object.fromEntries(Object.entries(entries).map(([key, entry]) => [key, mark(entry)]));
  return {
    materials: pack.materials.map(mark),
    rules: pack.rules.map(mark),
    reactionClasses: pack.reactionClasses.map(mark),
    formationEnthalpies: record(pack.formationEnthalpies),
    gases: record(pack.gases),
    energeticGroups: pack.energeticGroups.map(mark),
  };
}

function toSet(row: LibraryRow): SpeedLibrarySetV1 {
  return {
    id: row.id,
    versionLabel: row.version_label,
    source: row.source,
    library: stored(row.library, row.review_status === 'APPROVED'),
    reviewStatus: row.review_status,
    inForce: row.in_force,
    version: Number(row.version),
    importedBy: row.imported_by,
    importedAt: new Date(row.imported_at).toISOString(),
    inForceBy: row.in_force_by,
    inForceSince: row.in_force_since ? new Date(row.in_force_since).toISOString() : null,
  };
}

/** The set in force, as the engines read it, with what a result records about it. */
export interface LibraryInForce {
  readonly id: string;
  readonly versionLabel: string;
  readonly reviewed: boolean;
  readonly library: ScreeningLibrary;
  /** Energetic-group ids a material may be tagged with (FR-OB-04). */
  readonly energeticGroups: ReadonlySet<string>;
}

/** The engines' view of a stored pack: the reference data they compute with, each entry carrying `reviewed`. */
export function engineLibrary(
  versionLabel: string,
  pack: SpeedLibraryPackV1,
  reviewed: boolean,
): ScreeningLibrary {
  const entries = stored(pack, reviewed);
  return {
    version: versionLabel,
    materials: entries.materials.map((entry) => ({
      id: entry.id,
      classes: entry.classes,
      citation: entry.citation,
      reviewed: entry.reviewed,
    })),
    rules: entries.rules.map((entry) => ({
      id: entry.id,
      classA: entry.classA,
      classB: entry.classB,
      severity: entry.severity,
      citation: entry.citation,
      reviewed: entry.reviewed,
      ...(entry.recommendedTest ? { recommendedTest: entry.recommendedTest } : {}),
    })),
    reactionClasses: entries.reactionClasses.map((entry) => ({
      id: entry.id,
      typicalReactionEnthalpyKJPerMol: entry.typicalReactionEnthalpyKJPerMol,
      citation: entry.citation,
      reviewed: entry.reviewed,
    })),
    formationEnthalpies: Object.fromEntries(
      Object.entries(entries.formationEnthalpies).map(([hill, entry]) => [
        hill,
        {
          kJPerMol: entry.kJPerMol,
          phase: entry.phase,
          citation: entry.citation,
          reviewed: entry.reviewed,
        },
      ]),
    ),
    gases: Object.fromEntries(
      Object.entries(entries.gases).map(([hill, entry]) => [
        hill,
        { id: entry.id, citation: entry.citation, reviewed: entry.reviewed },
      ]),
    ),
  };
}

/**
 * SPEED screening library sets (WI-OI-120by; plan v1.4 §4.2, §4.5): an administrator imports a cited pack, which stays
 * unreviewed until the process safety specialist approves it (R2); one set is in force per workspace and putting
 * another in force is audited with a reason. A set's content never changes (a trigger refuses it).
 */
@Injectable()
export class LibraryService {
  constructor(private readonly database: DatabaseService) {}

  list(principal: ModulePrincipal): Promise<{ items: SpeedLibrarySetV1[] }> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const rows = await client.query<LibraryRow>(
        `SELECT ${COLUMNS} FROM ${SCHEMA}.library_sets WHERE tenant_id = $1 ORDER BY in_force DESC, imported_at DESC, id`,
        [principal.tenantId],
      );
      return { items: rows.rows.map(toSet) };
    });
  }

  get(principal: ModulePrincipal, id: string): Promise<SpeedLibrarySetV1> {
    errors.assertUuid(id, 'id');
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const row = await client.query<LibraryRow>(
        `SELECT ${COLUMNS} FROM ${SCHEMA}.library_sets WHERE tenant_id = $1 AND id = $2`,
        [principal.tenantId, id],
      );
      return toSet(row.rows[0] ?? errors.notFound('The library set'));
    });
  }

  /** Idempotent by request key. The contract has already checked that every entry is cited. */
  async import(
    context: ModuleCommandContext,
    input: ImportSpeedLibrarySetInputV1,
  ): Promise<{ set: SpeedLibrarySetV1; replayed: boolean }> {
    const { tenantId, subject } = context.principal;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const replay = await client.query<LibraryRow>(
        `SELECT ${COLUMNS} FROM ${SCHEMA}.library_sets WHERE tenant_id = $1 AND request_key = $2`,
        [tenantId, input.requestKey],
      );
      if (replay.rows[0]) return { set: toSet(replay.rows[0]), replayed: true };
      let row: LibraryRow | undefined;
      try {
        const inserted = await client.query<LibraryRow>(
          `INSERT INTO ${SCHEMA}.library_sets (id, tenant_id, request_key, version_label, source, library, imported_by)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
           RETURNING ${COLUMNS}`,
          [
            randomUUID(),
            tenantId,
            input.requestKey,
            input.versionLabel,
            input.source,
            JSON.stringify(input.library),
            subject,
          ],
        );
        row = inserted.rows[0];
      } catch (error) {
        errors.translateConstraint(error, {
          unique: 'A library set with this version label already exists.',
        });
      }
      if (!row) throw new Error('The library set insert returned no row.');
      const set = toSet(row);
      const pack = input.library;
      await recordMutation(client, { schema: SCHEMA, topic: TOPIC }, context, {
        action: 'LIBRARY_SET_IMPORTED',
        aggregateType: 'library-set',
        aggregateId: set.id,
        aggregateVersion: set.version,
        payload: {
          versionLabel: set.versionLabel,
          source: set.source,
          reviewStatus: set.reviewStatus,
          entries: {
            materials: pack.materials.length,
            rules: pack.rules.length,
            reactionClasses: pack.reactionClasses.length,
            formationEnthalpies: Object.keys(pack.formationEnthalpies).length,
            gases: Object.keys(pack.gases).length,
            energeticGroups: pack.energeticGroups.length,
          },
          reason: null,
        },
      });
      return { set, replayed: false };
    });
  }

  putInForce(
    context: ModuleCommandContext,
    id: string,
    input: PutSpeedLibrarySetInForceInputV1,
  ): Promise<SpeedLibrarySetV1> {
    errors.assertUuid(id, 'id');
    const { tenantId, subject } = context.principal;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const current = await client.query<LibraryRow>(
        `SELECT ${COLUMNS} FROM ${SCHEMA}.library_sets WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
        [tenantId, id],
      );
      const before = current.rows[0] ? toSet(current.rows[0]) : errors.notFound('The library set');
      if (before.version !== input.version) return errors.versionConflict('The library set');
      if (before.inForce) return before;
      const previous = await client.query<{ id: string; version_label: string }>(
        `UPDATE ${SCHEMA}.library_sets SET in_force = false, in_force_by = NULL, in_force_since = NULL, version = version + 1, updated_at = now()
          WHERE tenant_id = $1 AND in_force
          RETURNING id, version_label`,
        [tenantId],
      );
      const updated = await client.query<LibraryRow>(
        `UPDATE ${SCHEMA}.library_sets SET in_force = true, in_force_by = $3, in_force_since = now(), version = version + 1, updated_at = now()
          WHERE tenant_id = $1 AND id = $2
          RETURNING ${COLUMNS}`,
        [tenantId, id, subject],
      );
      const set = toSet(updated.rows[0] as LibraryRow);
      const replaced = previous.rows[0];
      await recordMutation(client, { schema: SCHEMA, topic: TOPIC }, context, {
        action: 'LIBRARY_SET_PUT_IN_FORCE',
        aggregateType: 'library-set',
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

  /** The set in force in the caller's transaction, or null when the workspace has none. */
  async inForce(client: Client, tenantId: string): Promise<LibraryInForce | null> {
    const row = await client.query<LibraryRow>(
      `SELECT ${COLUMNS} FROM ${SCHEMA}.library_sets WHERE tenant_id = $1 AND in_force`,
      [tenantId],
    );
    const found = row.rows[0];
    if (!found) return null;
    const reviewed = found.review_status === 'APPROVED';
    return {
      id: found.id,
      versionLabel: found.version_label,
      reviewed,
      library: engineLibrary(found.version_label, found.library, reviewed),
      energeticGroups: new Set(found.library.energeticGroups.map((group) => group.id)),
    };
  }
}
