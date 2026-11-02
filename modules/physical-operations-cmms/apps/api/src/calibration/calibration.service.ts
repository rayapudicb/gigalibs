import { createHash } from 'node:crypto';
import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import {
  CALIBRATION_TECHNICIAN_STATEMENT,
  CalibrationCertificateV1Schema,
  CalibrationDefinitionV1Schema,
  CreateCalibrationProfileV1Schema,
  CreateCalibrationStandardV1Schema,
  DecideCalibrationRecordV1Schema,
  PublishCalibrationProfileV1Schema,
  SearchCalibrationRecordsV1Schema,
  SubmitCalibrationRecordV1Schema,
  UpdateCalibrationProfileV1Schema,
  UpdateCalibrationStandardV1Schema,
  evaluateCalibration,
  type CalibrationCertificateV1,
  type CalibrationDefinitionV1,
  type CalibrationDriftV1,
  type CalibrationInstrumentBundleV1,
  type CalibrationInstrumentV1,
  type CalibrationProfileV1,
  type CalibrationRecordV1,
  type CalibrationStandardV1,
  type SubmitCalibrationResultV1,
} from '@gigalibs/contracts';
import type { PoolClient } from 'pg';
import type { CmmsCommandContext, CmmsPrincipal } from '../auth/authorization.js';
import { assertWritableScope, scopePredicates } from '../auth/scope.js';
import { AssetsService } from '../assets/assets.service.js';
import { assertUuid, iso, isoOrNull, notFound, parseInput, recordMutation, translateConstraint, versionConflict } from '../common/command.js';
import { derivedRequestKey, systemPrincipal } from '../common/system-principal.js';
import { DatabaseService } from '../database/database.service.js';
import { WorkOrdersService } from '../work-orders/work-orders.service.js';

// WI-OI-134 M-CAL. Instruments are CMMS assets. The server recomputes every submitted point with the shared contract
// function; a stale profile revision or an invalid standard is an explicit conflict, never a silent acceptance. A FAIL
// raises one corrective work order and takes an operational instrument offline in the same transaction. A user other
// than the technician decides each record exactly once (also enforced by the database).

const MAX_FUTURE_SKEW_MS = 5 * 60_000;
const MAX_CAPTURE_AGE_MS = 30 * 24 * 60 * 60_000;
const DUE_SOON_DAYS = 30;
const DAY_MS = 24 * 60 * 60_000;
const CERTIFICATE_DISCLAIMER =
  'Issued from GigaLibs CMMS calibration records. The technician and approver sign-offs are recorded system ' +
  'attestations; they are not represented as 21 CFR Part 11 electronic signatures.';

const PROFILE_COLUMNS = `p.id, p.asset_id, a.asset_tag, a.name AS asset_name, p.revision, p.status, p.input_lrv, p.input_urv,
  p.input_unit, p.output_lrv, p.output_urv, p.output_unit, p.transfer, p.tolerance_mode, p.tolerance_value,
  p.test_points, p.interval_days, p.procedure, p.authored_by, p.last_edited_by, p.published_by, p.published_at,
  p.version, p.created_at, p.updated_at`;
const STANDARD_COLUMNS = `s.id, s.code, s.name, s.serial_number, s.manufacturer, s.model, s.accuracy_statement,
  s.certificate_number, s.issued_by, s.calibrated_on::text AS calibrated_on, s.valid_until::text AS valid_until,
  s.status, s.site_ref, s.department_id, s.version, s.updated_at,
  (s.status = 'ACTIVE' AND s.valid_until >= (now() AT TIME ZONE 'UTC')::date) AS usable`;
const RECORD_COLUMNS = `r.id, r.asset_id, a.asset_tag, a.name AS asset_name, r.profile_id, r.profile_revision, r.definition,
  r.work_order_id, r.technician, r.started_at, r.completed_at, r.received_at, r.status, r.as_found_result,
  r.as_left_result, r.overall_result, r.impact_review_required, r.notes, r.technician_statement, r.record_sha256,
  r.request_sha256, r.corrective_work_order_id, r.asset_taken_offline, r.decided_by, r.decided_at, r.decision_note,
  r.decision_statement, r.version, r.site_ref, r.department_id`;

/** Stable JSON: object keys sorted, so equal content always hashes equally. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value as Record<string, unknown>)
      .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/** Deterministic UUID-shaped key, so a replayed FAIL never raises a second corrective work order. */
export function containmentRequestKey(tenantId: string, clientOperationId: string): string {
  return derivedRequestKey('calibration-containment', tenantId, clientOperationId);
}

/** The next-due state of an instrument from its latest record and its latest valid (approved PASS/ADJUSTED) one. */
export function dueState(
  latestResult: string | null,
  lastValidAt: Date | null,
  intervalDays: number,
  now: Date,
  soonDays = DUE_SOON_DAYS,
): { nextDueAt: string | null; state: CalibrationInstrumentV1['dueState'] } {
  if (!lastValidAt) return { nextDueAt: null, state: latestResult === 'FAIL' ? 'OVERDUE' : 'NEVER' };
  const next = new Date(lastValidAt.getTime() + intervalDays * DAY_MS);
  if (latestResult === 'FAIL' || next.getTime() < now.getTime()) return { nextDueAt: next.toISOString(), state: 'OVERDUE' };
  return { nextDueAt: next.toISOString(), state: next.getTime() - now.getTime() <= soonDays * DAY_MS ? 'DUE_SOON' : 'CURRENT' };
}

function containmentPrincipal(tenantId: string): CmmsPrincipal {
  return systemPrincipal(tenantId, 'calibration:containment', 'calibration');
}

function conflict(code: string, message: string): never {
  throw new ConflictException({ code, message });
}

const num = (value: unknown) => Number(value);

function mapDefinition(row: Record<string, any>): CalibrationDefinitionV1 {
  return CalibrationDefinitionV1Schema.parse({
    inputLrv: num(row.input_lrv),
    inputUrv: num(row.input_urv),
    inputUnit: row.input_unit,
    outputLrv: num(row.output_lrv),
    outputUrv: num(row.output_urv),
    outputUnit: row.output_unit,
    transfer: row.transfer,
    toleranceMode: row.tolerance_mode,
    toleranceValue: num(row.tolerance_value),
    testPoints: (row.test_points as unknown[]).map(num),
    intervalDays: row.interval_days,
    ...(row.procedure ? { procedure: row.procedure } : {}),
  });
}

function mapProfile(row: Record<string, any>): CalibrationProfileV1 {
  return {
    id: row.id,
    assetId: row.asset_id,
    assetTag: row.asset_tag,
    assetName: row.asset_name,
    revision: row.revision,
    status: row.status,
    definition: mapDefinition(row),
    authoredBy: row.authored_by,
    publishedBy: row.published_by,
    publishedAt: isoOrNull(row.published_at),
    version: row.version,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function mapStandard(row: Record<string, any>): CalibrationStandardV1 {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    serialNumber: row.serial_number,
    manufacturer: row.manufacturer,
    model: row.model,
    accuracyStatement: row.accuracy_statement,
    certificateNumber: row.certificate_number,
    issuedBy: row.issued_by,
    calibratedOn: row.calibrated_on,
    validUntil: row.valid_until,
    status: row.status,
    siteRef: row.site_ref,
    departmentId: row.department_id,
    usable: row.usable === true,
    version: row.version,
    updatedAt: iso(row.updated_at),
  };
}

@Injectable()
export class CalibrationService {
  constructor(
    private readonly database: DatabaseService,
    private readonly assets: AssetsService,
    private readonly workOrders: WorkOrdersService,
  ) {}

  // ─── Master standards ────────────────────────────────────────────────────────────────────────────────

  async listStandards(principal: CmmsPrincipal): Promise<{ readonly items: readonly CalibrationStandardV1[] }> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const values: unknown[] = [principal.tenantId];
      const where = ['s.tenant_id = $1', ...scopePredicates(principal, values, 's.')];
      const result = await client.query(
        `SELECT ${STANDARD_COLUMNS} FROM gigalibs_cmms.calibration_standards s
          WHERE ${where.join(' AND ')} ORDER BY s.code ASC LIMIT 500`,
        values,
      );
      return { items: result.rows.map(mapStandard) };
    });
  }

  async createStandard(context: CmmsCommandContext, raw: unknown): Promise<CalibrationStandardV1> {
    const input = parseInput(CreateCalibrationStandardV1Schema, raw);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      assertWritableScope(context.principal, { departmentId: input.departmentId ?? null, siteRef: input.siteRef ?? null },
        undefined, undefined, { permission: 'cmms.calibration.manage' });
      try {
        const result = await client.query<{ id: string }>(
          `INSERT INTO gigalibs_cmms.calibration_standards
             (tenant_id, code, name, serial_number, manufacturer, model, accuracy_statement, certificate_number,
              issued_by, calibrated_on, valid_until, site_ref, department_id, created_by, updated_by, correlation_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $14, $15) RETURNING id`,
          [context.principal.tenantId, input.code, input.name, input.serialNumber ?? null, input.manufacturer ?? null,
            input.model ?? null, input.accuracyStatement ?? null, input.certificateNumber, input.issuedBy,
            input.calibratedOn, input.validUntil, input.siteRef ?? null, input.departmentId ?? null,
            context.principal.subject, context.correlationId],
        );
        const id = result.rows[0]!.id;
        await recordMutation(client, context, {
          action: 'CMMS_CALIBRATION_STANDARD_CREATED', aggregateType: 'CMMS_CALIBRATION_STANDARD', aggregateId: id,
          aggregateVersion: 1, payload: { code: input.code, validUntil: input.validUntil },
        });
        return this.standardRow(client, context.principal, id, false);
      } catch (error) {
        translateConstraint(error, { unique: 'A standard with this code already exists.' });
      }
    });
  }

  async updateStandard(context: CmmsCommandContext, standardId: string, raw: unknown): Promise<CalibrationStandardV1> {
    assertUuid(standardId, 'standardId');
    const input = parseInput(UpdateCalibrationStandardV1Schema, raw);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const current = await this.standardRow(client, context.principal, standardId, true);
      assertWritableScope(context.principal, { departmentId: current.departmentId, siteRef: current.siteRef },
        undefined, undefined, { permission: 'cmms.calibration.manage' });
      if (current.version !== input.expectedVersion) versionConflict('The standard');
      const calibratedOn = input.calibratedOn ?? current.calibratedOn;
      const validUntil = input.validUntil ?? current.validUntil;
      if (validUntil < calibratedOn)
        conflict('CMMS_VALIDATION_FAILED', 'The certificate must be valid on or after its calibration date.');
      await client.query(
        `UPDATE gigalibs_cmms.calibration_standards
            SET name = $3, accuracy_statement = $4, certificate_number = $5, issued_by = $6, calibrated_on = $7,
                valid_until = $8, status = $9, version = version + 1, updated_by = $10, correlation_id = $11, updated_at = now()
          WHERE tenant_id = $1 AND id = $2`,
        [context.principal.tenantId, standardId, input.name ?? current.name,
          input.accuracyStatement ?? current.accuracyStatement, input.certificateNumber ?? current.certificateNumber,
          input.issuedBy ?? current.issuedBy, calibratedOn, validUntil, input.status ?? current.status,
          context.principal.subject, context.correlationId],
      );
      await recordMutation(client, context, {
        action: 'CMMS_CALIBRATION_STANDARD_UPDATED', aggregateType: 'CMMS_CALIBRATION_STANDARD', aggregateId: standardId,
        aggregateVersion: current.version + 1, payload: { status: input.status ?? current.status, validUntil },
      });
      return this.standardRow(client, context.principal, standardId, false);
    });
  }

  // ─── Profiles ─────────────────────────────────────────────────────────────────────────────────────────

  async listProfiles(principal: CmmsPrincipal, assetId?: string): Promise<{ readonly items: readonly CalibrationProfileV1[] }> {
    if (assetId !== undefined) assertUuid(assetId, 'assetId');
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const values: unknown[] = [principal.tenantId];
      const where = ['p.tenant_id = $1', 'a.archived_at IS NULL', ...scopePredicates(principal, values, 'a.')];
      if (assetId) {
        values.push(assetId);
        where.push(`p.asset_id = $${values.length}`);
      }
      const result = await client.query(
        `SELECT ${PROFILE_COLUMNS} FROM gigalibs_cmms.calibration_profiles p
           JOIN gigalibs_cmms.assets a ON a.tenant_id = p.tenant_id AND a.id = p.asset_id
          WHERE ${where.join(' AND ')} ORDER BY a.asset_tag ASC, p.revision DESC LIMIT 500`,
        values,
      );
      return { items: result.rows.map(mapProfile) };
    });
  }

  async createProfile(context: CmmsCommandContext, raw: unknown): Promise<CalibrationProfileV1> {
    const input = parseInput(CreateCalibrationProfileV1Schema, raw);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const asset = await this.assets.visibleAsset(client, context.principal, input.assetId, false);
      assertWritableScope(context.principal, { departmentId: asset.departmentId, siteRef: asset.siteRef },
        undefined, undefined, { permission: 'cmms.calibration.manage' });
      await client.query('SELECT 1 FROM gigalibs_cmms.assets WHERE tenant_id = $1 AND id = $2 FOR UPDATE',
        [context.principal.tenantId, input.assetId]);
      const revision = await client.query<{ next: number }>(
        `SELECT coalesce(max(revision), 0) + 1 AS next FROM gigalibs_cmms.calibration_profiles
          WHERE tenant_id = $1 AND asset_id = $2`,
        [context.principal.tenantId, input.assetId],
      );
      try {
        const result = await client.query<{ id: string }>(
          `INSERT INTO gigalibs_cmms.calibration_profiles
             (tenant_id, asset_id, revision, input_lrv, input_urv, input_unit, output_lrv, output_urv, output_unit,
              transfer, tolerance_mode, tolerance_value, test_points, interval_days, procedure, authored_by,
              last_edited_by, updated_by, correlation_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::numeric[], $14, $15, $16, $16, $16, $17)
           RETURNING id`,
          [context.principal.tenantId, input.assetId, revision.rows[0]!.next, input.inputLrv, input.inputUrv,
            input.inputUnit, input.outputLrv, input.outputUrv, input.outputUnit, input.transfer, input.toleranceMode,
            input.toleranceValue, input.testPoints, input.intervalDays, input.procedure ?? null,
            context.principal.subject, context.correlationId],
        );
        const id = result.rows[0]!.id;
        await recordMutation(client, context, {
          action: 'CMMS_CALIBRATION_PROFILE_DRAFTED', aggregateType: 'CMMS_CALIBRATION_PROFILE', aggregateId: id,
          aggregateVersion: 1, payload: { assetId: input.assetId, revision: revision.rows[0]!.next },
        });
        return this.profileRow(client, context.principal, id, false);
      } catch (error) {
        translateConstraint(error, { unique: 'This instrument already has a draft calibration profile; edit that draft.' });
      }
    });
  }

  async updateProfile(context: CmmsCommandContext, profileId: string, raw: unknown): Promise<CalibrationProfileV1> {
    assertUuid(profileId, 'profileId');
    const input = parseInput(UpdateCalibrationProfileV1Schema, raw);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const current = await this.profileRow(client, context.principal, profileId, true);
      const asset = await this.assets.visibleAsset(client, context.principal, current.assetId, false);
      assertWritableScope(context.principal, { departmentId: asset.departmentId, siteRef: asset.siteRef },
        undefined, undefined, { permission: 'cmms.calibration.manage' });
      if (current.status !== 'DRAFT') conflict('CMMS_CALIBRATION_PROFILE_PUBLISHED', 'Only a draft profile can be edited.');
      if (current.version !== input.expectedVersion) versionConflict('The calibration profile');
      await client.query(
        `UPDATE gigalibs_cmms.calibration_profiles
            SET input_lrv = $3, input_urv = $4, input_unit = $5, output_lrv = $6, output_urv = $7, output_unit = $8,
                transfer = $9, tolerance_mode = $10, tolerance_value = $11, test_points = $12::numeric[],
                interval_days = $13, procedure = $14, last_edited_by = $15, updated_by = $15, correlation_id = $16,
                version = version + 1, updated_at = now()
          WHERE tenant_id = $1 AND id = $2`,
        [context.principal.tenantId, profileId, input.inputLrv, input.inputUrv, input.inputUnit, input.outputLrv,
          input.outputUrv, input.outputUnit, input.transfer, input.toleranceMode, input.toleranceValue,
          input.testPoints, input.intervalDays, input.procedure ?? null, context.principal.subject, context.correlationId],
      );
      await recordMutation(client, context, {
        action: 'CMMS_CALIBRATION_PROFILE_EDITED', aggregateType: 'CMMS_CALIBRATION_PROFILE', aggregateId: profileId,
        aggregateVersion: current.version + 1, payload: { assetId: current.assetId, revision: current.revision },
      });
      return this.profileRow(client, context.principal, profileId, false);
    });
  }

  /** Publishes a draft (maker-checker) and supersedes the instrument's previously published revision. */
  async publishProfile(context: CmmsCommandContext, profileId: string, raw: unknown): Promise<CalibrationProfileV1> {
    assertUuid(profileId, 'profileId');
    const input = parseInput(PublishCalibrationProfileV1Schema, raw);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const row = await this.profileDbRow(client, context.principal, profileId, true);
      const asset = await this.assets.visibleAsset(client, context.principal, row.asset_id, false);
      assertWritableScope(context.principal, { departmentId: asset.departmentId, siteRef: asset.siteRef },
        undefined, undefined, { permission: 'cmms.calibration.publish' });
      if (row.status !== 'DRAFT') conflict('CMMS_CALIBRATION_PROFILE_PUBLISHED', 'Only a draft profile can be published.');
      if (row.version !== input.expectedVersion) versionConflict('The calibration profile');
      if (context.principal.subject === row.authored_by || context.principal.subject === row.last_edited_by)
        throw new ForbiddenException({ code: 'CMMS_CALIBRATION_FOUR_EYES',
          message: 'A calibration profile is published by someone who did not write it.' });
      await client.query(
        `UPDATE gigalibs_cmms.calibration_profiles SET status = 'SUPERSEDED', version = version + 1, updated_by = $3,
                correlation_id = $4, updated_at = now()
          WHERE tenant_id = $1 AND asset_id = $2 AND status = 'PUBLISHED'`,
        [context.principal.tenantId, row.asset_id, context.principal.subject, context.correlationId],
      );
      await client.query(
        `UPDATE gigalibs_cmms.calibration_profiles
            SET status = 'PUBLISHED', published_by = $3, published_at = now(), updated_by = $3, correlation_id = $4,
                version = version + 1, updated_at = now()
          WHERE tenant_id = $1 AND id = $2`,
        [context.principal.tenantId, profileId, context.principal.subject, context.correlationId],
      );
      await recordMutation(client, context, {
        action: 'CMMS_CALIBRATION_PROFILE_PUBLISHED', aggregateType: 'CMMS_CALIBRATION_PROFILE', aggregateId: profileId,
        aggregateVersion: row.version + 1, payload: { assetId: row.asset_id, revision: row.revision },
      });
      return this.profileRow(client, context.principal, profileId, false);
    });
  }

  // ─── Instruments ──────────────────────────────────────────────────────────────────────────────────────

  async listInstruments(principal: CmmsPrincipal, dueWithinDays?: string): Promise<{ readonly items: readonly CalibrationInstrumentV1[] }> {
    const within = dueWithinDays === undefined ? undefined : Number(dueWithinDays);
    if (within !== undefined && (!Number.isInteger(within) || within < 0 || within > 3650))
      conflict('CMMS_VALIDATION_FAILED', 'dueWithinDays must be a whole number of days up to 3650.');
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const items = await this.instruments(client, principal);
      const now = Date.now();
      return {
        items: within === undefined ? items : items.filter((item) =>
          item.dueState === 'NEVER' || item.dueState === 'OVERDUE' ||
          (item.nextDueAt !== null && Date.parse(item.nextDueAt) - now <= within * DAY_MS)),
      };
    });
  }

  /** The instrument, its published profile and the standards the caller may use, for capture (offline too). */
  async bundle(principal: CmmsPrincipal, assetId: string): Promise<CalibrationInstrumentBundleV1> {
    assertUuid(assetId, 'assetId');
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const [instrument] = await this.instruments(client, principal, assetId);
      if (!instrument) notFound('A calibrated instrument');
      const profile = await this.profileRow(client, principal, instrument.profileId, false);
      const values: unknown[] = [principal.tenantId];
      const where = ["s.tenant_id = $1", "s.status = 'ACTIVE'", ...scopePredicates(principal, values, 's.')];
      const standards = await client.query(
        `SELECT ${STANDARD_COLUMNS} FROM gigalibs_cmms.calibration_standards s
          WHERE ${where.join(' AND ')} ORDER BY s.code ASC LIMIT 200`,
        values,
      );
      return {
        contractVersion: 'calibration-bundle.v1',
        generatedAt: new Date().toISOString(),
        instrument,
        profile,
        standards: standards.rows.map(mapStandard),
      };
    });
  }

  async drift(principal: CmmsPrincipal, assetId: string): Promise<CalibrationDriftV1> {
    assertUuid(assetId, 'assetId');
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      await this.assets.visibleAsset(client, principal, assetId, true);
      const result = await client.query(
        `SELECT r.id, r.completed_at, r.profile_revision, r.overall_result, r.definition->>'outputUnit' AS output_unit,
                coalesce(json_agg(json_build_object('nominalPercent', pt.nominal_percent,
                  'asFoundErrorPercentSpan', pt.error_percent_span) ORDER BY pt.position)
                  FILTER (WHERE pt.phase = 'AS_FOUND'), '[]'::json) AS points
           FROM gigalibs_cmms.calibration_records r
           LEFT JOIN gigalibs_cmms.calibration_points pt ON pt.tenant_id = r.tenant_id AND pt.record_id = r.id
          WHERE r.tenant_id = $1 AND r.asset_id = $2 AND r.status = 'APPROVED'
            AND r.completed_at > now() - interval '5 years'
          GROUP BY r.tenant_id, r.id ORDER BY r.completed_at ASC, r.id ASC LIMIT 200`,
        [principal.tenantId, assetId],
      );
      return {
        assetId,
        outputUnit: result.rows.at(-1)?.output_unit ?? null,
        series: result.rows.map((row) => ({
          recordId: row.id,
          completedAt: iso(row.completed_at),
          profileRevision: row.profile_revision,
          overallResult: row.overall_result,
          points: (row.points as { nominalPercent: unknown; asFoundErrorPercentSpan: unknown }[]).map((point) => ({
            nominalPercent: num(point.nominalPercent),
            asFoundErrorPercentSpan: num(point.asFoundErrorPercentSpan),
          })),
        })),
      };
    });
  }

  // ─── Records ──────────────────────────────────────────────────────────────────────────────────────────

  async submit(context: CmmsCommandContext, raw: unknown, now = new Date()): Promise<SubmitCalibrationResultV1> {
    const input = parseInput(SubmitCalibrationRecordV1Schema, raw);
    const requestSha256 = sha256(canonicalJson(input));
    const principal = context.principal;
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const replay = await this.replay(client, principal, input.clientOperationId, requestSha256);
      if (replay) return { replayed: true, record: replay };

      const completed = Date.parse(input.completedAt);
      if (completed > now.getTime() + MAX_FUTURE_SKEW_MS)
        conflict('CMMS_CALIBRATION_CLOCK', 'The calibration finishes in the future; check the device clock.');
      if (completed < now.getTime() - MAX_CAPTURE_AGE_MS)
        conflict('CMMS_CALIBRATION_TOO_OLD', 'A calibration is submitted within 30 days of being performed.');

      const asset = await this.assets.visibleAsset(client, principal, input.assetId, false);
      assertWritableScope(principal, { departmentId: asset.departmentId, siteRef: asset.siteRef },
        undefined, undefined, { permission: 'cmms.calibration.execute' });
      await client.query('SELECT 1 FROM gigalibs_cmms.assets WHERE tenant_id = $1 AND id = $2 FOR UPDATE',
        [principal.tenantId, input.assetId]);

      const profileRow = (await client.query(
        `SELECT ${PROFILE_COLUMNS} FROM gigalibs_cmms.calibration_profiles p
           JOIN gigalibs_cmms.assets a ON a.tenant_id = p.tenant_id AND a.id = p.asset_id
          WHERE p.tenant_id = $1 AND p.id = $2 AND p.asset_id = $3 FOR SHARE OF p`,
        [principal.tenantId, input.profileId, input.assetId],
      )).rows[0];
      if (!profileRow || profileRow.status !== 'PUBLISHED' || profileRow.revision !== input.profileRevision)
        conflict('CMMS_CALIBRATION_PROFILE_CHANGED',
          'The calibration profile changed since this capture was prepared; download the current one and repeat it.');
      const definition = mapDefinition(profileRow);

      if (input.workOrderId) {
        const workOrder = await this.workOrders.detailWithClient(client, principal, input.workOrderId);
        if (workOrder.assetId !== input.assetId || workOrder.status === 'CANCELLED')
          conflict('CMMS_CALIBRATION_WORK_ORDER', 'The work order is cancelled or is for another asset.');
      }

      // Standards must be within their certificate on the (UTC) day the calibration finished.
      const capturedOn = new Date(completed).toISOString().slice(0, 10);
      const standardValues: unknown[] = [principal.tenantId, input.standardIds];
      const standardWhere = ['s.tenant_id = $1', 's.id = ANY($2::uuid[])', ...scopePredicates(principal, standardValues, 's.')];
      const standards = (await client.query(
        `SELECT ${STANDARD_COLUMNS} FROM gigalibs_cmms.calibration_standards s
          WHERE ${standardWhere.join(' AND ')} FOR SHARE OF s`,
        standardValues,
      )).rows.map(mapStandard);
      if (standards.length !== input.standardIds.length) notFound('A named standard');
      const invalid = standards.find((standard) => standard.status !== 'ACTIVE' ||
        standard.validUntil < capturedOn || standard.calibratedOn > capturedOn);
      if (invalid)
        conflict('CMMS_CALIBRATION_STANDARD_INVALID',
          `Standard ${invalid.code} was withdrawn or was not within its certificate on ${capturedOn}.`);

      let evaluation;
      try {
        evaluation = evaluateCalibration(definition, input.asFound, input.asLeft);
      } catch (error) {
        conflict('CMMS_CALIBRATION_PROFILE_CHANGED',
          error instanceof RangeError ? error.message : 'The readings do not match the profile test points.');
      }

      const standardSnapshot = input.standardIds.map((id) => {
        const standard = standards.find((candidate) => candidate.id === id)!;
        return { id, code: standard.code, name: standard.name, certificateNumber: standard.certificateNumber,
          validUntil: standard.validUntil };
      });
      const recordSha256 = sha256(canonicalJson({
        assetId: input.assetId, profileId: input.profileId, profileRevision: input.profileRevision, definition,
        standards: standardSnapshot, points: evaluation.points, startedAt: input.startedAt,
        completedAt: input.completedAt, technician: principal.subject, clientOperationId: input.clientOperationId,
        notes: input.notes ?? null, statement: CALIBRATION_TECHNICIAN_STATEMENT,
      }));

      let correctiveWorkOrderId: string | null = null;
      let assetTakenOffline = false;
      if (evaluation.overallResult === 'FAIL') {
        const failing = evaluation.points.filter((point) => !point.withinTolerance)
          .map((point) => `${point.phase} ${point.nominalPercent}%: ${point.errorPercentSpan}% of span`).join('; ');
        correctiveWorkOrderId = await this.workOrders.createWithClient(
          client,
          { principal: containmentPrincipal(principal.tenantId), correlationId: context.correlationId },
          {
            requestKey: containmentRequestKey(principal.tenantId, input.clientOperationId),
            type: 'REACTIVE',
            priority: 'HIGH',
            title: `Calibration failed: ${asset.assetTag}`.slice(0, 240),
            description: `Calibration by ${principal.subject} (operation ${input.clientOperationId}) failed. ` +
              `Out of tolerance: ${failing}. Repair or replace the instrument, then calibrate it again.`,
            assetId: input.assetId,
            requiresSignature: false,
            tasks: [],
          },
          { triggerSource: 'CALIBRATION', pmScheduleId: null, pmOccurrenceAt: null },
        );
        if (asset.status === 'OPERATIONAL') {
          await client.query(
            `UPDATE gigalibs_cmms.assets SET status = 'OFFLINE', version = version + 1, updated_by = $3,
                    correlation_id = $4, updated_at = now()
              WHERE tenant_id = $1 AND id = $2`,
            [principal.tenantId, input.assetId, principal.subject, context.correlationId],
          );
          assetTakenOffline = true;
          await recordMutation(client, context, {
            action: 'CMMS_ASSET_TAKEN_OFFLINE', aggregateType: 'CMMS_ASSET', aggregateId: input.assetId,
            aggregateVersion: asset.version + 1, payload: { reason: 'CALIBRATION_FAILED', clientOperationId: input.clientOperationId },
          });
        }
      }

      const inserted = await client.query<{ id: string }>(
        `INSERT INTO gigalibs_cmms.calibration_records
           (tenant_id, asset_id, profile_id, profile_revision, definition, work_order_id, site_ref, department_id,
            technician, client_operation_id, request_sha256, started_at, completed_at, as_found_result, as_left_result,
            overall_result, impact_review_required, notes, technician_statement, record_sha256,
            corrective_work_order_id, asset_taken_offline, correlation_id)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
         RETURNING id`,
        [principal.tenantId, input.assetId, input.profileId, input.profileRevision, JSON.stringify(definition),
          input.workOrderId ?? null, asset.siteRef, asset.departmentId, principal.subject, input.clientOperationId,
          requestSha256, input.startedAt, input.completedAt, evaluation.asFoundResult, evaluation.asLeftResult,
          evaluation.overallResult, evaluation.impactReviewRequired, input.notes ?? null,
          CALIBRATION_TECHNICIAN_STATEMENT, recordSha256, correctiveWorkOrderId, assetTakenOffline, context.correlationId],
      );
      const recordId = inserted.rows[0]!.id;
      for (const standard of standardSnapshot)
        await client.query(
          `INSERT INTO gigalibs_cmms.calibration_record_standards
             (tenant_id, record_id, standard_id, code, name, certificate_number, valid_until)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [principal.tenantId, recordId, standard.id, standard.code, standard.name, standard.certificateNumber, standard.validUntil],
        );
      await client.query(
        `INSERT INTO gigalibs_cmms.calibration_points
           (tenant_id, record_id, phase, position, nominal_percent, applied_input, expected_output, measured_output,
            error_absolute, error_percent_span, within_tolerance)
         SELECT $1, $2, p.phase, p.position, p.nominal_percent, p.applied_input, p.expected_output, p.measured_output,
                p.error_absolute, p.error_percent_span, p.within_tolerance
           FROM jsonb_to_recordset($3::jsonb) AS p(phase text, position smallint, nominal_percent numeric,
                applied_input numeric, expected_output numeric, measured_output numeric, error_absolute numeric,
                error_percent_span numeric, within_tolerance boolean)`,
        [principal.tenantId, recordId, JSON.stringify(evaluation.points.map((point) => ({
          phase: point.phase, position: point.position, nominal_percent: point.nominalPercent,
          applied_input: point.appliedInput, expected_output: point.expectedOutput, measured_output: point.measuredOutput,
          error_absolute: point.errorAbsolute, error_percent_span: point.errorPercentSpan,
          within_tolerance: point.withinTolerance,
        })))],
      );
      await recordMutation(client, context, {
        action: 'CMMS_CALIBRATION_RECORDED', aggregateType: 'CMMS_CALIBRATION_RECORD', aggregateId: recordId,
        aggregateVersion: 1,
        payload: { assetId: input.assetId, profileRevision: input.profileRevision, overallResult: evaluation.overallResult,
          correctiveWorkOrderId, assetTakenOffline, impactReviewRequired: evaluation.impactReviewRequired },
      });
      return { replayed: false, record: await this.recordRow(client, principal, recordId) };
    });
  }

  async searchRecords(principal: CmmsPrincipal, raw: unknown): Promise<{ readonly items: readonly CalibrationRecordV1[]; readonly total: number; readonly page: number; readonly pageSize: number }> {
    const query = parseInput(SearchCalibrationRecordsV1Schema, raw);
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const values: unknown[] = [principal.tenantId];
      const where = ['r.tenant_id = $1', ...scopePredicates(principal, values, 'r.')];
      if (query.assetId) {
        values.push(query.assetId);
        where.push(`r.asset_id = $${values.length}`);
      }
      if (query.status) {
        values.push(query.status);
        where.push(`r.status = $${values.length}`);
      }
      const total = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM gigalibs_cmms.calibration_records r WHERE ${where.join(' AND ')}`, values);
      values.push(query.pageSize, (query.page - 1) * query.pageSize);
      const ids = await client.query<{ id: string }>(
        `SELECT r.id FROM gigalibs_cmms.calibration_records r WHERE ${where.join(' AND ')}
          ORDER BY r.completed_at DESC, r.id DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
        values,
      );
      const items: CalibrationRecordV1[] = [];
      for (const row of ids.rows) items.push(await this.recordRow(client, principal, row.id));
      return { items, total: Number(total.rows[0]?.count ?? 0), page: query.page, pageSize: query.pageSize };
    });
  }

  async getRecord(principal: CmmsPrincipal, recordId: string): Promise<CalibrationRecordV1> {
    assertUuid(recordId, 'recordId');
    return this.database.withTenantTransaction(principal.tenantId, (client) => this.recordRow(client, principal, recordId));
  }

  async decide(context: CmmsCommandContext, recordId: string, raw: unknown): Promise<CalibrationRecordV1> {
    assertUuid(recordId, 'recordId');
    const input = parseInput(DecideCalibrationRecordV1Schema, raw);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const values: unknown[] = [context.principal.tenantId, recordId];
      const where = ['r.tenant_id = $1', 'r.id = $2', ...scopePredicates(context.principal, values, 'r.')];
      const row = (await client.query(
        `SELECT r.technician, r.status, r.version, r.site_ref, r.department_id
           FROM gigalibs_cmms.calibration_records r WHERE ${where.join(' AND ')} FOR UPDATE OF r`,
        values,
      )).rows[0];
      if (!row) notFound('The calibration record');
      assertWritableScope(context.principal, { departmentId: row.department_id, siteRef: row.site_ref },
        undefined, undefined, { permission: 'cmms.calibration.approve' });
      if (row.status !== 'SUBMITTED') conflict('CMMS_CALIBRATION_DECIDED', 'This calibration record is already decided.');
      if (row.version !== input.expectedVersion) versionConflict('The calibration record');
      if (row.technician === context.principal.subject)
        throw new ForbiddenException({ code: 'CMMS_CALIBRATION_FOUR_EYES',
          message: 'A calibration record is decided by someone other than its technician.' });
      await client.query(
        `UPDATE gigalibs_cmms.calibration_records
            SET status = $3, decided_by = $4, decided_at = now(), decision_note = $5, decision_statement = $6,
                version = version + 1, correlation_id = $7, updated_at = now()
          WHERE tenant_id = $1 AND id = $2`,
        [context.principal.tenantId, recordId, input.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
          context.principal.subject, input.note ?? null, input.statement, context.correlationId],
      );
      await recordMutation(client, context, {
        action: input.decision === 'APPROVE' ? 'CMMS_CALIBRATION_APPROVED' : 'CMMS_CALIBRATION_REJECTED',
        aggregateType: 'CMMS_CALIBRATION_RECORD', aggregateId: recordId, aggregateVersion: row.version + 1,
        payload: { decision: input.decision },
      });
      return this.recordRow(client, context.principal, recordId);
    });
  }

  async certificate(principal: CmmsPrincipal, recordId: string): Promise<CalibrationCertificateV1> {
    const record = await this.getRecord(principal, recordId);
    if (record.status !== 'APPROVED')
      conflict('CMMS_CALIBRATION_NOT_APPROVED', 'A certificate exists only for an approved calibration.');
    return CalibrationCertificateV1Schema.parse({
      contractVersion: 'calibration-certificate.v1',
      certificateNumber: `CAL-${record.completedAt.slice(0, 10).replaceAll('-', '')}-${record.id.slice(0, 8).toUpperCase()}`,
      issuedAt: record.decidedAt,
      record,
      disclaimer: CERTIFICATE_DISCLAIMER,
    });
  }

  // ─── Rows ─────────────────────────────────────────────────────────────────────────────────────────────

  private async instruments(client: PoolClient, principal: CmmsPrincipal, assetId?: string): Promise<CalibrationInstrumentV1[]> {
    const values: unknown[] = [principal.tenantId];
    const where = ['a.tenant_id = $1', 'a.archived_at IS NULL', ...scopePredicates(principal, values, 'a.')];
    if (assetId) {
      values.push(assetId);
      where.push(`a.id = $${values.length}`);
    }
    const result = await client.query(
      `SELECT a.id, a.asset_tag, a.name, a.status, a.site_ref, a.department_id, p.id AS profile_id,
              p.revision AS profile_revision, p.interval_days, latest.completed_at AS latest_at,
              latest.overall_result AS latest_result, valid.completed_at AS valid_at,
              (SELECT count(*)::int FROM gigalibs_cmms.calibration_records w
                WHERE w.tenant_id = a.tenant_id AND w.asset_id = a.id AND w.status = 'SUBMITTED') AS awaiting
         FROM gigalibs_cmms.assets a
         JOIN gigalibs_cmms.calibration_profiles p
           ON p.tenant_id = a.tenant_id AND p.asset_id = a.id AND p.status = 'PUBLISHED'
         LEFT JOIN LATERAL (
           SELECT r.completed_at, r.overall_result FROM gigalibs_cmms.calibration_records r
            WHERE r.tenant_id = a.tenant_id AND r.asset_id = a.id AND r.status <> 'REJECTED'
            ORDER BY r.completed_at DESC, r.id DESC LIMIT 1) latest ON true
         LEFT JOIN LATERAL (
           SELECT r.completed_at FROM gigalibs_cmms.calibration_records r
            WHERE r.tenant_id = a.tenant_id AND r.asset_id = a.id AND r.status = 'APPROVED'
              AND r.overall_result IN ('PASS', 'ADJUSTED')
            ORDER BY r.completed_at DESC, r.id DESC LIMIT 1) valid ON true
        WHERE ${where.join(' AND ')}
        ORDER BY a.asset_tag ASC LIMIT 500`,
      values,
    );
    const now = new Date();
    return result.rows
      .map((row): CalibrationInstrumentV1 => {
        const due = dueState(row.latest_result, row.valid_at ? new Date(row.valid_at) : null, row.interval_days, now);
        return {
          assetId: row.id, assetTag: row.asset_tag, assetName: row.name, assetStatus: row.status,
          siteRef: row.site_ref, departmentId: row.department_id, profileId: row.profile_id,
          profileRevision: row.profile_revision, intervalDays: row.interval_days,
          lastCalibratedAt: isoOrNull(row.latest_at), lastResult: row.latest_result ?? null,
          nextDueAt: due.nextDueAt, dueState: due.state, awaitingApproval: row.awaiting,
        };
      })
      .sort((left, right) => (left.nextDueAt ?? '').localeCompare(right.nextDueAt ?? '') ||
        left.assetTag.localeCompare(right.assetTag));
  }

  private async replay(client: PoolClient, principal: CmmsPrincipal, clientOperationId: string, requestSha256: string): Promise<CalibrationRecordV1 | null> {
    const existing = (await client.query<{ id: string; request_sha256: string; technician: string }>(
      `SELECT id, request_sha256, technician FROM gigalibs_cmms.calibration_records
        WHERE tenant_id = $1 AND client_operation_id = $2`,
      [principal.tenantId, clientOperationId],
    )).rows[0];
    if (!existing) return null;
    if (existing.request_sha256 !== requestSha256 || existing.technician !== principal.subject)
      conflict('CMMS_CALIBRATION_OPERATION_REUSED', 'This capture id was already used for a different calibration.');
    return this.recordRow(client, principal, existing.id);
  }

  private async standardRow(client: PoolClient, principal: CmmsPrincipal, standardId: string, lock: boolean): Promise<CalibrationStandardV1> {
    const values: unknown[] = [principal.tenantId, standardId];
    const where = ['s.tenant_id = $1', 's.id = $2', ...scopePredicates(principal, values, 's.')];
    const result = await client.query(
      `SELECT ${STANDARD_COLUMNS} FROM gigalibs_cmms.calibration_standards s WHERE ${where.join(' AND ')}${lock ? ' FOR UPDATE OF s' : ''}`,
      values,
    );
    if (!result.rows[0]) notFound('The standard');
    return mapStandard(result.rows[0]);
  }

  private async profileDbRow(client: PoolClient, principal: CmmsPrincipal, profileId: string, lock: boolean): Promise<Record<string, any>> {
    const values: unknown[] = [principal.tenantId, profileId];
    const where = ['p.tenant_id = $1', 'p.id = $2', ...scopePredicates(principal, values, 'a.')];
    const result = await client.query(
      `SELECT ${PROFILE_COLUMNS} FROM gigalibs_cmms.calibration_profiles p
         JOIN gigalibs_cmms.assets a ON a.tenant_id = p.tenant_id AND a.id = p.asset_id
        WHERE ${where.join(' AND ')}${lock ? ' FOR UPDATE OF p' : ''}`,
      values,
    );
    if (!result.rows[0]) notFound('The calibration profile');
    return result.rows[0];
  }

  private async profileRow(client: PoolClient, principal: CmmsPrincipal, profileId: string, lock: boolean): Promise<CalibrationProfileV1> {
    return mapProfile(await this.profileDbRow(client, principal, profileId, lock));
  }

  private async recordRow(client: PoolClient, principal: CmmsPrincipal, recordId: string): Promise<CalibrationRecordV1> {
    const values: unknown[] = [principal.tenantId, recordId];
    const where = ['r.tenant_id = $1', 'r.id = $2', ...scopePredicates(principal, values, 'r.')];
    const row = (await client.query(
      `SELECT ${RECORD_COLUMNS} FROM gigalibs_cmms.calibration_records r
         JOIN gigalibs_cmms.assets a ON a.tenant_id = r.tenant_id AND a.id = r.asset_id
        WHERE ${where.join(' AND ')}`,
      values,
    )).rows[0];
    if (!row) notFound('The calibration record');
    const standards = await client.query(
      `SELECT standard_id, code, name, certificate_number, valid_until::text AS valid_until
         FROM gigalibs_cmms.calibration_record_standards WHERE tenant_id = $1 AND record_id = $2 ORDER BY code`,
      [principal.tenantId, recordId],
    );
    const points = await client.query(
      `SELECT phase, position, nominal_percent, applied_input, expected_output, measured_output, error_absolute,
              error_percent_span, within_tolerance
         FROM gigalibs_cmms.calibration_points WHERE tenant_id = $1 AND record_id = $2
        ORDER BY CASE phase WHEN 'AS_FOUND' THEN 0 ELSE 1 END, position`,
      [principal.tenantId, recordId],
    );
    return {
      id: row.id, assetId: row.asset_id, assetTag: row.asset_tag, assetName: row.asset_name,
      profileId: row.profile_id, profileRevision: row.profile_revision,
      definition: CalibrationDefinitionV1Schema.parse(row.definition),
      workOrderId: row.work_order_id, technician: row.technician, startedAt: iso(row.started_at),
      completedAt: iso(row.completed_at), receivedAt: iso(row.received_at), status: row.status,
      asFoundResult: row.as_found_result, asLeftResult: row.as_left_result, overallResult: row.overall_result,
      impactReviewRequired: row.impact_review_required,
      standards: standards.rows.map((standard) => ({ id: standard.standard_id, code: standard.code, name: standard.name,
        certificateNumber: standard.certificate_number, validUntil: standard.valid_until })),
      points: points.rows.map((point) => ({
        phase: point.phase, position: point.position, nominalPercent: num(point.nominal_percent),
        appliedInput: num(point.applied_input), expectedOutput: num(point.expected_output),
        measuredOutput: num(point.measured_output), errorAbsolute: num(point.error_absolute),
        errorPercentSpan: num(point.error_percent_span), withinTolerance: point.within_tolerance,
      })),
      notes: row.notes, technicianStatement: row.technician_statement, recordSha256: row.record_sha256,
      correctiveWorkOrderId: row.corrective_work_order_id, assetTakenOffline: row.asset_taken_offline,
      decidedBy: row.decided_by, decidedAt: isoOrNull(row.decided_at), decisionNote: row.decision_note,
      decisionStatement: row.decision_statement, version: row.version,
    };
  }
}
