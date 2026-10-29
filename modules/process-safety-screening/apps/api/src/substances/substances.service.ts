import { randomUUID } from 'node:crypto';
import type {
  CreateSpeedSubstanceInputV1,
  ListSpeedSubstancesQueryV1,
  SpeedArchiveInputV1,
  SpeedPageV1,
  SpeedRecordStatus,
  SpeedSubstanceV1,
  UpdateSpeedSubstanceInputV1,
} from '@gigalibs/contracts';
import {
  type ModuleCommandContext,
  type ModulePrincipal,
  recordMutation,
} from '@gigalibs/module-sdk';
import {
  IUPAC_2021_ABRIDGED,
  hillFormula,
  molarMass,
  parseFormula,
} from '@gigalibs/process-safety-engines';
import { Injectable } from '@nestjs/common';
import type { Client } from '../access.js';
import { changes, likePattern } from '../audit.js';
import { SCHEMA, TOPIC } from '../config.js';
import { CriteriaService } from '../criteria/criteria.service.js';
import { DatabaseService } from '../database.service.js';
import { errors, refuse, unprocessable } from '../errors.js';
import { LibraryService } from '../library/library.service.js';
import { NO_LIBRARY, computeStep } from '../routes/screening.js';

const ELEMENTS = IUPAC_2021_ABRIDGED;

const COLUMNS = `s.id, s.name, s.cas_number, s.formula, s.hill_formula, s.molar_mass_g_per_mol, s.elements_version, s.density_g_per_ml,
  s.notes, s.library_material_id, s.status, s.version, s.created_by, s.created_at, s.updated_at, s.archived_by, s.archived_at,
  EXISTS (SELECT 1 FROM ${SCHEMA}.step_materials m WHERE m.tenant_id = s.tenant_id AND m.substance_id = s.id) AS in_use`;

interface SubstanceRow {
  id: string;
  name: string;
  cas_number: string | null;
  formula: string;
  hill_formula: string;
  molar_mass_g_per_mol: string;
  elements_version: string;
  density_g_per_ml: string | null;
  notes: string | null;
  library_material_id: string | null;
  status: SpeedRecordStatus;
  version: number;
  created_by: string;
  created_at: Date;
  updated_at: Date;
  archived_by: string | null;
  archived_at: Date | null;
  in_use: boolean;
}

function toSubstance(row: SubstanceRow): SpeedSubstanceV1 {
  return {
    id: row.id,
    name: row.name,
    casNumber: row.cas_number,
    formula: row.formula,
    hillFormula: row.hill_formula,
    molarMassGPerMol: Number(row.molar_mass_g_per_mol),
    elementsVersion: row.elements_version,
    densityGPerMl: row.density_g_per_ml === null ? null : Number(row.density_g_per_ml),
    notes: row.notes,
    libraryMaterialId: row.library_material_id,
    status: row.status,
    inUse: row.in_use,
    version: Number(row.version),
    createdBy: row.created_by,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    archivedBy: row.archived_by,
    archivedAt: row.archived_at ? new Date(row.archived_at).toISOString() : null,
  };
}

const AUDITED: readonly (keyof SpeedSubstanceV1)[] = [
  'name',
  'casNumber',
  'formula',
  'molarMassGPerMol',
  'densityGPerMl',
  'notes',
  'libraryMaterialId',
  'status',
];

/** The formula's Hill notation and molar mass with the element table's version; a parser error is a field error (§4.1). */
export function analyseFormula(formula: string): {
  hill: string;
  molarMass: number;
  elementsVersion: string;
} {
  const parsed = parseFormula(formula, ELEMENTS);
  if (!parsed.ok)
    unprocessable('SPEED_FORMULA_INVALID', 'The formula is not valid.', [
      { path: 'formula', ...parsed.error },
    ]);
  return {
    hill: hillFormula(parsed.counts),
    molarMass: molarMass(parsed.counts, ELEMENTS),
    elementsVersion: ELEMENTS.version,
  };
}

/** A CAS Registry Number's check digit: the other digits, read from the right, weighted 1, 2, 3 … modulo 10. */
export function casCheckDigitValid(cas: string): boolean {
  const digits = cas.replaceAll('-', '');
  const check = Number(digits.at(-1));
  const body = digits.slice(0, -1).split('').reverse();
  const sum = body.reduce((total, digit, index) => total + Number(digit) * (index + 1), 0);
  return sum % 10 === check;
}

function assertCas(cas: string | null | undefined): void {
  if (cas && !casCheckDigitValid(cas))
    unprocessable('SPEED_CAS_INVALID', 'The CAS number check digit does not match.', [
      { path: 'casNumber', code: 'SPEED_CAS_INVALID' },
    ]);
}

/**
 * SPEED substances (WI-OI-120bx; screen spec §2.2), shared across the workspace's sites. The server computes the molar
 * mass from the formula with the engine package's element table and records its version. A substance a route uses
 * keeps its formula, so stored results stay true to their inputs; archived, never deleted.
 */
@Injectable()
export class SubstancesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly criteria: CriteriaService,
    private readonly library: LibraryService,
  ) {}

  /** A library material id must be in the library in force: its reactivity classes come from there (FR-HAZ-01). */
  private async assertLibraryMaterial(
    client: Client,
    tenantId: string,
    libraryMaterialId: string | null | undefined,
  ): Promise<void> {
    if (!libraryMaterialId) return;
    const library = await this.library.inForce(client, tenantId);
    if (!library)
      refuse(
        NO_LIBRARY.code,
        'No screening library is in force in this workspace, so the link cannot be checked.',
      );
    if (!library.library.materials.some((entry) => entry.id === libraryMaterialId))
      unprocessable(
        'SPEED_LIBRARY_MATERIAL_UNKNOWN',
        'The library material is not in the library in force.',
        [
          {
            path: 'libraryMaterialId',
            code: 'SPEED_LIBRARY_MATERIAL_UNKNOWN',
            params: { libraryMaterialId },
          },
        ],
      );
  }

  /**
   * A changed library link changes the interaction screen of every draft step that uses the substance, so those steps
   * are recomputed in the same transaction (results of other routes stay as they were).
   */
  private async recomputeUsers(
    client: Client,
    context: ModuleCommandContext,
    substanceId: string,
  ): Promise<void> {
    const { tenantId } = context.principal;
    const users = await client.query<{ route_id: string; step_id: string }>(
      `SELECT DISTINCT s.route_id, s.id AS step_id
         FROM ${SCHEMA}.step_materials m
         JOIN ${SCHEMA}.steps s ON s.tenant_id = m.tenant_id AND s.id = m.step_id
         JOIN ${SCHEMA}.routes r ON r.tenant_id = s.tenant_id AND r.id = s.route_id
        WHERE m.tenant_id = $1 AND m.substance_id = $2 AND r.status = 'DRAFT'`,
      [tenantId, substanceId],
    );
    if (users.rows.length === 0) return;
    const sets = {
      criteria: await this.criteria.inForce(client, tenantId),
      library: await this.library.inForce(client, tenantId),
    };
    for (const user of users.rows)
      await computeStep(client, context, user.route_id, user.step_id, sets);
  }

  list(
    principal: ModulePrincipal,
    query: ListSpeedSubstancesQueryV1 & {
      sortField?: 'name' | 'updatedAt';
      sortDirection?: 'ASC' | 'DESC';
    },
  ): Promise<SpeedPageV1<SpeedSubstanceV1>> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const values: unknown[] = [principal.tenantId];
      const bind = (value: unknown) => {
        values.push(value);
        return `$${values.length}`;
      };
      const conditions = ['s.tenant_id = $1'];
      if (query.search) {
        const slot = bind(likePattern(query.search));
        conditions.push(
          `(lower(s.name) LIKE ${slot} OR lower(coalesce(s.cas_number, '')) LIKE ${slot} OR lower(s.formula) LIKE ${slot})`,
        );
      }
      if (query.status) conditions.push(`s.status = ${bind(query.status)}`);
      const where = conditions.join(' AND ');
      const total = await client.query<{ count: string }>(
        `SELECT count(*) AS count FROM ${SCHEMA}.substances s WHERE ${where}`,
        values,
      );
      const order = query.sortField === 'updatedAt' ? 's.updated_at' : 'lower(s.name)';
      const direction = query.sortDirection === 'DESC' ? 'DESC' : 'ASC';
      const page = await client.query<SubstanceRow>(
        `SELECT ${COLUMNS} FROM ${SCHEMA}.substances s WHERE ${where} ORDER BY ${order} ${direction}, s.id
          LIMIT ${bind(query.pageSize)} OFFSET ${bind((query.page - 1) * query.pageSize)}`,
        values,
      );
      return {
        items: page.rows.map(toSubstance),
        total: Number(total.rows[0]?.count ?? 0),
        page: query.page,
        pageSize: query.pageSize,
      };
    });
  }

  get(principal: ModulePrincipal, id: string): Promise<SpeedSubstanceV1> {
    errors.assertUuid(id, 'id');
    return this.database.withTenantTransaction(principal.tenantId, async (client) =>
      toSubstance(await this.row(client, principal.tenantId, id)),
    );
  }

  async create(
    context: ModuleCommandContext,
    input: CreateSpeedSubstanceInputV1,
  ): Promise<{ substance: SpeedSubstanceV1; replayed: boolean }> {
    const { tenantId, subject } = context.principal;
    assertCas(input.casNumber);
    const formula = analyseFormula(input.formula);
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const replay = await client.query<SubstanceRow>(
        `SELECT ${COLUMNS} FROM ${SCHEMA}.substances s WHERE s.tenant_id = $1 AND s.request_key = $2`,
        [tenantId, input.requestKey],
      );
      if (replay.rows[0]) return { substance: toSubstance(replay.rows[0]), replayed: true };
      await this.assertLibraryMaterial(client, tenantId, input.libraryMaterialId);
      const id = randomUUID();
      try {
        await client.query(
          `INSERT INTO ${SCHEMA}.substances (id, tenant_id, request_key, name, cas_number, formula, hill_formula, molar_mass_g_per_mol,
             elements_version, density_g_per_ml, notes, library_material_id, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [
            id,
            tenantId,
            input.requestKey,
            input.name,
            input.casNumber ?? null,
            input.formula,
            formula.hill,
            formula.molarMass,
            formula.elementsVersion,
            input.densityGPerMl ?? null,
            input.notes ?? null,
            input.libraryMaterialId ?? null,
            subject,
          ],
        );
      } catch (error) {
        errors.translateConstraint(error, { unique: 'A substance with this name already exists.' });
      }
      const substance = toSubstance(await this.row(client, tenantId, id));
      await recordMutation(client, { schema: SCHEMA, topic: TOPIC }, context, {
        action: 'SUBSTANCE_CREATED',
        aggregateType: 'substance',
        aggregateId: substance.id,
        aggregateVersion: substance.version,
        payload: { changes: changes(null, substance, AUDITED), reason: null },
      });
      return { substance, replayed: false };
    });
  }

  async update(
    context: ModuleCommandContext,
    id: string,
    input: UpdateSpeedSubstanceInputV1,
  ): Promise<SpeedSubstanceV1> {
    errors.assertUuid(id, 'id');
    const { tenantId } = context.principal;
    if (input.casNumber) assertCas(input.casNumber);
    const formula = input.formula === undefined ? null : analyseFormula(input.formula);
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const before = toSubstance(await this.row(client, tenantId, id, true));
      if (before.status === 'ARCHIVED')
        refuse('SPEED_SUBSTANCE_ARCHIVED', 'The substance is archived and can no longer change.');
      if (before.version !== input.version) return errors.versionConflict('The substance');
      if (formula && input.formula !== before.formula && before.inUse)
        refuse(
          'SPEED_SUBSTANCE_IN_USE',
          'A route uses this substance, so its formula stays; create a new substance for the new formula.',
        );
      const set = (key: keyof UpdateSpeedSubstanceInputV1) => input[key] !== undefined;
      const relinked =
        set('libraryMaterialId') && (input.libraryMaterialId ?? null) !== before.libraryMaterialId;
      if (relinked) await this.assertLibraryMaterial(client, tenantId, input.libraryMaterialId);
      try {
        await client.query(
          `UPDATE ${SCHEMA}.substances
              SET name = CASE WHEN $3 THEN $4 ELSE name END,
                  cas_number = CASE WHEN $5 THEN $6 ELSE cas_number END,
                  formula = CASE WHEN $7 THEN $8 ELSE formula END,
                  hill_formula = CASE WHEN $7 THEN $9 ELSE hill_formula END,
                  molar_mass_g_per_mol = CASE WHEN $7 THEN $10::numeric ELSE molar_mass_g_per_mol END,
                  elements_version = CASE WHEN $7 THEN $11 ELSE elements_version END,
                  density_g_per_ml = CASE WHEN $12 THEN $13::numeric ELSE density_g_per_ml END,
                  notes = CASE WHEN $14 THEN $15 ELSE notes END,
                  library_material_id = CASE WHEN $16 THEN $17 ELSE library_material_id END,
                  version = version + 1, updated_at = now()
            WHERE tenant_id = $1 AND id = $2`,
          [
            tenantId,
            id,
            set('name'),
            input.name ?? null,
            set('casNumber'),
            input.casNumber ?? null,
            formula !== null,
            input.formula ?? null,
            formula?.hill ?? null,
            formula?.molarMass ?? null,
            formula?.elementsVersion ?? null,
            set('densityGPerMl'),
            input.densityGPerMl ?? null,
            set('notes'),
            input.notes ?? null,
            set('libraryMaterialId'),
            input.libraryMaterialId ?? null,
          ],
        );
      } catch (error) {
        errors.translateConstraint(error, { unique: 'A substance with this name already exists.' });
      }
      const substance = toSubstance(await this.row(client, tenantId, id));
      await recordMutation(client, { schema: SCHEMA, topic: TOPIC }, context, {
        action: 'SUBSTANCE_UPDATED',
        aggregateType: 'substance',
        aggregateId: substance.id,
        aggregateVersion: substance.version,
        payload: { changes: changes(before, substance, AUDITED), reason: input.reason },
      });
      if (relinked) await this.recomputeUsers(client, context, id);
      return substance;
    });
  }

  archive(
    context: ModuleCommandContext,
    id: string,
    input: SpeedArchiveInputV1,
  ): Promise<SpeedSubstanceV1> {
    errors.assertUuid(id, 'id');
    const { tenantId, subject } = context.principal;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const before = toSubstance(await this.row(client, tenantId, id, true));
      if (before.status === 'ARCHIVED')
        refuse('SPEED_SUBSTANCE_ARCHIVED', 'The substance is archived and can no longer change.');
      if (before.version !== input.version) return errors.versionConflict('The substance');
      await client.query(
        `UPDATE ${SCHEMA}.substances SET status = 'ARCHIVED', archived_by = $3, archived_at = now(), version = version + 1, updated_at = now()
          WHERE tenant_id = $1 AND id = $2`,
        [tenantId, id, subject],
      );
      const substance = toSubstance(await this.row(client, tenantId, id));
      await recordMutation(client, { schema: SCHEMA, topic: TOPIC }, context, {
        action: 'SUBSTANCE_ARCHIVED',
        aggregateType: 'substance',
        aggregateId: substance.id,
        aggregateVersion: substance.version,
        payload: { changes: changes(before, substance, AUDITED), reason: input.reason },
      });
      return substance;
    });
  }

  /** Active substances for a picker, by name, CAS or formula. */
  lookup(
    principal: ModulePrincipal,
    request: { search?: string; ids?: readonly string[]; limit: number },
  ): Promise<{ value: string; label: string }[]> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const values: unknown[] = [principal.tenantId];
      let where = `s.tenant_id = $1 AND s.status = 'ACTIVE'`;
      if (request.ids?.length) {
        values.push([...request.ids]);
        where = `s.tenant_id = $1 AND s.id = ANY($2::uuid[])`;
      } else if (request.search) {
        values.push(likePattern(request.search));
        where += ` AND (lower(s.name) LIKE $2 OR lower(coalesce(s.cas_number, '')) LIKE $2 OR lower(s.formula) LIKE $2)`;
      }
      values.push(request.limit);
      const rows = await client.query<{ id: string; name: string; formula: string }>(
        `SELECT s.id, s.name, s.formula FROM ${SCHEMA}.substances s WHERE ${where} ORDER BY lower(s.name), s.id LIMIT $${values.length}`,
        values,
      );
      return rows.rows.map((row) => ({ value: row.id, label: `${row.name} (${row.formula})` }));
    });
  }

  private async row(
    client: Client,
    tenantId: string,
    id: string,
    lock = false,
  ): Promise<SubstanceRow> {
    const result = await client.query<SubstanceRow>(
      `SELECT ${COLUMNS} FROM ${SCHEMA}.substances s WHERE s.tenant_id = $1 AND s.id = $2${lock ? ' FOR UPDATE OF s' : ''}`,
      [tenantId, id],
    );
    return result.rows[0] ?? errors.notFound('The substance');
  }
}
