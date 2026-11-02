import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { BadRequestException, ConflictException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import {
  CreateCmmsRequestV1Schema,
  CreatePortalLinkV1Schema,
  PORTAL_ISSUE_TYPES,
  PORTAL_LIMITS,
  PORTAL_PHOTO_MAX_BYTES,
  PortalCapabilityV1Schema,
  PortalRequestV1Schema,
  PortalStatusCapabilityV1Schema,
  RevokePortalLinkV1Schema,
  portalState,
  sniffDiagramImage,
  type CreatedPortalLinkV1,
  type PortalContextV1,
  type PortalIssueTypeV1,
  type PortalLinkV1,
  type PortalReceiptV1,
  type PortalStatusV1,
  type PortalSubmissionV1,
} from '@gigalibs/contracts';
import type { PoolClient } from 'pg';
import type { CmmsCommandContext, CmmsPrincipal } from '../auth/authorization.js';
import { assertWritableScope, scopePredicates } from '../auth/scope.js';
import { AssetsService } from '../assets/assets.service.js';
import { assertUuid, iso, isoOrNull, notFound, parseInput, recordMutation } from '../common/command.js';
import { DatabaseService } from '../database/database.service.js';
import { RequestsService } from '../requests/requests.service.js';

// WI-OI-140 M-REQ. A request link is a revocable capability for one asset; CMMS keeps only its secret's hash. Portal
// calls arrive with a context the control plane minted for `portal:<link>` holding only cmms.portal.submit; CMMS proves
// the link (status, expiry, secret), bounds the rate from its own records, and raises the request itself.

const RECENT_REPORT_MS = 4 * 3_600_000;
const ISSUE_LABEL: Readonly<Record<PortalIssueTypeV1, string>> = {
  STOPPED: 'Stopped or will not run', NOISE: 'Strange noise', LEAK: 'Leaking', QUALITY: 'Quality issue', SAFETY: 'Safety hazard',
  OTHER: 'Other problem',
};
const ISSUE_PRIORITY: Readonly<Record<PortalIssueTypeV1, 'MEDIUM' | 'HIGH'>> = {
  STOPPED: 'HIGH', NOISE: 'MEDIUM', LEAK: 'MEDIUM', QUALITY: 'MEDIUM', SAFETY: 'HIGH', OTHER: 'MEDIUM',
};

const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');

/** One answer for every way a capability can fail, so the portal is no oracle for links or tenants. */
function invalidLink(): never {
  throw new NotFoundException({ code: 'CMMS_PORTAL_LINK_INVALID', message: 'This request link is not valid.' });
}

function sameHash(expected: string, actual: string): boolean {
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(actual, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The status capability of a submission: only someone holding the link secret and the browser's operation id has it. */
function statusSecret(linkSecret: string, clientOperationId: string): string {
  return createHash('sha256').update(`cmms-portal-status:${linkSecret}:${clientOperationId}`).digest('base64url');
}

function mapLink(row: Record<string, any>): PortalLinkV1 {
  return {
    id: row.id, assetId: row.asset_id, assetTag: row.asset_tag, assetName: row.asset_name, label: row.label, status: row.status,
    expiresAt: isoOrNull(row.expires_at), createdBy: row.created_by, createdAt: iso(row.created_at), revokedBy: row.revoked_by,
    revokedAt: isoOrNull(row.revoked_at), lastUsedAt: isoOrNull(row.last_used_at), submissions: Number(row.submissions ?? 0),
  };
}

const LINK_SELECT = `
  SELECT l.*, a.asset_tag, a.name AS asset_name,
         (SELECT count(*) FROM gigalibs_cmms.portal_submissions s WHERE s.tenant_id = l.tenant_id AND s.link_id = l.id) AS submissions
    FROM gigalibs_cmms.portal_links l JOIN gigalibs_cmms.assets a ON a.tenant_id = l.tenant_id AND a.id = l.asset_id`;

@Injectable()
export class PortalService {
  constructor(
    private readonly database: DatabaseService,
    private readonly assets: AssetsService,
    private readonly requests: RequestsService,
  ) {}

  // ─── Links (signed-in, cmms.portal.manage) ────────────────────────────────────────────────────────────

  async listLinks(principal: CmmsPrincipal, assetId?: string): Promise<{ readonly items: readonly PortalLinkV1[] }> {
    if (assetId) assertUuid(assetId, 'assetId');
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const values: unknown[] = [principal.tenantId];
      const where = ['l.tenant_id = $1', ...scopePredicates(principal, values, 'a.')];
      if (assetId) {
        values.push(assetId);
        where.push(`l.asset_id = $${values.length}`);
      }
      const rows = await client.query(`${LINK_SELECT} WHERE ${where.join(' AND ')} ORDER BY l.created_at DESC LIMIT 500`, values);
      return { items: rows.rows.map(mapLink) };
    });
  }

  async createLink(context: CmmsCommandContext, raw: unknown, now = new Date()): Promise<CreatedPortalLinkV1> {
    const input = parseInput(CreatePortalLinkV1Schema, raw);
    if (input.expiresAt && Date.parse(input.expiresAt) <= now.getTime())
      throw new BadRequestException({ code: 'CMMS_VALIDATION_FAILED', message: 'A link expires in the future.' });
    const principal = context.principal;
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const asset = await this.assets.visibleAsset(client, principal, input.assetId, false);
      assertWritableScope(principal, { departmentId: asset.departmentId, siteRef: asset.siteRef }, undefined, undefined,
        { permission: 'cmms.portal.manage' });
      const id = randomUUID();
      const secret = randomBytes(32).toString('base64url');
      await client.query(
        `INSERT INTO gigalibs_cmms.portal_links (tenant_id, id, asset_id, label, secret_sha256, expires_at, created_by, correlation_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [principal.tenantId, id, asset.id, input.label ?? null, sha256(secret), input.expiresAt ?? null, principal.subject, context.correlationId]);
      await recordMutation(client, context, { action: 'CMMS_PORTAL_LINK_CREATED', aggregateType: 'CMMS_PORTAL_LINK', aggregateId: id,
        aggregateVersion: 1, payload: { assetId: asset.id } });
      return { link: await this.linkRow(client, principal, id), token: `${principal.tenantId}.${id}.${secret}` };
    });
  }

  async revokeLink(context: CmmsCommandContext, linkId: string, raw: unknown): Promise<PortalLinkV1> {
    assertUuid(linkId, 'linkId');
    const input = parseInput(RevokePortalLinkV1Schema, raw);
    const principal = context.principal;
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const values: unknown[] = [principal.tenantId, linkId];
      const where = ['l.tenant_id = $1', 'l.id = $2', ...scopePredicates(principal, values, 'a.')];
      const row = (await client.query(
        `SELECT l.status, l.version, a.site_ref, a.department_id FROM gigalibs_cmms.portal_links l
           JOIN gigalibs_cmms.assets a ON a.tenant_id = l.tenant_id AND a.id = l.asset_id
          WHERE ${where.join(' AND ')} FOR UPDATE OF l`, values)).rows[0];
      if (!row) notFound('The request link');
      assertWritableScope(principal, { departmentId: row.department_id, siteRef: row.site_ref }, undefined, undefined,
        { permission: 'cmms.portal.manage' });
      if (row.status !== 'ACTIVE') throw new ConflictException({ code: 'CMMS_PORTAL_LINK_REVOKED', message: 'This link is already revoked.' });
      await client.query(
        `UPDATE gigalibs_cmms.portal_links SET status = 'REVOKED', revoked_by = $3, revoked_at = now(), revoke_reason = $4,
                version = version + 1, correlation_id = $5 WHERE tenant_id = $1 AND id = $2`,
        [principal.tenantId, linkId, principal.subject, input.reason, context.correlationId]);
      await recordMutation(client, context, { action: 'CMMS_PORTAL_LINK_REVOKED', aggregateType: 'CMMS_PORTAL_LINK', aggregateId: linkId,
        aggregateVersion: row.version + 1, payload: { reason: input.reason } });
      return this.linkRow(client, principal, linkId);
    });
  }

  async listSubmissions(principal: CmmsPrincipal): Promise<{ readonly items: readonly PortalSubmissionV1[] }> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const values: unknown[] = [principal.tenantId];
      const where = ['s.tenant_id = $1', "s.submitted_at > now() - interval '30 days'", ...scopePredicates(principal, values, 'a.')];
      const rows = await client.query(
        `SELECT s.id, s.link_id, s.issue_type, s.request_id, s.submitted_at, a.asset_tag, r.request_number, r.status AS request_status,
                EXISTS (SELECT 1 FROM gigalibs_cmms.portal_submission_photos p WHERE p.tenant_id = s.tenant_id AND p.submission_id = s.id) AS has_photo
           FROM gigalibs_cmms.portal_submissions s
           JOIN gigalibs_cmms.portal_links l ON l.tenant_id = s.tenant_id AND l.id = s.link_id
           JOIN gigalibs_cmms.assets a ON a.tenant_id = l.tenant_id AND a.id = l.asset_id
           JOIN gigalibs_cmms.maintenance_requests r ON r.tenant_id = s.tenant_id AND r.id = s.request_id
          WHERE ${where.join(' AND ')} ORDER BY s.submitted_at DESC LIMIT 200`, values);
      return {
        items: rows.rows.map((row) => ({
          id: row.id, linkId: row.link_id, assetTag: row.asset_tag, issueType: row.issue_type, requestId: row.request_id,
          requestNumber: row.request_number, requestStatus: row.request_status, hasPhoto: row.has_photo, submittedAt: iso(row.submitted_at),
        })),
      };
    });
  }

  async submissionPhoto(principal: CmmsPrincipal, submissionId: string) {
    assertUuid(submissionId, 'submissionId');
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const values: unknown[] = [principal.tenantId, submissionId];
      const where = ['p.tenant_id = $1', 'p.submission_id = $2', ...scopePredicates(principal, values, 'a.')];
      const row = (await client.query<{ content_type: string; bytes: Buffer; sha256: string }>(
        `SELECT p.content_type, p.bytes, p.sha256 FROM gigalibs_cmms.portal_submission_photos p
           JOIN gigalibs_cmms.portal_submissions s ON s.tenant_id = p.tenant_id AND s.id = p.submission_id
           JOIN gigalibs_cmms.portal_links l ON l.tenant_id = s.tenant_id AND l.id = s.link_id
           JOIN gigalibs_cmms.assets a ON a.tenant_id = l.tenant_id AND a.id = l.asset_id
          WHERE ${where.join(' AND ')}`, values)).rows[0];
      if (!row) notFound('The photo');
      return { contentType: row.content_type, base64: row.bytes.toString('base64'), sha256: row.sha256 };
    });
  }

  // ─── Portal (the control plane's portal principal, cmms.portal.submit) ───────────────────────────────

  async context(principal: CmmsPrincipal, raw: unknown, now = new Date()): Promise<PortalContextV1> {
    const capability = parseInput(PortalCapabilityV1Schema, raw);
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const link = await this.provenLink(client, principal, capability.linkId, capability.secret, now, false);
      const recent = (await client.query<{ created_at: Date }>(
        `SELECT created_at FROM gigalibs_cmms.maintenance_requests WHERE tenant_id = $1 AND asset_id = $2
            AND status IN ('PENDING', 'ACCEPTED') AND created_at > $3 ORDER BY created_at DESC LIMIT 1`,
        [principal.tenantId, link.asset_id, new Date(now.getTime() - RECENT_REPORT_MS)])).rows[0];
      return {
        assetTag: link.asset_tag, assetName: link.asset_name, issueTypes: [...PORTAL_ISSUE_TYPES],
        recentReportMinutesAgo: recent ? Math.max(0, Math.floor((now.getTime() - recent.created_at.getTime()) / 60_000)) : null,
      };
    });
  }

  async submit(context: CmmsCommandContext, raw: unknown, now = new Date()): Promise<PortalReceiptV1> {
    const input = parseInput(PortalRequestV1Schema, raw);
    const principal = context.principal;
    const status = statusSecret(input.secret, input.clientOperationId);
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      // Locking the link serialises its submissions, so the rate counts below are exact.
      const link = await this.provenLink(client, principal, input.linkId, input.secret, now, true);
      const replay = (await client.query<{ id: string; request_number: string }>(
        `SELECT s.id, r.request_number FROM gigalibs_cmms.portal_submissions s
           JOIN gigalibs_cmms.maintenance_requests r ON r.tenant_id = s.tenant_id AND r.id = s.request_id
          WHERE s.tenant_id = $1 AND s.link_id = $2 AND s.client_operation_id = $3`,
        [principal.tenantId, input.linkId, input.clientOperationId])).rows[0];
      if (replay) return { requestNumber: replay.request_number, statusToken: `${principal.tenantId}.${replay.id}.${status}`, replayed: true };
      const counts = (await client.query<{ link_hour: number; client_hour: number; tenant_day: number }>(
        `SELECT count(*) FILTER (WHERE link_id = $2 AND submitted_at > $4)::int AS link_hour,
                count(*) FILTER (WHERE link_id = $2 AND client_key = $3 AND submitted_at > $4)::int AS client_hour,
                count(*) FILTER (WHERE submitted_at > $5)::int AS tenant_day
           FROM gigalibs_cmms.portal_submissions WHERE tenant_id = $1 AND submitted_at > $5`,
        [principal.tenantId, input.linkId, input.clientKey, new Date(now.getTime() - 3_600_000), new Date(now.getTime() - 86_400_000)])).rows[0]!;
      if (counts.link_hour >= PORTAL_LIMITS.perLinkPerHour || counts.client_hour >= PORTAL_LIMITS.perClientPerLinkPerHour
        || counts.tenant_day >= PORTAL_LIMITS.perTenantPerDay)
        throw new HttpException({ code: 'CMMS_PORTAL_RATE_LIMITED', message: 'Too many requests from this link just now. Try again later.' },
          HttpStatus.TOO_MANY_REQUESTS);
      let photo: { bytes: Buffer; sha256: string } | null = null;
      if (input.photoBase64) {
        const bytes = Buffer.from(input.photoBase64, 'base64');
        if (bytes.length < 16 || bytes.length > PORTAL_PHOTO_MAX_BYTES || sniffDiagramImage(bytes) !== input.photoContentType)
          throw new BadRequestException({ code: 'CMMS_PORTAL_PHOTO_INVALID', message: 'The photo must be a PNG, JPEG or WebP of at most 300 KB.' });
        photo = { bytes, sha256: sha256(bytes) };
      }
      const contact = input.requesterContact;
      const email = contact && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact) ? contact : undefined;
      const request = await this.requests.submitWithClient(client, context, parseInput(CreateCmmsRequestV1Schema, {
        title: `${ISSUE_LABEL[input.issueType]}: ${link.asset_tag}`.slice(0, 240),
        description: [input.description, `Reported by QR request link${link.label ? ` “${link.label}”` : ''}${photo ? ' with a photo' : ''}.`]
          .filter(Boolean).join('\n\n'),
        priority: ISSUE_PRIORITY[input.issueType], assetId: link.asset_id,
        ...(input.requesterName ? { requesterName: input.requesterName } : {}),
        ...(email ? { requesterEmail: email } : contact ? { requesterPhone: contact.slice(0, 64) } : {}),
      }));
      const submissionId = randomUUID();
      await client.query(
        `INSERT INTO gigalibs_cmms.portal_submissions (tenant_id, id, link_id, client_operation_id, client_key, issue_type, request_id,
           status_secret_sha256) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [principal.tenantId, submissionId, input.linkId, input.clientOperationId, input.clientKey, input.issueType, request.id, sha256(status)]);
      if (photo)
        await client.query(
          'INSERT INTO gigalibs_cmms.portal_submission_photos (tenant_id, submission_id, content_type, bytes, sha256) VALUES ($1, $2, $3, $4, $5)',
          [principal.tenantId, submissionId, input.photoContentType, photo.bytes, photo.sha256]);
      await client.query('UPDATE gigalibs_cmms.portal_links SET last_used_at = now() WHERE tenant_id = $1 AND id = $2',
        [principal.tenantId, input.linkId]);
      await recordMutation(client, context, { action: 'CMMS_PORTAL_REQUEST_SUBMITTED', aggregateType: 'CMMS_PORTAL_SUBMISSION',
        aggregateId: submissionId, aggregateVersion: 1, payload: { linkId: input.linkId, requestId: request.id, issueType: input.issueType } });
      return { requestNumber: request.requestNumber, statusToken: `${principal.tenantId}.${submissionId}.${status}`, replayed: false };
    });
  }

  async status(principal: CmmsPrincipal, raw: unknown): Promise<PortalStatusV1> {
    const capability = parseInput(PortalStatusCapabilityV1Schema, raw);
    if (principal.subject !== `portal:${capability.submissionId}`) invalidLink();
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const row = (await client.query(
        `SELECT s.status_secret_sha256, s.submitted_at, r.request_number, r.status AS request_status, r.updated_at, a.asset_tag,
                w.status AS work_order_status, w.updated_at AS work_order_updated_at
           FROM gigalibs_cmms.portal_submissions s
           JOIN gigalibs_cmms.maintenance_requests r ON r.tenant_id = s.tenant_id AND r.id = s.request_id
           JOIN gigalibs_cmms.portal_links l ON l.tenant_id = s.tenant_id AND l.id = s.link_id
           JOIN gigalibs_cmms.assets a ON a.tenant_id = l.tenant_id AND a.id = l.asset_id
           LEFT JOIN gigalibs_cmms.work_orders w ON w.tenant_id = r.tenant_id AND w.id = r.converted_wo_id
          WHERE s.tenant_id = $1 AND s.id = $2`, [principal.tenantId, capability.submissionId])).rows[0];
      if (!row || !sameHash(row.status_secret_sha256, sha256(capability.secret))) invalidLink();
      const updated = [row.updated_at, row.work_order_updated_at].filter(Boolean).map((value: Date) => value.getTime());
      return {
        requestNumber: row.request_number, assetTag: row.asset_tag, state: portalState(row.request_status, row.work_order_status ?? null),
        submittedAt: iso(row.submitted_at), updatedAt: new Date(Math.max(...updated)).toISOString(),
      };
    });
  }

  // ─── Rows ─────────────────────────────────────────────────────────────────────────────────────────────

  /** The link, proven: bound to this principal, active, unexpired, its secret matching, its asset in service. */
  private async provenLink(client: PoolClient, principal: CmmsPrincipal, linkId: string, secret: string, now: Date, lock: boolean) {
    if (principal.subject !== `portal:${linkId}`) invalidLink();
    const row = (await client.query(
      `SELECT l.id, l.asset_id, l.label, l.secret_sha256, l.status, l.expires_at, a.asset_tag, a.name AS asset_name, a.archived_at
         FROM gigalibs_cmms.portal_links l JOIN gigalibs_cmms.assets a ON a.tenant_id = l.tenant_id AND a.id = l.asset_id
        WHERE l.tenant_id = $1 AND l.id = $2${lock ? ' FOR UPDATE OF l' : ''}`, [principal.tenantId, linkId])).rows[0];
    if (!row || !sameHash(row.secret_sha256, sha256(secret)) || row.status !== 'ACTIVE' || row.archived_at
      || (row.expires_at && row.expires_at.getTime() <= now.getTime())) invalidLink();
    return row as { id: string; asset_id: string; label: string | null; asset_tag: string; asset_name: string };
  }

  private async linkRow(client: PoolClient, principal: CmmsPrincipal, linkId: string): Promise<PortalLinkV1> {
    const row = (await client.query(`${LINK_SELECT} WHERE l.tenant_id = $1 AND l.id = $2`, [principal.tenantId, linkId])).rows[0];
    if (!row) notFound('The request link');
    return mapLink(row);
  }
}
