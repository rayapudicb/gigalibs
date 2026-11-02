import { createHash, randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import {
  CancelPermitV1Schema,
  CreateIsolationProcedureV1Schema,
  GAS_TESTED_TYPES,
  GAS_TEST_MAX_AGE_MINUTES,
  GasTestV1InputSchema,
  IsolationPointsV1Schema,
  LockIsolationV1Schema,
  PERMIT_PHOTO_MAX_BYTES,
  PermitDecisionV1Schema,
  PermitVersionV1Schema,
  RequestPermitV1Schema,
  UpdateIsolationProcedureV1Schema,
  VerifyIsolationV1Schema,
  gasWithinLimits,
  sniffDiagramImage,
  type IsolationProcedureV1,
  type PermitV1,
  type WorkPermitTypeV1,
} from '@gigalibs/contracts';
import type { PoolClient } from 'pg';
import type { CmmsCommandContext, CmmsPrincipal } from '../auth/authorization.js';
import { assertWorkspaceWide, assertWritableScope, scopePredicates } from '../auth/scope.js';
import { AssetsService } from '../assets/assets.service.js';
import { assertUuid, iso, isoOrNull, notFound, parseInput, recordMutation, versionConflict } from '../common/command.js';
import { DatabaseService } from '../database/database.service.js';
import { WorkOrdersService } from '../work-orders/work-orders.service.js';

// WI-OI-142 M-LOTO (CMMS M-CM2). Isolation procedures are shared reference data published by someone who wrote none of
// them. A permit pins a published procedure; every point is locked (serial and photo) and verified at zero energy
// before approval; the requester, the issuer who authorizes and the area lead who countersigns are three people;
// personal locks are signed on while the permit is live; de-isolation waits for every personal lock to come off.

const MINUTE_MS = 60_000;
const ACTIVE = ['DRAFT', 'ISOLATING', 'AWAITING_APPROVAL', 'LIVE', 'DE_ISOLATING'] as const;
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');

function conflict(code: string, message: string): never {
  throw new ConflictException({ code: `CMMS_PERMIT_${code}`, message });
}
function fourEyes(message: string): never {
  throw new ForbiddenException({ code: 'CMMS_PERMIT_FOUR_EYES', message });
}

function mapProcedure(row: Record<string, any>): IsolationProcedureV1 {
  return {
    id: row.id, code: row.code, title: row.title, revision: row.revision, status: row.status, assetId: row.asset_id,
    points: IsolationPointsV1Schema.parse(row.points), authoredBy: row.authored_by, publishedBy: row.published_by,
    version: row.version, updatedAt: iso(row.updated_at),
  };
}

@Injectable()
export class PermitsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly assets: AssetsService,
    private readonly workOrders: WorkOrdersService,
  ) {}

  // ─── Isolation procedures (shared reference data) ────────────────────────────────────────────────────

  async listProcedures(principal: CmmsPrincipal, status?: string): Promise<{ readonly items: readonly IsolationProcedureV1[] }> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const values: unknown[] = [principal.tenantId];
      let filter = "AND status <> 'SUPERSEDED'";
      if (status && ['DRAFT', 'PUBLISHED', 'SUPERSEDED', 'RETIRED'].includes(status)) {
        values.push(status);
        filter = `AND status = $${values.length}`;
      }
      const rows = await client.query(
        `SELECT * FROM gigalibs_cmms.isolation_procedures WHERE tenant_id = $1 ${filter} ORDER BY code, revision DESC LIMIT 500`, values);
      return { items: rows.rows.map(mapProcedure) };
    });
  }

  async createProcedure(context: CmmsCommandContext, raw: unknown): Promise<IsolationProcedureV1> {
    const input = parseInput(CreateIsolationProcedureV1Schema, raw);
    assertWorkspaceWide(context.principal);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      if (input.assetId) await this.assets.visibleAsset(client, context.principal, input.assetId, false);
      const next = await this.nextRevision(client, context.principal.tenantId, input.code);
      const id = await this.insertDraft(() => client.query<{ id: string }>(
        `INSERT INTO gigalibs_cmms.isolation_procedures (tenant_id, code, title, revision, asset_id, points, authored_by, last_edited_by,
           updated_by, correlation_id) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $7, $7, $8) RETURNING id`,
        [context.principal.tenantId, input.code, input.title, next, input.assetId ?? null, JSON.stringify(input.points),
          context.principal.subject, context.correlationId]));
      await this.audit(client, context, 'CMMS_ISOLATION_PROCEDURE_DRAFTED', 'CMMS_ISOLATION_PROCEDURE', id, 1, { code: input.code, revision: next });
      return this.procedureRow(client, context.principal.tenantId, id, false);
    });
  }

  async updateProcedure(context: CmmsCommandContext, procedureId: string, raw: unknown): Promise<IsolationProcedureV1> {
    assertUuid(procedureId, 'procedureId');
    const input = parseInput(UpdateIsolationProcedureV1Schema, raw);
    assertWorkspaceWide(context.principal);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const current = await this.lockProcedure(client, context, procedureId, 'DRAFT', input.expectedVersion);
      await client.query(
        `UPDATE gigalibs_cmms.isolation_procedures SET title = $3, points = $4::jsonb, last_edited_by = $5, updated_by = $5,
                correlation_id = $6, version = version + 1, updated_at = now() WHERE tenant_id = $1 AND id = $2`,
        [context.principal.tenantId, procedureId, input.title ?? current.title, JSON.stringify(input.points ?? current.points),
          context.principal.subject, context.correlationId]);
      await this.audit(client, context, 'CMMS_ISOLATION_PROCEDURE_EDITED', 'CMMS_ISOLATION_PROCEDURE', procedureId, current.version + 1, {});
      return this.procedureRow(client, context.principal.tenantId, procedureId, false);
    });
  }

  async publishProcedure(context: CmmsCommandContext, procedureId: string, raw: unknown): Promise<IsolationProcedureV1> {
    assertUuid(procedureId, 'procedureId');
    const input = parseInput(PermitVersionV1Schema, raw);
    assertWorkspaceWide(context.principal);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const current = await this.lockProcedure(client, context, procedureId, 'DRAFT', input.expectedVersion);
      const editors = (await client.query<{ authored_by: string; last_edited_by: string }>(
        'SELECT authored_by, last_edited_by FROM gigalibs_cmms.isolation_procedures WHERE tenant_id = $1 AND id = $2',
        [context.principal.tenantId, procedureId])).rows[0]!;
      if ([editors.authored_by, editors.last_edited_by].includes(context.principal.subject))
        fourEyes('An isolation procedure is published by someone who did not write it.');
      await client.query(
        `UPDATE gigalibs_cmms.isolation_procedures SET status = 'SUPERSEDED', version = version + 1, updated_by = $3, correlation_id = $4,
                updated_at = now() WHERE tenant_id = $1 AND code = $2 AND status = 'PUBLISHED'`,
        [context.principal.tenantId, current.code, context.principal.subject, context.correlationId]);
      await client.query(
        `UPDATE gigalibs_cmms.isolation_procedures SET status = 'PUBLISHED', published_by = $3, published_at = now(), updated_by = $3,
                correlation_id = $4, version = version + 1, updated_at = now() WHERE tenant_id = $1 AND id = $2`,
        [context.principal.tenantId, procedureId, context.principal.subject, context.correlationId]);
      await this.audit(client, context, 'CMMS_ISOLATION_PROCEDURE_PUBLISHED', 'CMMS_ISOLATION_PROCEDURE', procedureId, current.version + 1,
        { code: current.code, revision: current.revision });
      return this.procedureRow(client, context.principal.tenantId, procedureId, false);
    });
  }

  async reviseProcedure(context: CmmsCommandContext, procedureId: string, raw: unknown): Promise<IsolationProcedureV1> {
    assertUuid(procedureId, 'procedureId');
    const input = parseInput(PermitVersionV1Schema, raw);
    assertWorkspaceWide(context.principal);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const source = await this.lockProcedure(client, context, procedureId, 'PUBLISHED', input.expectedVersion);
      const next = await this.nextRevision(client, context.principal.tenantId, source.code);
      const id = await this.insertDraft(() => client.query<{ id: string }>(
        `INSERT INTO gigalibs_cmms.isolation_procedures (tenant_id, code, title, revision, asset_id, points, authored_by, last_edited_by,
           updated_by, correlation_id)
         SELECT tenant_id, code, title, $3, asset_id, points, $4, $4, $4, $5 FROM gigalibs_cmms.isolation_procedures
          WHERE tenant_id = $1 AND id = $2 RETURNING id`,
        [context.principal.tenantId, procedureId, next, context.principal.subject, context.correlationId]));
      await this.audit(client, context, 'CMMS_ISOLATION_PROCEDURE_DRAFTED', 'CMMS_ISOLATION_PROCEDURE', id, 1, { code: source.code, revision: next });
      return this.procedureRow(client, context.principal.tenantId, id, false);
    });
  }

  // ─── Permits ──────────────────────────────────────────────────────────────────────────────────────────

  async request(context: CmmsCommandContext, raw: unknown, now = new Date()): Promise<{ replayed: boolean; permit: PermitV1 }> {
    const input = parseInput(RequestPermitV1Schema, raw);
    const principal = context.principal;
    if (Date.parse(input.validUntil) <= now.getTime()) conflict('EXPIRED', 'The permit would already have ended.');
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const replay = (await client.query<{ id: string; procedure_id: string }>(
        'SELECT id, procedure_id FROM gigalibs_cmms.permits WHERE tenant_id = $1 AND requested_by = $2 AND client_operation_id = $3',
        [principal.tenantId, principal.subject, input.clientOperationId])).rows[0];
      if (replay) {
        if (replay.procedure_id !== input.procedureId) conflict('OPERATION_REUSED', 'This capture id was already used for a different permit.');
        return { replayed: true, permit: await this.permitRow(client, principal, replay.id) };
      }
      const procedure = await this.procedureRow(client, principal.tenantId, input.procedureId, false);
      if (procedure.status !== 'PUBLISHED') conflict('PROCEDURE_NOT_PUBLISHED', 'Only a published isolation procedure is used for a permit.');
      let assetId = procedure.assetId;
      let siteRef: string | null = null;
      let departmentId: string | null = null;
      if (input.workOrderId) {
        const workOrder = await this.workOrders.detailWithClient(client, principal, input.workOrderId);
        if (workOrder.status === 'COMPLETED' || workOrder.status === 'CANCELLED') conflict('WO_CLOSED', 'The work order is closed.');
        assetId ??= workOrder.assetId ?? null;
        siteRef = workOrder.siteRef ?? null;
        departmentId = workOrder.departmentId ?? null;
      }
      if (assetId) {
        const asset = await this.assets.visibleAsset(client, principal, assetId, false);
        siteRef ??= asset.siteRef;
        departmentId ??= asset.departmentId;
      }
      assertWritableScope(principal, { departmentId, siteRef }, undefined, undefined, { permission: 'cmms.permits.request' });
      const counter = await client.query<{ last_value: string }>(
        `INSERT INTO gigalibs_cmms.permit_counters AS c (tenant_id, last_value) VALUES ($1, 1)
         ON CONFLICT (tenant_id) DO UPDATE SET last_value = c.last_value + 1 RETURNING last_value`, [principal.tenantId]);
      const number = `PTW-${String(counter.rows[0]!.last_value).padStart(6, '0')}`;
      const id = randomUUID();
      await client.query(
        `INSERT INTO gigalibs_cmms.permits (tenant_id, id, permit_number, client_operation_id, type, title, description, procedure_id,
           work_order_id, asset_id, site_ref, department_id, valid_from, valid_until, requested_by, updated_by, correlation_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $15, $16)`,
        [principal.tenantId, id, number, input.clientOperationId, input.type, input.title, input.description ?? null, procedure.id,
          input.workOrderId ?? null, assetId, siteRef, departmentId, input.validFrom, input.validUntil, principal.subject, context.correlationId]);
      for (const [sequence, point] of procedure.points.entries())
        await client.query(
          `INSERT INTO gigalibs_cmms.permit_isolations (tenant_id, permit_id, point_key, sequence, label, energy, isolation_tag, method)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [principal.tenantId, id, point.key, sequence, point.label, point.energy, point.isolationTag, point.method]);
      await this.audit(client, context, 'CMMS_PERMIT_REQUESTED', 'CMMS_PERMIT', id, 1, { number, type: input.type, procedureId: procedure.id });
      return { replayed: false, permit: await this.permitRow(client, principal, id) };
    });
  }

  async lockPoint(context: CmmsCommandContext, permitId: string, pointKey: string, raw: unknown): Promise<PermitV1> {
    const input = parseInput(LockIsolationV1Schema, raw);
    const bytes = Buffer.from(input.photoBase64, 'base64');
    if (bytes.length < 16 || bytes.length > PERMIT_PHOTO_MAX_BYTES || sniffDiagramImage(bytes) !== input.photoContentType)
      throw new BadRequestException({ code: 'CMMS_PERMIT_PHOTO_INVALID', message: 'The lock photo must be a PNG, JPEG or WebP of at most 300 KB.' });
    return this.changePoint(context, permitId, pointKey, input.expectedVersion, 'cmms.permits.request', async (client, permit, point) => {
      if (!['DRAFT', 'ISOLATING'].includes(permit.status)) conflict('STATE', 'Points are locked while the permit is being isolated.');
      if (point.status !== 'PENDING') conflict('POINT_STATE', 'This point is already locked.');
      await client.query(
        `UPDATE gigalibs_cmms.permit_isolations SET status = 'LOCKED', lock_serial = $4, locked_by = $5, locked_at = now(), version = version + 1
          WHERE tenant_id = $1 AND permit_id = $2 AND point_key = $3`,
        [context.principal.tenantId, permitId, pointKey, input.lockSerial, context.principal.subject]);
      await client.query(
        `INSERT INTO gigalibs_cmms.permit_lock_photos (tenant_id, permit_id, point_key, content_type, bytes, sha256) VALUES ($1, $2, $3, $4, $5, $6)`,
        [context.principal.tenantId, permitId, pointKey, input.photoContentType, bytes, sha256(bytes)]);
      if (permit.status === 'DRAFT') await this.setStatus(client, context, permitId, 'ISOLATING');
      return 'CMMS_PERMIT_POINT_LOCKED';
    });
  }

  async verifyPoint(context: CmmsCommandContext, permitId: string, pointKey: string, raw: unknown): Promise<PermitV1> {
    const input = parseInput(VerifyIsolationV1Schema, raw);
    return this.changePoint(context, permitId, pointKey, input.expectedVersion, 'cmms.permits.request', async (client, permit, point) => {
      if (!['DRAFT', 'ISOLATING'].includes(permit.status)) conflict('STATE', 'Points are verified while the permit is being isolated.');
      if (point.status !== 'LOCKED') conflict('POINT_STATE', 'Lock this point before the try step.');
      await client.query(
        `UPDATE gigalibs_cmms.permit_isolations SET status = 'VERIFIED', verified_by = $4, verified_at = now(), version = version + 1
          WHERE tenant_id = $1 AND permit_id = $2 AND point_key = $3`, [context.principal.tenantId, permitId, pointKey, context.principal.subject]);
      const pending = (await client.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM gigalibs_cmms.permit_isolations WHERE tenant_id = $1 AND permit_id = $2 AND status <> 'VERIFIED'`,
        [context.principal.tenantId, permitId])).rows[0]!.n;
      if (pending === 0) await this.setStatus(client, context, permitId, 'AWAITING_APPROVAL');
      return 'CMMS_PERMIT_POINT_VERIFIED';
    });
  }

  /** A second person (the issuer or a safety officer) witnesses a verified point. */
  async witnessPoint(context: CmmsCommandContext, permitId: string, pointKey: string, raw: unknown): Promise<PermitV1> {
    const input = parseInput(PermitVersionV1Schema, raw);
    return this.changePoint(context, permitId, pointKey, input.expectedVersion, 'cmms.permits.authorize', async (client, _permit, point) => {
      if (point.status !== 'VERIFIED') conflict('POINT_STATE', 'Only a verified point is witnessed.');
      if (point.verifiedBy === context.principal.subject) fourEyes('A second person witnesses the try step.');
      if (point.witnessedBy) conflict('POINT_STATE', 'This point is already witnessed.');
      await client.query(
        `UPDATE gigalibs_cmms.permit_isolations SET witnessed_by = $4, version = version + 1
          WHERE tenant_id = $1 AND permit_id = $2 AND point_key = $3`, [context.principal.tenantId, permitId, pointKey, context.principal.subject]);
      return 'CMMS_PERMIT_POINT_WITNESSED';
    });
  }

  async removeLock(context: CmmsCommandContext, permitId: string, pointKey: string, raw: unknown): Promise<PermitV1> {
    const input = parseInput(PermitVersionV1Schema, raw);
    return this.changePoint(context, permitId, pointKey, input.expectedVersion, 'cmms.permits.request', async (client, permit, point) => {
      if (!['ISOLATING', 'AWAITING_APPROVAL', 'DE_ISOLATING'].includes(permit.status))
        conflict('STATE', 'Locks come off during de-isolation, or before approval to cancel.');
      if (!['LOCKED', 'VERIFIED'].includes(point.status)) conflict('POINT_STATE', 'This point carries no lock.');
      await client.query(
        `UPDATE gigalibs_cmms.permit_isolations SET status = 'REMOVED', removed_by = $4, removed_at = now(), version = version + 1
          WHERE tenant_id = $1 AND permit_id = $2 AND point_key = $3`, [context.principal.tenantId, permitId, pointKey, context.principal.subject]);
      return 'CMMS_PERMIT_LOCK_REMOVED';
    });
  }

  async gasTest(context: CmmsCommandContext, permitId: string, raw: unknown, now = new Date()): Promise<PermitV1> {
    assertUuid(permitId, 'permitId');
    const input = parseInput(GasTestV1InputSchema, raw);
    if (Date.parse(input.testedAt) > now.getTime() + 5 * MINUTE_MS) conflict('CLOCK', 'The test time is in the future; check the device clock.');
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const permit = await this.lockPermit(client, context.principal, permitId, 'cmms.permits.request');
      if (!['ISOLATING', 'AWAITING_APPROVAL', 'LIVE'].includes(permit.status)) conflict('STATE', 'Gas is tested while the permit is active.');
      const limits = gasWithinLimits(input);
      const inserted = await client.query(
        `INSERT INTO gigalibs_cmms.permit_gas_tests (tenant_id, permit_id, client_operation_id, oxygen_percent, lel_percent, co_ppm, h2s_ppm,
           within_limits, tested_by, tested_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (tenant_id, permit_id, client_operation_id) DO NOTHING`,
        [context.principal.tenantId, permitId, input.clientOperationId, input.oxygenPercent, input.lelPercent, input.coPpm, input.h2sPpm,
          limits.withinLimits, context.principal.subject, input.testedAt]);
      if (inserted.rowCount)
        await recordMutation(client, context, { action: 'CMMS_PERMIT_GAS_TESTED', aggregateType: 'CMMS_PERMIT_GAS_TEST',
          aggregateId: `${permitId}:${input.clientOperationId}`, aggregateVersion: 1, payload: { withinLimits: limits.withinLimits, flags: limits.flags } });
      return this.permitRow(client, context.principal, permitId);
    });
  }

  async authorize(context: CmmsCommandContext, permitId: string, raw: unknown, now = new Date()): Promise<PermitV1> {
    const input = parseInput(PermitDecisionV1Schema, raw);
    return this.decide(context, permitId, input.expectedVersion, 'cmms.permits.authorize', async (client, permit) => {
      if (permit.status !== 'AWAITING_APPROVAL') conflict('STATE', 'Only a fully isolated and verified permit is authorized.');
      if (permit.authorizedBy) conflict('STATE', 'This permit is already authorized.');
      if (permit.requestedBy === context.principal.subject) fourEyes('Someone other than the requester authorizes the permit.');
      this.assertReady(permit, now);
      await client.query(
        `UPDATE gigalibs_cmms.permits SET authorized_by = $3, authorized_at = now(), updated_by = $3, correlation_id = $4, version = version + 1
          WHERE tenant_id = $1 AND id = $2`, [context.principal.tenantId, permitId, context.principal.subject, context.correlationId]);
      return 'CMMS_PERMIT_AUTHORIZED';
    });
  }

  async countersign(context: CmmsCommandContext, permitId: string, raw: unknown, now = new Date()): Promise<PermitV1> {
    const input = parseInput(PermitDecisionV1Schema, raw);
    return this.decide(context, permitId, input.expectedVersion, 'cmms.permits.countersign', async (client, permit) => {
      if (permit.status !== 'AWAITING_APPROVAL') conflict('STATE', 'Only a permit awaiting approval is countersigned.');
      if (!permit.authorizedBy) conflict('NOT_AUTHORIZED', 'The issuer authorizes the permit before the area lead countersigns it.');
      if ([permit.requestedBy, permit.authorizedBy].includes(context.principal.subject))
        fourEyes('A third person, neither requester nor issuer, countersigns the permit.');
      this.assertReady(permit, now);
      await client.query(
        `UPDATE gigalibs_cmms.permits SET countersigned_by = $3, countersigned_at = now(), status = 'LIVE', live_at = now(), updated_by = $3,
                correlation_id = $4, version = version + 1 WHERE tenant_id = $1 AND id = $2`,
        [context.principal.tenantId, permitId, context.principal.subject, context.correlationId]);
      return 'CMMS_PERMIT_LIVE';
    });
  }

  async lockOn(context: CmmsCommandContext, permitId: string, now = new Date()): Promise<PermitV1> {
    return this.personalLock(context, permitId, 'ON', now);
  }

  async lockOff(context: CmmsCommandContext, permitId: string, now = new Date()): Promise<PermitV1> {
    return this.personalLock(context, permitId, 'OFF', now);
  }

  async startDeIsolation(context: CmmsCommandContext, permitId: string, raw: unknown): Promise<PermitV1> {
    const input = parseInput(PermitVersionV1Schema, raw);
    return this.decide(context, permitId, input.expectedVersion, 'cmms.permits.request', async (client, permit) => {
      if (permit.status !== 'LIVE') conflict('STATE', 'Only a live permit is de-isolated.');
      if (permit.personalLocks.length > 0)
        conflict('LOCKS_ON', `Everyone signs their lock off first: ${permit.personalLocks.map((lock) => lock.subject).join(', ')}.`);
      await this.setStatus(client, context, permitId, 'DE_ISOLATING', false);
      return 'CMMS_PERMIT_DE_ISOLATING';
    });
  }

  async close(context: CmmsCommandContext, permitId: string, raw: unknown): Promise<PermitV1> {
    const input = parseInput(PermitVersionV1Schema, raw);
    return this.decide(context, permitId, input.expectedVersion, 'cmms.permits.authorize', async (client, permit) => {
      if (permit.status !== 'DE_ISOLATING') conflict('STATE', 'A permit closes after de-isolation.');
      if (permit.isolations.some((point) => point.status !== 'REMOVED')) conflict('LOCKS_APPLIED', 'Remove every isolation lock first.');
      await client.query(
        `UPDATE gigalibs_cmms.permits SET status = 'CLOSED', closed_by = $3, closed_at = now(), updated_by = $3, correlation_id = $4,
                version = version + 1 WHERE tenant_id = $1 AND id = $2`, [context.principal.tenantId, permitId, context.principal.subject, context.correlationId]);
      return 'CMMS_PERMIT_CLOSED';
    });
  }

  async cancel(context: CmmsCommandContext, permitId: string, raw: unknown): Promise<PermitV1> {
    const input = parseInput(CancelPermitV1Schema, raw);
    return this.decide(context, permitId, input.expectedVersion, 'cmms.permits.request', async (client, permit) => {
      if (!['DRAFT', 'ISOLATING', 'AWAITING_APPROVAL'].includes(permit.status)) conflict('STATE', 'A live permit is de-isolated, not cancelled.');
      if (permit.isolations.some((point) => point.status === 'LOCKED' || point.status === 'VERIFIED'))
        conflict('LOCKS_APPLIED', 'Remove every isolation lock before cancelling.');
      await client.query(
        `UPDATE gigalibs_cmms.permits SET status = 'CANCELLED', cancel_reason = $3, updated_by = $4, correlation_id = $5, version = version + 1
          WHERE tenant_id = $1 AND id = $2`, [context.principal.tenantId, permitId, input.reason, context.principal.subject, context.correlationId]);
      return 'CMMS_PERMIT_CANCELLED';
    });
  }

  async list(principal: CmmsPrincipal, query: { status?: string; mine?: string }): Promise<{ readonly items: readonly PermitV1[] }> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const values: unknown[] = [principal.tenantId];
      const where = ['p.tenant_id = $1', ...scopePredicates(principal, values, 'p.')];
      if (query.status === 'ACTIVE') where.push(`p.status IN (${ACTIVE.map((status) => `'${status}'`).join(', ')})`);
      else if (query.status && ['DRAFT', 'ISOLATING', 'AWAITING_APPROVAL', 'LIVE', 'DE_ISOLATING', 'CLOSED', 'CANCELLED'].includes(query.status)) {
        values.push(query.status);
        where.push(`p.status = $${values.length}`);
      } else where.push("p.created_at > now() - interval '90 days'");
      if (query.mine === 'true') {
        values.push(principal.subject);
        where.push(`(p.requested_by = $${values.length} OR EXISTS (SELECT 1 FROM gigalibs_cmms.permit_lock_events e
          WHERE e.tenant_id = p.tenant_id AND e.permit_id = p.id AND e.subject = $${values.length}))`);
      }
      const ids = await client.query<{ id: string }>(
        `SELECT p.id FROM gigalibs_cmms.permits p WHERE ${where.join(' AND ')} ORDER BY p.valid_until DESC LIMIT 300`, values);
      const items: PermitV1[] = [];
      for (const row of ids.rows) items.push(await this.permitRow(client, principal, row.id));
      return { items };
    });
  }

  async get(principal: CmmsPrincipal, permitId: string): Promise<PermitV1> {
    assertUuid(permitId, 'permitId');
    return this.database.withTenantTransaction(principal.tenantId, (client) => this.permitRow(client, principal, permitId));
  }

  async lockPhoto(principal: CmmsPrincipal, permitId: string, pointKey: string) {
    assertUuid(permitId, 'permitId');
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      await this.permitRow(client, principal, permitId);
      const row = (await client.query<{ content_type: string; bytes: Buffer; sha256: string }>(
        'SELECT content_type, bytes, sha256 FROM gigalibs_cmms.permit_lock_photos WHERE tenant_id = $1 AND permit_id = $2 AND point_key = $3',
        [principal.tenantId, permitId, pointKey])).rows[0];
      if (!row) notFound('The lock photo');
      return { contentType: row.content_type, base64: row.bytes.toString('base64'), sha256: row.sha256 };
    });
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────────────────────────────

  /** Before approval: not expired, a recent in-limit gas test where one is needed, no clash with a permit restoring energy. */
  private assertReady(permit: PermitV1, now: Date): void {
    if (Date.parse(permit.validUntil) <= now.getTime()) conflict('EXPIRED', 'This permit has expired; request a new one.');
    if (GAS_TESTED_TYPES.includes(permit.type as WorkPermitTypeV1)) {
      const latest = permit.gasTests[0];
      if (!latest || !latest.withinLimits || now.getTime() - Date.parse(latest.testedAt) > GAS_TEST_MAX_AGE_MINUTES * MINUTE_MS)
        conflict('GAS_TEST', 'Test the atmosphere (in limits, within the last 2 hours) before approval.');
    }
    const restoring = permit.clashes.find((clash) => clash.status === 'DE_ISOLATING');
    if (restoring) conflict('CLASH', `${restoring.number} is restoring energy at ${restoring.isolationTag}; wait for it to close.`);
  }

  private async personalLock(context: CmmsCommandContext, permitId: string, kind: 'ON' | 'OFF', now: Date): Promise<PermitV1> {
    assertUuid(permitId, 'permitId');
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const permit = await this.lockPermit(client, context.principal, permitId, 'cmms.permits.lock');
      const isOn = permit.personalLocks.some((lock) => lock.subject === context.principal.subject);
      if (kind === 'ON') {
        if (permit.status !== 'LIVE') conflict('STATE', 'Sign your lock on only while the permit is live.');
        if (Date.parse(permit.validUntil) <= now.getTime()) conflict('EXPIRED', 'This permit has expired.');
        if (isOn) return permit;
      } else if (!isOn) return permit;
      const id = randomUUID();
      await client.query('INSERT INTO gigalibs_cmms.permit_lock_events (tenant_id, id, permit_id, subject, kind) VALUES ($1, $2, $3, $4, $5)',
        [context.principal.tenantId, id, permitId, context.principal.subject, kind]);
      await recordMutation(client, context, { action: kind === 'ON' ? 'CMMS_PERMIT_LOCK_ON' : 'CMMS_PERMIT_LOCK_OFF',
        aggregateType: 'CMMS_PERMIT_LOCK_EVENT', aggregateId: id, aggregateVersion: 1, payload: { permitId } });
      return this.permitRow(client, context.principal, permitId);
    });
  }

  private changePoint(
    context: CmmsCommandContext, permitId: string, pointKey: string, expectedVersion: number, permission: string,
    apply: (client: PoolClient, permit: PermitV1, point: PermitV1['isolations'][number]) => Promise<string>,
  ): Promise<PermitV1> {
    assertUuid(permitId, 'permitId');
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const permit = await this.lockPermit(client, context.principal, permitId, permission);
      const point = permit.isolations.find((item) => item.pointKey === pointKey);
      if (!point) notFound('The isolation point');
      if (point.version !== expectedVersion) versionConflict('The isolation point');
      const action = await apply(client, permit, point);
      await recordMutation(client, context, { action, aggregateType: 'CMMS_PERMIT_ISOLATION', aggregateId: `${permitId}:${pointKey}`,
        aggregateVersion: point.version + 1, payload: { pointKey } });
      return this.permitRow(client, context.principal, permitId);
    });
  }

  private decide(
    context: CmmsCommandContext, permitId: string, expectedVersion: number, permission: string,
    apply: (client: PoolClient, permit: PermitV1) => Promise<string>,
  ): Promise<PermitV1> {
    assertUuid(permitId, 'permitId');
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const permit = await this.lockPermit(client, context.principal, permitId, permission);
      if (permit.version !== expectedVersion) versionConflict('The permit');
      const action = await apply(client, permit);
      const version = (await client.query<{ version: number }>('SELECT version FROM gigalibs_cmms.permits WHERE tenant_id = $1 AND id = $2',
        [context.principal.tenantId, permitId])).rows[0]!.version;
      await this.audit(client, context, action, 'CMMS_PERMIT', permitId, version, { number: permit.number });
      return this.permitRow(client, context.principal, permitId);
    });
  }

  private async setStatus(client: PoolClient, context: CmmsCommandContext, permitId: string, status: string, audited = true): Promise<void> {
    const version = (await client.query<{ version: number }>(
      `UPDATE gigalibs_cmms.permits SET status = $3, updated_by = $4, correlation_id = $5, version = version + 1 WHERE tenant_id = $1 AND id = $2
       RETURNING version`, [context.principal.tenantId, permitId, status, context.principal.subject, context.correlationId])).rows[0]!.version;
    if (audited) await this.audit(client, context, `CMMS_PERMIT_${status}`, 'CMMS_PERMIT', permitId, version, {});
  }

  private async lockPermit(client: PoolClient, principal: CmmsPrincipal, permitId: string, permission: string): Promise<PermitV1> {
    const values: unknown[] = [principal.tenantId, permitId];
    const where = ['p.tenant_id = $1', 'p.id = $2', ...scopePredicates(principal, values, 'p.')];
    const row = (await client.query<{ site_ref: string | null; department_id: string | null }>(
      `SELECT p.site_ref, p.department_id FROM gigalibs_cmms.permits p WHERE ${where.join(' AND ')} FOR UPDATE OF p`, values)).rows[0];
    if (!row) notFound('The permit');
    assertWritableScope(principal, { departmentId: row.department_id, siteRef: row.site_ref }, undefined, undefined, { permission });
    return this.permitRow(client, principal, permitId);
  }

  private async permitRow(client: PoolClient, principal: CmmsPrincipal, permitId: string): Promise<PermitV1> {
    const values: unknown[] = [principal.tenantId, permitId];
    const where = ['p.tenant_id = $1', 'p.id = $2', ...scopePredicates(principal, values, 'p.')];
    const row = (await client.query(
      `SELECT p.*, i.code AS procedure_code, i.revision AS procedure_revision FROM gigalibs_cmms.permits p
         JOIN gigalibs_cmms.isolation_procedures i ON i.tenant_id = p.tenant_id AND i.id = p.procedure_id
        WHERE ${where.join(' AND ')}`, values)).rows[0];
    if (!row) notFound('The permit');
    const isolations = await client.query(
      `SELECT s.*, EXISTS (SELECT 1 FROM gigalibs_cmms.permit_lock_photos f WHERE f.tenant_id = s.tenant_id AND f.permit_id = s.permit_id
                AND f.point_key = s.point_key) AS has_photo
         FROM gigalibs_cmms.permit_isolations s WHERE s.tenant_id = $1 AND s.permit_id = $2 ORDER BY s.sequence`, [principal.tenantId, permitId]);
    const tests = await client.query(
      'SELECT * FROM gigalibs_cmms.permit_gas_tests WHERE tenant_id = $1 AND permit_id = $2 ORDER BY tested_at DESC LIMIT 20',
      [principal.tenantId, permitId]);
    const locks = await client.query<{ subject: string; since: Date }>(
      `SELECT subject, max(occurred_at) FILTER (WHERE kind = 'ON') AS since FROM gigalibs_cmms.permit_lock_events
        WHERE tenant_id = $1 AND permit_id = $2 GROUP BY subject
       HAVING max(occurred_at) FILTER (WHERE kind = 'ON') > coalesce(max(occurred_at) FILTER (WHERE kind = 'OFF'), '-infinity')
        ORDER BY 2`, [principal.tenantId, permitId]);
    const clashes = await client.query<{ permit_id: string; permit_number: string; status: PermitV1['status']; isolation_tag: string }>(
      `SELECT DISTINCT o.id AS permit_id, o.permit_number, o.status, other.isolation_tag
         FROM gigalibs_cmms.permit_isolations mine
         JOIN gigalibs_cmms.permit_isolations other ON other.tenant_id = mine.tenant_id AND other.isolation_tag = mine.isolation_tag
              AND other.permit_id <> mine.permit_id
         JOIN gigalibs_cmms.permits o ON o.tenant_id = other.tenant_id AND o.id = other.permit_id
        WHERE mine.tenant_id = $1 AND mine.permit_id = $2 AND o.status IN ('ISOLATING', 'AWAITING_APPROVAL', 'LIVE', 'DE_ISOLATING')
        ORDER BY o.permit_number`, [principal.tenantId, permitId]);
    return {
      id: row.id, number: row.permit_number, type: row.type, status: row.status, title: row.title, description: row.description,
      procedureId: row.procedure_id, procedureCode: row.procedure_code, procedureRevision: row.procedure_revision,
      workOrderId: row.work_order_id, assetId: row.asset_id, validFrom: iso(row.valid_from), validUntil: iso(row.valid_until),
      requestedBy: row.requested_by, authorizedBy: row.authorized_by, countersignedBy: row.countersigned_by, liveAt: isoOrNull(row.live_at),
      closedBy: row.closed_by, closedAt: isoOrNull(row.closed_at), cancelReason: row.cancel_reason,
      isolations: isolations.rows.map((point) => ({
        pointKey: point.point_key, label: point.label, energy: point.energy, isolationTag: point.isolation_tag, method: point.method,
        sequence: point.sequence, status: point.status, lockSerial: point.lock_serial, lockedBy: point.locked_by, lockedAt: isoOrNull(point.locked_at),
        hasPhoto: point.has_photo, verifiedBy: point.verified_by, witnessedBy: point.witnessed_by, verifiedAt: isoOrNull(point.verified_at),
        removedBy: point.removed_by, removedAt: isoOrNull(point.removed_at), version: point.version,
      })),
      gasTests: tests.rows.map((test) => {
        const values = { oxygenPercent: Number(test.oxygen_percent), lelPercent: Number(test.lel_percent), coPpm: Number(test.co_ppm), h2sPpm: Number(test.h2s_ppm) };
        return { id: test.id, ...values, withinLimits: test.within_limits, flags: gasWithinLimits(values).flags, testedBy: test.tested_by, testedAt: iso(test.tested_at) };
      }),
      personalLocks: locks.rows.map((lock) => ({ subject: lock.subject, since: iso(lock.since) })),
      clashes: clashes.rows.map((clash) => ({ permitId: clash.permit_id, number: clash.permit_number, status: clash.status, isolationTag: clash.isolation_tag })),
      version: row.version,
    };
  }

  private async nextRevision(client: PoolClient, tenantId: string, code: string): Promise<number> {
    return (await client.query<{ next: number }>(
      'SELECT coalesce(max(revision), 0) + 1 AS next FROM gigalibs_cmms.isolation_procedures WHERE tenant_id = $1 AND code = $2',
      [tenantId, code])).rows[0]!.next;
  }

  private async insertDraft(insert: () => Promise<{ rows: { id: string }[] }>): Promise<string> {
    try {
      return (await insert()).rows[0]!.id;
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? (error as { code?: string }).code : undefined;
      if (code === '23505') conflict('DRAFT_EXISTS', 'This procedure already has a draft.');
      throw error;
    }
  }

  private async lockProcedure(client: PoolClient, context: CmmsCommandContext, procedureId: string, status: IsolationProcedureV1['status'], expectedVersion: number) {
    const current = await this.procedureRow(client, context.principal.tenantId, procedureId, true);
    if (current.status !== status) conflict('STATE', `This revision is ${current.status.toLowerCase()}.`);
    if (current.version !== expectedVersion) versionConflict('The isolation procedure');
    return current;
  }

  private async procedureRow(client: PoolClient, tenantId: string, procedureId: string, lock: boolean): Promise<IsolationProcedureV1> {
    const row = (await client.query(`SELECT * FROM gigalibs_cmms.isolation_procedures WHERE tenant_id = $1 AND id = $2${lock ? ' FOR UPDATE' : ''}`,
      [tenantId, procedureId])).rows[0];
    if (!row) notFound('The isolation procedure');
    return mapProcedure(row);
  }

  private audit(client: PoolClient, context: CmmsCommandContext, action: string, aggregateType: string, aggregateId: string, version: number,
    payload: Record<string, unknown>) {
    return recordMutation(client, context, { action, aggregateType, aggregateId, aggregateVersion: version, payload });
  }
}
