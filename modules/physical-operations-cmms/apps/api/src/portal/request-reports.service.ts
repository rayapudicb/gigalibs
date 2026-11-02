import { createHash, randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import {
  CreateCmmsRequestV1Schema,
  PORTAL_PHOTO_MAX_BYTES,
  ReportProblemV1Schema,
  portalState,
  sniffDiagramImage,
  type PortalIssueTypeV1,
  type ReportProblemResultV1,
  type RequestReportV1,
} from '@gigalibs/contracts';
import type { PoolClient } from 'pg';
import type { CmmsCommandContext, CmmsPrincipal } from '../auth/authorization.js';
import { AssetsService } from '../assets/assets.service.js';
import { iso, parseInput, recordMutation } from '../common/command.js';
import { DatabaseService } from '../database/database.service.js';
import { RequestsService } from '../requests/requests.service.js';

// WI-OI-140 M-REQ: a signed-in member reports a problem with an asset from the mobile app (cmms.requests.report). The request is raised
// through the request service as the member; one report per member and operation, so a resend is the same request.

const LABEL: Readonly<Record<PortalIssueTypeV1, string>> = {
  STOPPED: 'Stopped or will not run', NOISE: 'Strange noise', LEAK: 'Leaking', QUALITY: 'Quality issue', SAFETY: 'Safety hazard',
  OTHER: 'Other problem',
};
const PRIORITY: Readonly<Record<PortalIssueTypeV1, 'MEDIUM' | 'HIGH'>> = {
  STOPPED: 'HIGH', NOISE: 'MEDIUM', LEAK: 'MEDIUM', QUALITY: 'MEDIUM', SAFETY: 'HIGH', OTHER: 'MEDIUM',
};
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');

@Injectable()
export class RequestReportsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly assets: AssetsService,
    private readonly requests: RequestsService,
  ) {}

  async report(context: CmmsCommandContext, raw: unknown): Promise<ReportProblemResultV1> {
    const input = parseInput(ReportProblemV1Schema, raw);
    const principal = context.principal;
    const payloadSha256 = sha256(JSON.stringify(input));
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const replay = (await client.query<{ id: string; payload_sha256: string }>(
        `SELECT id, payload_sha256 FROM gigalibs_cmms.request_reports
          WHERE tenant_id = $1 AND requester_subject = $2 AND client_operation_id = $3`,
        [principal.tenantId, principal.subject, input.clientOperationId])).rows[0];
      if (replay) {
        if (replay.payload_sha256 !== payloadSha256)
          throw new ConflictException({ code: 'CMMS_REPORT_OPERATION_REUSED', message: 'This capture id was already used for a different report.' });
        return { replayed: true, report: await this.reportRow(client, principal, replay.id) };
      }
      const asset = await this.assets.visibleAsset(client, principal, input.assetId, false);
      let photo: { bytes: Buffer; sha256: string } | null = null;
      if (input.photoBase64) {
        const bytes = Buffer.from(input.photoBase64, 'base64');
        if (bytes.length < 16 || bytes.length > PORTAL_PHOTO_MAX_BYTES || sniffDiagramImage(bytes) !== input.photoContentType)
          throw new BadRequestException({ code: 'CMMS_REPORT_PHOTO_INVALID', message: 'The photo must be a PNG, JPEG or WebP of at most 300 KB.' });
        photo = { bytes, sha256: sha256(bytes) };
      }
      const request = await this.requests.submitWithClient(client, context, parseInput(CreateCmmsRequestV1Schema, {
        title: `${LABEL[input.issueType]}: ${asset.assetTag}`.slice(0, 240),
        description: [input.description, `Reported from the mobile app${photo ? ' with a photo' : ''}.`].filter(Boolean).join('\n\n'),
        priority: PRIORITY[input.issueType], assetId: asset.id,
      }));
      const id = randomUUID();
      await client.query(
        `INSERT INTO gigalibs_cmms.request_reports (tenant_id, id, client_operation_id, requester_subject, asset_id, issue_type, request_id,
           payload_sha256) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [principal.tenantId, id, input.clientOperationId, principal.subject, asset.id, input.issueType, request.id, payloadSha256]);
      if (photo)
        await client.query(
          'INSERT INTO gigalibs_cmms.request_report_photos (tenant_id, report_id, content_type, bytes, sha256) VALUES ($1, $2, $3, $4, $5)',
          [principal.tenantId, id, input.photoContentType, photo.bytes, photo.sha256]);
      await recordMutation(client, context, { action: 'CMMS_REQUEST_REPORTED', aggregateType: 'CMMS_REQUEST_REPORT', aggregateId: id,
        aggregateVersion: 1, payload: { requestId: request.id, issueType: input.issueType } });
      return { replayed: false, report: await this.reportRow(client, principal, id) };
    });
  }

  /** The caller's own reports of the last 90 days, with where each stands. */
  async mine(principal: CmmsPrincipal): Promise<{ readonly items: readonly RequestReportV1[] }> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const ids = await client.query<{ id: string }>(
        `SELECT id FROM gigalibs_cmms.request_reports WHERE tenant_id = $1 AND requester_subject = $2
            AND submitted_at > now() - interval '90 days' ORDER BY submitted_at DESC LIMIT 50`,
        [principal.tenantId, principal.subject]);
      const items: RequestReportV1[] = [];
      for (const row of ids.rows) items.push(await this.reportRow(client, principal, row.id));
      return { items };
    });
  }

  private async reportRow(client: PoolClient, principal: CmmsPrincipal, reportId: string): Promise<RequestReportV1> {
    const row = (await client.query(
      `SELECT p.id, p.request_id, p.asset_id, p.issue_type, p.submitted_at, r.request_number, r.status AS request_status,
              a.asset_tag, a.name AS asset_name, w.status AS work_order_status
         FROM gigalibs_cmms.request_reports p
         JOIN gigalibs_cmms.maintenance_requests r ON r.tenant_id = p.tenant_id AND r.id = p.request_id
         JOIN gigalibs_cmms.assets a ON a.tenant_id = p.tenant_id AND a.id = p.asset_id
         LEFT JOIN gigalibs_cmms.work_orders w ON w.tenant_id = r.tenant_id AND w.id = r.converted_wo_id
        WHERE p.tenant_id = $1 AND p.id = $2 AND p.requester_subject = $3`, [principal.tenantId, reportId, principal.subject])).rows[0];
    return {
      id: row.id, requestId: row.request_id, requestNumber: row.request_number, assetId: row.asset_id, assetTag: row.asset_tag,
      assetName: row.asset_name, issueType: row.issue_type, state: portalState(row.request_status, row.work_order_status ?? null),
      submittedAt: iso(row.submitted_at),
    };
  }
}
