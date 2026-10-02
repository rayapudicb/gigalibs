import {
  assertOrganizationWrite,
  assertOwningUnit,
  organizationAccess,
  organizationReadCondition,
  OrganizationReplica,
  OrganizationScopeRefusal,
  OrganizationVersionPendingError,
  type OrganizationAccess,
  type OwnershipPolicy,
} from '@gigalibs/module-sdk';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import {
  CancelEngagementV1Schema,
  CreateEngagementV1Schema,
  CreateJobProfileV1Schema,
  CreatePositionV1Schema,
  EndEngagementV1Schema,
  ListEngagementsV1QuerySchema,
  ListJobProfilesV1QuerySchema,
  ListPositionsV1QuerySchema,
  ReviseJobProfileV1Schema,
  UpdateJobProfileStatusV1Schema,
  UpdatePositionV1Schema,
  type EngagementV1,
  type JobProfileDetailV1,
  type JobProfileRevisionV1,
  type JobProfileV1,
  type PositionDetailV1,
  type PositionV1,
  type RequiredCapabilityV1,
} from '@gigalibs/contracts';
import type { PoolClient } from 'pg';
import type { GigaOpsPrincipal } from '../auth/authorization.js';
import {
  type CommandContext,
  assertUuid,
  bumpVersion,
  conflict,
  iso,
  parse,
  recordMutation,
  today,
  translate,
} from '../common/commands.js';
import { WorkforceDatabaseService } from '../database/database.service.js';


/**
 * Job profiles, positions and engagements (WI-OI-065). Every window is [from, to) in calendar dates; reads are
 * "as of" a date (today by default). Every command runs in one tenant transaction with its audit and outbox
 * fact, and the database refuses overlapping revisions and a second incumbent in the same position.
 */
@Injectable()
export class JobsService {
  constructor(private readonly database: WorkforceDatabaseService) {}

  // ─── Job profiles ──────────────────────────────────────────────────────────────────────────────────────
  async listProfiles(principal: GigaOpsPrincipal, rawQuery: unknown): Promise<{ readonly items: readonly JobProfileV1[]; readonly asOf: string }> {
    const query = parse(ListJobProfilesV1QuerySchema, rawQuery);
    const asOf = query.asOf ?? today();
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const values: unknown[] = [principal.tenantId, asOf];
      const where = ['p.tenant_id = $1'];
      if (query.status) {
        values.push(query.status);
        where.push(`p.status = $${values.length}`);
      }
      if (query.q) {
        values.push(`%${query.q.replace(/[\\%_]/g, (character) => `\\${character}`)}%`);
        where.push(`(p.code ILIKE $${values.length} OR r.title ILIKE $${values.length})`);
      }
      const result = await client.query(
        `SELECT p.*, row_to_json(r) AS current_revision,
                (SELECT COUNT(*)::int FROM gigalibs_workforce.positions pos
                  WHERE pos.tenant_id = p.tenant_id AND pos.job_profile_id = p.id AND pos.status <> 'CLOSED') AS position_count
           FROM gigalibs_workforce.job_profiles p
           LEFT JOIN LATERAL (
             SELECT * FROM gigalibs_workforce.job_profile_revisions rev
              WHERE rev.tenant_id = p.tenant_id AND rev.job_profile_id = p.id
                AND rev.effective_from <= $2::date AND (rev.effective_to IS NULL OR rev.effective_to > $2::date)
           ) r ON true
          WHERE ${where.join(' AND ')}
          ORDER BY p.status ASC, p.code ASC
          LIMIT 500`,
        values,
      );
      const names = await capabilityNames(client, principal.tenantId, result.rows.flatMap((row) => row.current_revision?.required_capabilities ?? []));
      return { items: result.rows.map((row) => mapProfile(row, names)), asOf };
    });
  }

  async getProfile(principal: GigaOpsPrincipal, profileId: string, asOf = today()): Promise<JobProfileDetailV1> {
    assertUuid(profileId, 'jobProfileId');
    return this.database.withTenantTransaction(principal.tenantId, (client) => this.profileDetail(client, principal.tenantId, profileId, asOf));
  }

  async createProfile(context: CommandContext, rawInput: unknown): Promise<JobProfileDetailV1> {
    const input = parse(CreateJobProfileV1Schema, rawInput);
    const tenantId = context.principal.tenantId;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      await assertCapabilities(client, tenantId, input.requiredCapabilities);
      let profileId: string;
      try {
        const created = await client.query<{ id: string }>(
          `INSERT INTO gigalibs_workforce.job_profiles (tenant_id, code, created_by, updated_by, correlation_id)
           VALUES ($1, $2, $3, $3, $4) RETURNING id`,
          [tenantId, input.code, context.principal.subject, context.correlationId],
        );
        profileId = created.rows[0]!.id;
      } catch (error) {
        translate(error, `A job profile with code ${input.code} already exists.`);
      }
      await insertRevision(client, context, profileId, input);
      await recordMutation(client, context, 'WORKFORCE_JOB_PROFILE_CREATED', 'WORKFORCE_JOB_PROFILE', profileId, 1, {
        code: input.code,
        effectiveFrom: input.effectiveFrom,
        workerCategory: input.workerCategory,
      });
      return this.profileDetail(client, tenantId, profileId, input.effectiveFrom);
    });
  }

  /** A later definition: the open revision ends the day this one takes effect; history is never rewritten. */
  async reviseProfile(context: CommandContext, profileId: string, rawInput: unknown): Promise<JobProfileDetailV1> {
    assertUuid(profileId, 'jobProfileId');
    const input = parse(ReviseJobProfileV1Schema, rawInput);
    const tenantId = context.principal.tenantId;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const profile = await lockProfile(client, tenantId, profileId, input.expectedVersion);
      await assertCapabilities(client, tenantId, input.requiredCapabilities);
      const open = await client.query<{ id: string; effective_from: string }>(
        `SELECT id, effective_from FROM gigalibs_workforce.job_profile_revisions
          WHERE tenant_id = $1 AND job_profile_id = $2 AND effective_to IS NULL FOR UPDATE`,
        [tenantId, profileId],
      );
      const current = open.rows[0];
      if (!current) throw new ConflictException({ code: 'WORKFORCE_PROFILE_ENDED', message: 'The job profile has no open revision.' });
      if (input.effectiveFrom <= current.effective_from) {
        throw new ConflictException({
          code: 'WORKFORCE_REVISION_NOT_LATER',
          message: `A revision must start after the current one (from ${current.effective_from}); earlier corrections are not supported.`,
        });
      }
      await client.query(
        `UPDATE gigalibs_workforce.job_profile_revisions SET effective_to = $3 WHERE tenant_id = $1 AND id = $2`,
        [tenantId, current.id, input.effectiveFrom],
      );
      await insertRevision(client, context, profileId, input);
      const version = await bumpVersion(client, context, 'job_profiles', profileId);
      await recordMutation(client, context, 'WORKFORCE_JOB_PROFILE_REVISED', 'WORKFORCE_JOB_PROFILE', profileId, version, {
        code: profile.code,
        effectiveFrom: input.effectiveFrom,
        previousRevisionEnds: input.effectiveFrom,
      });
      return this.profileDetail(client, tenantId, profileId, input.effectiveFrom);
    });
  }

  async setProfileStatus(context: CommandContext, profileId: string, rawInput: unknown): Promise<JobProfileDetailV1> {
    assertUuid(profileId, 'jobProfileId');
    const input = parse(UpdateJobProfileStatusV1Schema, rawInput);
    const tenantId = context.principal.tenantId;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      await lockProfile(client, tenantId, profileId, input.expectedVersion);
      await client.query(`UPDATE gigalibs_workforce.job_profiles SET status = $3 WHERE tenant_id = $1 AND id = $2`, [tenantId, profileId, input.status]);
      const version = await bumpVersion(client, context, 'job_profiles', profileId);
      await recordMutation(client, context, 'WORKFORCE_JOB_PROFILE_STATUS_CHANGED', 'WORKFORCE_JOB_PROFILE', profileId, version, { status: input.status });
      return this.profileDetail(client, tenantId, profileId, today());
    });
  }

  // ─── Positions ─────────────────────────────────────────────────────────────────────────────────────────
  async listPositions(principal: GigaOpsPrincipal, rawQuery: unknown): Promise<{ readonly items: readonly PositionV1[]; readonly asOf: string }> {
    const query = parse(ListPositionsV1QuerySchema, rawQuery);
    const asOf = query.asOf ?? today();
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const values: unknown[] = [principal.tenantId, asOf];
      const where = ['pos.tenant_id = $1', ...(await scopePredicates(client, principal, values, 'pos.'))];
      for (const [column, value] of [['site_ref', query.siteRef], ['job_profile_id', query.jobProfileId], ['status', query.status]] as const) {
        if (value !== undefined) {
          values.push(value);
          where.push(`pos.${column} = $${values.length}`);
        }
      }
      if (query.vacantOnly === 'true') {
        where.push(`pos.status = 'OPEN' AND pos.effective_from <= $2::date AND (pos.effective_to IS NULL OR pos.effective_to > $2::date) AND inc.id IS NULL`);
      }
      const result = await client.query(`${POSITION_SELECT} WHERE ${where.join(' AND ')} ORDER BY pos.code ASC LIMIT 1000`, values);
      return { items: result.rows.map(mapPosition), asOf };
    });
  }

  async getPosition(principal: GigaOpsPrincipal, positionId: string): Promise<PositionDetailV1> {
    assertUuid(positionId, 'positionId');
    return this.database.withTenantTransaction(principal.tenantId, (client) => this.positionDetail(client, principal, positionId));
  }

  async createPosition(context: CommandContext, rawInput: unknown): Promise<PositionDetailV1> {
    const input = parse(CreatePositionV1Schema, rawInput);
    const tenantId = context.principal.tenantId;
    const siteRef = input.siteRef ?? null;
    const departmentId = input.organizationUnitId ?? input.departmentId ?? null;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      await assertWritableScope(client, context.principal, { siteRef, departmentId });
      await assertPositionOwner(client, context.principal, departmentId);
      const profile = await client.query<{ status: string; first_from: string | null }>(
        `SELECT p.status, (SELECT MIN(effective_from)::text FROM gigalibs_workforce.job_profile_revisions r
                            WHERE r.tenant_id = p.tenant_id AND r.job_profile_id = p.id) AS first_from
           FROM gigalibs_workforce.job_profiles p WHERE p.tenant_id = $1 AND p.id = $2`,
        [tenantId, input.jobProfileId],
      );
      const found = profile.rows[0];
      if (!found) throw new NotFoundException('The job profile was not found.');
      if (found.status !== 'ACTIVE') throw new ConflictException({ code: 'WORKFORCE_PROFILE_INACTIVE', message: 'The job profile is inactive.' });
      if (found.first_from && input.effectiveFrom < found.first_from) {
        throw new BadRequestException({
          code: 'WORKFORCE_POSITION_BEFORE_PROFILE',
          message: `The position cannot start before its job profile (${found.first_from}).`,
        });
      }
      let positionId: string;
      try {
        const created = await client.query<{ id: string }>(
          `INSERT INTO gigalibs_workforce.positions
             (tenant_id, code, job_profile_id, site_ref, department_id, fte, effective_from, effective_to,
              created_by, updated_by, correlation_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, $10) RETURNING id`,
          [tenantId, input.code, input.jobProfileId, siteRef, departmentId, input.fte, input.effectiveFrom, input.effectiveTo ?? null, context.principal.subject, context.correlationId],
        );
        positionId = created.rows[0]!.id;
      } catch (error) {
        translate(error, `A position with code ${input.code} already exists.`);
      }
      await recordMutation(client, context, 'WORKFORCE_POSITION_CREATED', 'WORKFORCE_POSITION', positionId, 1, {
        code: input.code,
        jobProfileId: input.jobProfileId,
        siteRef,
        organizationUnitId: departmentId,
        tenantShared: departmentId === null,
        fte: input.fte,
        effectiveFrom: input.effectiveFrom,
        effectiveTo: input.effectiveTo ?? null,
        status: 'OPEN',
      });
      return this.positionDetail(client, context.principal, positionId);
    });
  }

  /** Changes the window, FTE, place or status; an end or FTE that would strand an engagement is refused. */
  async updatePosition(context: CommandContext, positionId: string, rawInput: unknown): Promise<PositionDetailV1> {
    assertUuid(positionId, 'positionId');
    const input = parse(UpdatePositionV1Schema, rawInput);
    const tenantId = context.principal.tenantId;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const position = await this.lockPosition(client, context.principal, positionId, input.expectedVersion);
      await assertWritableScope(client, context.principal, { siteRef: position.site_ref, departmentId: position.department_id });
      const siteRef = input.siteRef === undefined ? position.site_ref : input.siteRef;
      const requestedOwner = input.organizationUnitId !== undefined ? input.organizationUnitId : input.departmentId;
      const departmentId = requestedOwner === undefined ? position.department_id : requestedOwner;
      await assertWritableScope(client, context.principal, { siteRef, departmentId });
      if (departmentId !== position.department_id) await assertPositionOwner(client, context.principal, departmentId);
      const effectiveTo = input.effectiveTo === undefined ? position.effective_to : input.effectiveTo;
      const fte = input.fte ?? Number(position.fte);
      const status = input.status ?? position.status;
      if (effectiveTo && effectiveTo <= position.effective_from) {
        throw new BadRequestException({ code: 'WORKFORCE_VALIDATION_FAILED', message: 'The end must be after the start.' });
      }
      if (status === 'CLOSED' && !effectiveTo) {
        throw new BadRequestException({ code: 'WORKFORCE_POSITION_END_REQUIRED', message: 'Set an end date to close a position.' });
      }
      const stranded = await client.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM gigalibs_workforce.engagements
          WHERE tenant_id = $1 AND position_id = $2 AND status <> 'CANCELLED'
            AND (($3::date IS NOT NULL AND (end_date IS NULL OR end_date > $3::date)) OR fte > $4)`,
        [tenantId, positionId, effectiveTo, fte],
      );
      if (stranded.rows[0]!.count > 0) {
        throw new ConflictException({
          code: 'WORKFORCE_POSITION_HAS_ENGAGEMENTS',
          message: 'End or reduce the engagements in this position before shortening it or lowering its FTE.',
        });
      }
      await client.query(
        `UPDATE gigalibs_workforce.positions SET site_ref = $3, department_id = $4, fte = $5, effective_to = $6, status = $7
          WHERE tenant_id = $1 AND id = $2`,
        [tenantId, positionId, siteRef, departmentId, fte, effectiveTo, status],
      );
      const version = await bumpVersion(client, context, 'positions', positionId);
      await recordMutation(client, context, 'WORKFORCE_POSITION_UPDATED', 'WORKFORCE_POSITION', positionId, version, {
        changed: Object.keys(input).filter((key) => key !== 'expectedVersion'),
        code: position.code,
        jobProfileId: position.job_profile_id,
        siteRef,
        organizationUnitId: departmentId,
        tenantShared: departmentId === null,
        fte,
        effectiveFrom: String(position.effective_from),
        status,
        effectiveTo,
      });
      return this.positionDetail(client, context.principal, positionId);
    });
  }

  // ─── Engagements ───────────────────────────────────────────────────────────────────────────────────────
  async listEngagements(principal: GigaOpsPrincipal, rawQuery: unknown): Promise<{ readonly items: readonly EngagementV1[] }> {
    const query = parse(ListEngagementsV1QuerySchema, rawQuery);
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const values: unknown[] = [principal.tenantId];
      const where = ['e.tenant_id = $1', ...(await scopePredicates(client, principal, values, 'pos.'))];
      for (const [column, value] of [['resource_id', query.resourceId], ['position_id', query.positionId], ['status', query.status]] as const) {
        if (value !== undefined) {
          values.push(value);
          where.push(`e.${column} = $${values.length}`);
        }
      }
      if (query.asOf) {
        values.push(query.asOf);
        where.push(`e.status <> 'CANCELLED' AND e.start_date <= $${values.length}::date AND (e.end_date IS NULL OR e.end_date > $${values.length}::date)`);
      }
      const result = await client.query(`${ENGAGEMENT_SELECT} WHERE ${where.join(' AND ')} ORDER BY e.start_date DESC, e.id LIMIT 1000`, values);
      return { items: result.rows.map(mapEngagement) };
    });
  }

  /**
   * Engages a person (a HUMAN resource) in an open position. The engagement must sit inside the position window
   * and FTE, and the database refuses a second incumbent for any overlapping day.
   */
  async createEngagement(context: CommandContext, rawInput: unknown): Promise<PositionDetailV1> {
    const input = parse(CreateEngagementV1Schema, rawInput);
    const tenantId = context.principal.tenantId;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const resource = await client.query<{ resource_type: string; status: string }>(
        `SELECT resource_type, status FROM gigalibs_workforce.workforce_resources WHERE tenant_id = $1 AND id = $2`,
        [tenantId, input.resourceId],
      );
      if (!resource.rows[0]) throw new NotFoundException('The resource was not found.');
      if (resource.rows[0].resource_type !== 'HUMAN') {
        throw new BadRequestException({ code: 'WORKFORCE_ENGAGEMENT_NOT_PERSON', message: 'Only a person can be engaged in a position; teams and pools are staffed through their members.' });
      }
      if (resource.rows[0].status !== 'ACTIVE') {
        throw new ConflictException({ code: 'WORKFORCE_RESOURCE_INACTIVE', message: 'The person is inactive.' });
      }
      const position = await this.lockPosition(client, context.principal, input.positionId, null);
      await assertWritableScope(client, context.principal, { siteRef: position.site_ref, departmentId: position.department_id });
      if (position.status !== 'OPEN') {
        throw new ConflictException({ code: 'WORKFORCE_POSITION_NOT_OPEN', message: `The position is ${position.status.toLowerCase()}.` });
      }
      const endDate = input.endDate ?? null;
      if (input.startDate < position.effective_from || (position.effective_to && (!endDate || endDate > position.effective_to))) {
        throw new BadRequestException({
          code: 'WORKFORCE_ENGAGEMENT_OUTSIDE_POSITION',
          message: `The engagement must fall within the position (${position.effective_from} to ${position.effective_to ?? 'open'}).`,
        });
      }
      if (input.fte > Number(position.fte)) {
        throw new BadRequestException({ code: 'WORKFORCE_ENGAGEMENT_FTE', message: `The position is ${Number(position.fte)} FTE.` });
      }
      let engagementId: string;
      try {
        const created = await client.query<{ id: string }>(
          `INSERT INTO gigalibs_workforce.engagements
             (tenant_id, resource_id, position_id, engagement_type, fte, start_date, end_date, created_by, updated_by, correlation_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, $9) RETURNING id`,
          [tenantId, input.resourceId, input.positionId, input.engagementType, input.fte, input.startDate, endDate, context.principal.subject, context.correlationId],
        );
        engagementId = created.rows[0]!.id;
      } catch (error) {
        translate(error, 'The position already has an incumbent for part of this period.');
      }
      await recordMutation(client, context, 'WORKFORCE_ENGAGEMENT_STARTED', 'WORKFORCE_ENGAGEMENT', engagementId, 1, {
        resourceId: input.resourceId,
        positionId: input.positionId,
        engagementType: input.engagementType,
        startDate: input.startDate,
        endDate,
        siteRef: position.site_ref,
      });
      return this.positionDetail(client, context.principal, input.positionId);
    });
  }

  async endEngagement(context: CommandContext, engagementId: string, rawInput: unknown): Promise<PositionDetailV1> {
    assertUuid(engagementId, 'engagementId');
    const input = parse(EndEngagementV1Schema, rawInput);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const engagement = await this.lockEngagement(client, context, engagementId, input.expectedVersion);
      if (engagement.status !== 'ACTIVE') {
        throw new ConflictException({ code: 'WORKFORCE_ENGAGEMENT_STATE', message: `The engagement is ${engagement.status.toLowerCase()}.` });
      }
      if (input.endDate <= engagement.start_date) {
        throw new BadRequestException({ code: 'WORKFORCE_VALIDATION_FAILED', message: 'The end must be after the start.' });
      }
      if (engagement.position_effective_to && input.endDate > engagement.position_effective_to) {
        throw new BadRequestException({ code: 'WORKFORCE_ENGAGEMENT_OUTSIDE_POSITION', message: `The position ends on ${engagement.position_effective_to}.` });
      }
      await client.query(
        `UPDATE gigalibs_workforce.engagements SET status = 'ENDED', end_date = $3, end_reason = $4 WHERE tenant_id = $1 AND id = $2`,
        [context.principal.tenantId, engagementId, input.endDate, input.reason],
      );
      const version = await bumpVersion(client, context, 'engagements', engagementId);
      await recordMutation(client, context, 'WORKFORCE_ENGAGEMENT_ENDED', 'WORKFORCE_ENGAGEMENT', engagementId, version, {
        positionId: engagement.position_id,
        endDate: input.endDate,
      });
      return this.positionDetail(client, context.principal, engagement.position_id);
    });
  }

  /** Withdraws an engagement that has not started; one that has started must be ended instead. */
  async cancelEngagement(context: CommandContext, engagementId: string, rawInput: unknown): Promise<PositionDetailV1> {
    assertUuid(engagementId, 'engagementId');
    const input = parse(CancelEngagementV1Schema, rawInput);
    return this.database.withTenantTransaction(context.principal.tenantId, async (client) => {
      const engagement = await this.lockEngagement(client, context, engagementId, input.expectedVersion);
      if (engagement.status !== 'ACTIVE' || engagement.start_date <= today()) {
        throw new ConflictException({ code: 'WORKFORCE_ENGAGEMENT_STARTED', message: 'Only a future engagement can be cancelled; end it instead.' });
      }
      await client.query(
        `UPDATE gigalibs_workforce.engagements SET status = 'CANCELLED', end_reason = $3 WHERE tenant_id = $1 AND id = $2`,
        [context.principal.tenantId, engagementId, input.reason],
      );
      const version = await bumpVersion(client, context, 'engagements', engagementId);
      await recordMutation(client, context, 'WORKFORCE_ENGAGEMENT_CANCELLED', 'WORKFORCE_ENGAGEMENT', engagementId, version, {
        positionId: engagement.position_id,
      });
      return this.positionDetail(client, context.principal, engagement.position_id);
    });
  }

  // ─── Reads and locks ───────────────────────────────────────────────────────────────────────────────────
  private async profileDetail(client: PoolClient, tenantId: string, profileId: string, asOf: string): Promise<JobProfileDetailV1> {
    const profile = await client.query(
      `SELECT p.*, (SELECT COUNT(*)::int FROM gigalibs_workforce.positions pos
                     WHERE pos.tenant_id = p.tenant_id AND pos.job_profile_id = p.id AND pos.status <> 'CLOSED') AS position_count
         FROM gigalibs_workforce.job_profiles p WHERE p.tenant_id = $1 AND p.id = $2`,
      [tenantId, profileId],
    );
    if (!profile.rows[0]) throw new NotFoundException('The job profile was not found.');
    const revisions = await client.query(
      `SELECT * FROM gigalibs_workforce.job_profile_revisions WHERE tenant_id = $1 AND job_profile_id = $2 ORDER BY effective_from ASC`,
      [tenantId, profileId],
    );
    const names = await capabilityNames(client, tenantId, revisions.rows.flatMap((row) => row.required_capabilities ?? []));
    const mapped = revisions.rows.map((row) => mapRevision(row, names));
    const current = mapped.find((revision) => revision.effectiveFrom <= asOf && (revision.effectiveTo === null || revision.effectiveTo > asOf)) ?? null;
    return { ...mapProfile({ ...profile.rows[0], current_revision: null }, names), current, revisions: mapped };
  }

  private async positionDetail(client: PoolClient, principal: GigaOpsPrincipal, positionId: string): Promise<PositionDetailV1> {
    const values: unknown[] = [principal.tenantId, today()];
    const where = ['pos.tenant_id = $1', ...(await scopePredicates(client, principal, values, 'pos.'))];
    values.push(positionId);
    where.push(`pos.id = $${values.length}`);
    const position = await client.query(`${POSITION_SELECT} WHERE ${where.join(' AND ')}`, values);
    if (!position.rows[0]) throw new NotFoundException('The position was not found.');
    const engagements = await client.query(`${ENGAGEMENT_SELECT} WHERE e.tenant_id = $1 AND e.position_id = $2 ORDER BY e.start_date DESC`, [principal.tenantId, positionId]);
    return { ...mapPosition(position.rows[0]), engagements: engagements.rows.map(mapEngagement) };
  }

  private async lockPosition(client: PoolClient, principal: GigaOpsPrincipal, positionId: string, expectedVersion: number | null): Promise<any> {
    assertUuid(positionId, 'positionId');
    const values: unknown[] = [principal.tenantId, positionId];
    const where = ['pos.tenant_id = $1', 'pos.id = $2', ...(await scopePredicates(client, principal, values, 'pos.'))];
    const result = await client.query(
      `SELECT pos.*, pos.effective_from::text AS effective_from, pos.effective_to::text AS effective_to
         FROM gigalibs_workforce.positions pos WHERE ${where.join(' AND ')} FOR UPDATE`,
      values,
    );
    const position = result.rows[0];
    if (!position) throw new NotFoundException('The position was not found.');
    if (expectedVersion !== null && Number(position.version) !== expectedVersion) conflict('position');
    return position;
  }

  private async lockEngagement(client: PoolClient, context: CommandContext, engagementId: string, expectedVersion: number): Promise<any> {
    const values: unknown[] = [context.principal.tenantId, engagementId];
    const where = ['e.tenant_id = $1', 'e.id = $2', ...(await scopePredicates(client, context.principal, values, 'pos.'))];
    const result = await client.query(
      `SELECT e.*, pos.site_ref, pos.department_id, pos.effective_to AS position_effective_to
         FROM gigalibs_workforce.engagements e
         JOIN gigalibs_workforce.positions pos ON pos.tenant_id = e.tenant_id AND pos.id = e.position_id
        WHERE ${where.join(' AND ')}
        FOR UPDATE OF e`,
      values,
    );
    const engagement = result.rows[0];
    if (!engagement) throw new NotFoundException('The engagement was not found.');
    if (Number(engagement.version) !== expectedVersion) conflict('engagement');
    await assertWritableScope(client, context.principal, { siteRef: engagement.site_ref, departmentId: engagement.department_id });
    return engagement;
  }
}

// Incumbent = the non-cancelled engagement covering $2 (the as-of date).
const POSITION_SELECT = `
  SELECT pos.*, p.code AS job_profile_code, r.title AS current_title, row_to_json(inc) AS incumbent
    FROM gigalibs_workforce.positions pos
    JOIN gigalibs_workforce.job_profiles p ON p.tenant_id = pos.tenant_id AND p.id = pos.job_profile_id
    LEFT JOIN LATERAL (
      SELECT title FROM gigalibs_workforce.job_profile_revisions rev
       WHERE rev.tenant_id = pos.tenant_id AND rev.job_profile_id = pos.job_profile_id
         AND rev.effective_from <= $2::date AND (rev.effective_to IS NULL OR rev.effective_to > $2::date)
    ) r ON true
    LEFT JOIN LATERAL (
      SELECT e.*, res.display_name AS resource_name, pos.code AS position_code
        FROM gigalibs_workforce.engagements e
        JOIN gigalibs_workforce.workforce_resources res ON res.tenant_id = e.tenant_id AND res.id = e.resource_id
       WHERE e.tenant_id = pos.tenant_id AND e.position_id = pos.id AND e.status <> 'CANCELLED'
         AND e.start_date <= $2::date AND (e.end_date IS NULL OR e.end_date > $2::date)
       LIMIT 1
    ) inc ON true`;

const ENGAGEMENT_SELECT = `
  SELECT e.*, res.display_name AS resource_name, pos.code AS position_code
    FROM gigalibs_workforce.engagements e
    JOIN gigalibs_workforce.positions pos ON pos.tenant_id = e.tenant_id AND pos.id = e.position_id
    JOIN gigalibs_workforce.workforce_resources res ON res.tenant_id = e.tenant_id AND res.id = e.resource_id`;

// WI-OI-109e3 (ADR-0018): once the tenant's tree is in force, the signed `organization` claim decides. A position's
// department_id is its owning unit (the bridge kept department ids); null means tenant-shared (D3). Positions may be
// owned by a unit or shared (EITHER); only tenant-wide authority creates or changes shared ones.
const POSITION_OWNERSHIP: OwnershipPolicy = 'EITHER';
const organizationReplica = new OrganizationReplica('gigalibs_workforce');
const accessByRequest = new WeakMap<GigaOpsPrincipal, Promise<OrganizationAccess | null>>();

/** The member's organization access for this request, or null when the department field still applies. */
function organizationAccessFor(client: PoolClient, principal: GigaOpsPrincipal): Promise<OrganizationAccess | null> {
  if (!principal.organization) return Promise.resolve(null);
  let access = accessByRequest.get(principal);
  if (!access) {
    access = organizationAccess(organizationReplica, client, principal.tenantId, principal.organization).catch((error: unknown) => {
      if (error instanceof OrganizationVersionPendingError) throw new ServiceUnavailableException({ code: error.code, message: error.message });
      throw error;
    });
    accessByRequest.set(principal, access);
  }
  return access;
}

function refusal(error: unknown): never {
  if (error instanceof OrganizationScopeRefusal) {
    if (error.code === 'ORGANIZATION_OUT_OF_SCOPE' || error.code === 'ORGANIZATION_SHARED_NEEDS_TENANT')
      throw new ForbiddenException({ code: 'WORKFORCE_OUT_OF_SCOPE', message: error.message });
    throw new BadRequestException({ code: 'WORKFORCE_VALIDATION_FAILED', message: error.message });
  }
  throw error;
}

async function assertPositionOwner(client: PoolClient, principal: GigaOpsPrincipal, departmentId: string | null): Promise<void> {
  const access = await organizationAccessFor(client, principal);
  if (!access) return;
  await assertOwningUnit(organizationReplica, client, principal.tenantId, access, POSITION_OWNERSHIP, departmentId).catch(refusal);
}

async function scopePredicates(client: PoolClient, principal: GigaOpsPrincipal, values: unknown[], alias: string): Promise<string[]> {
  const predicates: string[] = [];
  const access = await organizationAccessFor(client, principal);
  if (access) {
    const condition = organizationReadCondition(access, `${alias}department_id`, (value) => {
      values.push(value);
      return `$${values.length}`;
    });
    if (condition) predicates.push(condition);
  } else if (principal.orgScope.mode === 'SCOPED_DEPARTMENTS') {
    if (principal.orgScope.department_ids.length === 0) return ['FALSE'];
    values.push([...principal.orgScope.department_ids]);
    predicates.push(`(${alias}department_id IS NULL OR ${alias}department_id = ANY($${values.length}::text[]))`);
  }
  if (principal.spatialScope.mode === 'SCOPED_PLACES') {
    values.push([...principal.spatialScope.place_ids]);
    predicates.push(`${alias}site_ref = ANY($${values.length}::uuid[])`);
  }
  return predicates;
}

async function assertWritableScope(
  client: PoolClient,
  principal: GigaOpsPrincipal,
  target: { readonly siteRef: string | null; readonly departmentId: string | null },
): Promise<void> {
  const access = await organizationAccessFor(client, principal);
  if (access) {
    try {
      assertOrganizationWrite(access, target.departmentId);
    } catch (error) {
      refusal(error);
    }
  } else if (principal.orgScope.mode === 'SCOPED_DEPARTMENTS' && (target.departmentId === null || !principal.orgScope.department_ids.includes(target.departmentId))) {
    throw new ForbiddenException({ code: 'WORKFORCE_OUT_OF_SCOPE', message: 'The position must belong to one of your departments.' });
  }
  if (principal.spatialScope.mode === 'SCOPED_PLACES' && (target.siteRef === null || !principal.spatialScope.place_ids.includes(target.siteRef))) {
    throw new ForbiddenException({ code: 'WORKFORCE_OUT_OF_SCOPE', message: 'The position must be at one of your places.' });
  }
}

async function insertRevision(
  client: PoolClient,
  context: CommandContext,
  profileId: string,
  input: { effectiveFrom: string; title: string; description?: string | null; workerCategory: string; requiredCapabilities: RequiredCapabilityV1[] },
): Promise<void> {
  try {
    await client.query(
      `INSERT INTO gigalibs_workforce.job_profile_revisions
         (tenant_id, job_profile_id, effective_from, title, description, worker_category, required_capabilities, created_by, correlation_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)`,
      [
        context.principal.tenantId,
        profileId,
        input.effectiveFrom,
        input.title,
        input.description ?? null,
        input.workerCategory,
        JSON.stringify(input.requiredCapabilities),
        context.principal.subject,
        context.correlationId,
      ],
    );
  } catch (error) {
    translate(error, 'That revision overlaps an existing one.');
  }
}

async function lockProfile(client: PoolClient, tenantId: string, profileId: string, expectedVersion: number): Promise<any> {
  const result = await client.query(`SELECT * FROM gigalibs_workforce.job_profiles WHERE tenant_id = $1 AND id = $2 FOR UPDATE`, [tenantId, profileId]);
  if (!result.rows[0]) throw new NotFoundException('The job profile was not found.');
  if (Number(result.rows[0].version) !== expectedVersion) conflict('job profile');
  return result.rows[0];
}

async function assertCapabilities(client: PoolClient, tenantId: string, required: readonly RequiredCapabilityV1[]): Promise<void> {
  if (required.length === 0) return;
  const ids = required.map((item) => item.capabilityDefinitionId);
  const found = await client.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM gigalibs_workforce.capability_definitions WHERE tenant_id = $1 AND id = ANY($2::uuid[]) AND status = 'ACTIVE'`,
    [tenantId, ids],
  );
  if (found.rows[0]!.count !== ids.length) {
    throw new BadRequestException({ code: 'WORKFORCE_CAPABILITY_UNKNOWN', message: 'Every required capability must be an active capability of this tenant.' });
  }
}

async function capabilityNames(client: PoolClient, tenantId: string, required: readonly { capabilityDefinitionId: string }[]): Promise<Map<string, { code: string; name: string }>> {
  const ids = [...new Set(required.map((item) => item.capabilityDefinitionId))];
  if (ids.length === 0) return new Map();
  const result = await client.query(
    `SELECT id, code, name FROM gigalibs_workforce.capability_definitions WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
    [tenantId, ids],
  );
  return new Map(result.rows.map((row) => [row.id, { code: row.code, name: row.name }]));
}

function mapRevision(row: any, names: Map<string, { code: string; name: string }>): JobProfileRevisionV1 {
  return {
    id: row.id,
    effectiveFrom: String(row.effective_from),
    effectiveTo: row.effective_to === null ? null : String(row.effective_to),
    title: row.title,
    description: row.description ?? null,
    workerCategory: row.worker_category,
    requiredCapabilities: (row.required_capabilities ?? []).map((item: RequiredCapabilityV1) => ({
      ...item,
      capabilityCode: names.get(item.capabilityDefinitionId)?.code ?? null,
      capabilityName: names.get(item.capabilityDefinitionId)?.name ?? null,
    })),
    createdBy: row.created_by,
    createdAt: iso(row.created_at),
  };
}

function mapProfile(row: any, names: Map<string, { code: string; name: string }>): JobProfileV1 {
  return {
    id: row.id,
    code: row.code,
    status: row.status,
    version: Number(row.version),
    current: row.current_revision ? mapRevision(row.current_revision, names) : null,
    positionCount: Number(row.position_count ?? 0),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function mapEngagement(row: any): EngagementV1 {
  return {
    id: row.id,
    resourceId: row.resource_id,
    resourceName: row.resource_name ?? null,
    positionId: row.position_id,
    positionCode: row.position_code ?? null,
    engagementType: row.engagement_type,
    fte: Number(row.fte),
    startDate: String(row.start_date),
    endDate: row.end_date === null ? null : String(row.end_date),
    status: row.status,
    endReason: row.end_reason ?? null,
    version: Number(row.version),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function mapPosition(row: any): PositionV1 {
  return {
    id: row.id,
    code: row.code,
    jobProfileId: row.job_profile_id,
    jobProfileCode: row.job_profile_code,
    title: row.current_title ?? null,
    siteRef: row.site_ref ?? null,
    organizationUnitId: row.department_id ?? null,
    departmentId: row.department_id ?? null,
    fte: Number(row.fte),
    effectiveFrom: String(row.effective_from),
    effectiveTo: row.effective_to === null ? null : String(row.effective_to),
    status: row.status,
    incumbent: row.incumbent ? mapEngagement(row.incumbent) : null,
    version: Number(row.version),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}
