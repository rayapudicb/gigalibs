import { randomUUID } from 'node:crypto';
import {
  PROJECT_INVOICE_DRAFT_REQUESTED_V1,
  ProjectInvoiceDraftRelayLineV1Schema,
  ProjectInvoiceDraftRequestedPayloadV1Schema,
  buildMilestoneInvoiceDraftLine,
  buildTmInvoiceDraftLines,
} from '@gigalibs/contracts';
import { type ModuleCommandContext } from '@gigalibs/module-sdk';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { SCHEMA, TOPIC } from '../config.js';
import { DatabaseService } from '../database.service.js';

const RequestKeyBodyV1Schema = z
  .object({
    requestKey: z.string().uuid(),
  })
  .strict();

export const BillTimeMaterialsInputV1Schema = RequestKeyBodyV1Schema.extend({
  timesheetIds: z.array(z.string().uuid()).optional(),
});
export type BillTimeMaterialsInputV1 = z.infer<typeof BillTimeMaterialsInputV1Schema>;

export const BillMilestoneInputV1Schema = RequestKeyBodyV1Schema.extend({
  projectLineId: z.string().uuid(),
});
export type BillMilestoneInputV1 = z.infer<typeof BillMilestoneInputV1Schema>;

interface ProjectRow {
  id: string;
  project_code: string;
  org_unit_id: string;
  customer_party_id: string | null;
  currency_code: string;
}

interface TimesheetRow {
  id: string;
  task_id: string;
  worker_subject: string;
  work_date: string;
  hours: string;
  hourly_rate_minor: string;
  task_name: string;
}

@Injectable()
export class BillingService {
  constructor(private readonly database: DatabaseService) {}

  async billTimeMaterials(
    context: ModuleCommandContext,
    projectId: string,
    input: BillTimeMaterialsInputV1,
  ): Promise<{ billingRequestId: string; replayed: boolean; subtotalMinor: string; lineCount: number }> {
    const parsed = BillTimeMaterialsInputV1Schema.parse(input);
    const tenantId = context.principal.tenantId;

    return this.database.withTenantTransaction(tenantId, async (client) => {
      const prior = await client.query<{ id: string; subtotal_minor: string }>(
        `SELECT id, subtotal_minor::text FROM ${SCHEMA}.project_billing_requests
          WHERE tenant_id = $1 AND request_key = $2`,
        [tenantId, parsed.requestKey],
      );
      if (prior.rows[0]) {
        const count = await client.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM ${SCHEMA}.project_billing_timesheets
            WHERE tenant_id = $1 AND billing_request_id = $2`,
          [tenantId, prior.rows[0].id],
        );
        return {
          billingRequestId: prior.rows[0].id,
          replayed: true,
          subtotalMinor: prior.rows[0].subtotal_minor,
          lineCount: Number(count.rows[0]?.count ?? 0),
        };
      }

      const project = await client.query<ProjectRow>(
        `SELECT id, project_code, org_unit_id, customer_party_id, currency_code
           FROM ${SCHEMA}.projects WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
        [tenantId, projectId],
      );
      if (!project.rows[0]) throw new NotFoundException({ code: 'PROJECT_NOT_FOUND' });
      if (!project.rows[0].customer_party_id) {
        throw new BadRequestException({ code: 'PROJECT_CUSTOMER_REQUIRED' });
      }

      const filterIds = parsed.timesheetIds?.length ? parsed.timesheetIds : null;
      const timesheets = await client.query<TimesheetRow>(
        `SELECT ts.id, ts.task_id, ts.worker_subject, ts.work_date::text AS work_date,
                ts.hours::text AS hours, lr.hourly_rate_minor::text AS hourly_rate_minor, pt.name AS task_name
           FROM ${SCHEMA}.timesheets ts
           JOIN ${SCHEMA}.labor_rates lr ON lr.tenant_id = ts.tenant_id AND lr.id = ts.labor_rate_id
           JOIN ${SCHEMA}.project_tasks pt ON pt.tenant_id = ts.tenant_id AND pt.id = ts.task_id
          WHERE ts.tenant_id = $1 AND ts.project_id = $2 AND ts.status = 'APPROVED'
            AND NOT EXISTS (
              SELECT 1 FROM ${SCHEMA}.project_billing_timesheets bt
               WHERE bt.tenant_id = ts.tenant_id AND bt.timesheet_id = ts.id
            )
            AND ($3::uuid[] IS NULL OR ts.id = ANY($3::uuid[]))
          FOR UPDATE OF ts`,
        [tenantId, projectId, filterIds],
      );
      if (timesheets.rows.length === 0) {
        throw new BadRequestException({ code: 'PROJECT_TM_NOTHING_TO_BILL' });
      }

      const draftLines = buildTmInvoiceDraftLines(
        timesheets.rows.map((row) => ({
          timesheetId: row.id,
          taskId: row.task_id,
          taskName: row.task_name,
          workerSubject: row.worker_subject,
          workDate: row.work_date,
          hours: row.hours,
          hourlyRateMinor: row.hourly_rate_minor,
        })),
      );

      const relayLines = draftLines.map((line) =>
        ProjectInvoiceDraftRelayLineV1Schema.parse({
          sourceLineId: line.timesheetId,
          description: line.description,
          quantity: line.hours,
          unitPriceMinor: line.hourlyRateMinor,
          lineTotalMinor: line.lineTotalMinor,
        }),
      );

      return this.persistBillingRequest(client, context, project.rows[0], {
        requestKey: parsed.requestKey,
        billingKind: 'TIME_MATERIALS',
        milestoneLineId: null,
        relayLines,
        timesheetIds: timesheets.rows.map((row) => row.id),
      });
    });
  }

  async billMilestone(
    context: ModuleCommandContext,
    projectId: string,
    input: BillMilestoneInputV1,
  ): Promise<{ billingRequestId: string; replayed: boolean; subtotalMinor: string; lineCount: number }> {
    const parsed = BillMilestoneInputV1Schema.parse(input);
    const tenantId = context.principal.tenantId;

    return this.database.withTenantTransaction(tenantId, async (client) => {
      const prior = await client.query<{ id: string; subtotal_minor: string }>(
        `SELECT id, subtotal_minor::text FROM ${SCHEMA}.project_billing_requests
          WHERE tenant_id = $1 AND request_key = $2`,
        [tenantId, parsed.requestKey],
      );
      if (prior.rows[0]) {
        return {
          billingRequestId: prior.rows[0].id,
          replayed: true,
          subtotalMinor: prior.rows[0].subtotal_minor,
          lineCount: 1,
        };
      }

      const project = await client.query<ProjectRow>(
        `SELECT id, project_code, org_unit_id, customer_party_id, currency_code
           FROM ${SCHEMA}.projects WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
        [tenantId, projectId],
      );
      if (!project.rows[0]) throw new NotFoundException({ code: 'PROJECT_NOT_FOUND' });
      if (!project.rows[0].customer_party_id) {
        throw new BadRequestException({ code: 'PROJECT_CUSTOMER_REQUIRED' });
      }

      const line = await client.query<{ id: string; description: string; planned_amount_minor: string; line_kind: string }>(
        `SELECT id, description, planned_amount_minor::text, line_kind
           FROM ${SCHEMA}.project_lines
          WHERE tenant_id = $1 AND project_id = $2 AND id = $3 FOR UPDATE`,
        [tenantId, projectId, parsed.projectLineId],
      );
      const milestone = line.rows[0];
      if (!milestone || milestone.line_kind !== 'MILESTONE') {
        throw new BadRequestException({ code: 'PROJECT_MILESTONE_LINE_INVALID' });
      }

      const draftLine = buildMilestoneInvoiceDraftLine({
        projectLineId: milestone.id,
        description: milestone.description,
        amountMinor: milestone.planned_amount_minor,
      });

      const relayLines = [
        ProjectInvoiceDraftRelayLineV1Schema.parse({
          sourceLineId: draftLine.projectLineId,
          description: draftLine.description,
          quantity: '1.000000',
          unitPriceMinor: draftLine.amountMinor,
          lineTotalMinor: draftLine.amountMinor,
        }),
      ];

      return this.persistBillingRequest(client, context, project.rows[0], {
        requestKey: parsed.requestKey,
        billingKind: 'MILESTONE',
        milestoneLineId: milestone.id,
        relayLines,
        timesheetIds: [],
      });
    });
  }

  private async persistBillingRequest(
    client: PoolClient,
    context: ModuleCommandContext,
    project: ProjectRow,
    args: {
      requestKey: string;
      billingKind: 'TIME_MATERIALS' | 'MILESTONE';
      milestoneLineId: string | null;
      relayLines: z.infer<typeof ProjectInvoiceDraftRelayLineV1Schema>[];
      timesheetIds: string[];
    },
  ): Promise<{ billingRequestId: string; replayed: boolean; subtotalMinor: string; lineCount: number }> {
    const tenantId = context.principal.tenantId;
    const subtotalMinor = args.relayLines.reduce((sum, line) => sum + BigInt(line.lineTotalMinor), 0n).toString();
      const billingRequestId = randomUUID();
      const requestedAt = new Date().toISOString();

      const payload = ProjectInvoiceDraftRequestedPayloadV1Schema.parse({
        billingRequestId,
        requestKey: args.requestKey,
        projectId: project.id,
        projectCode: project.project_code,
        orgUnitId: project.org_unit_id,
        customerPartyId: project.customer_party_id!,
        currencyCode: project.currency_code,
        billingKind: args.billingKind,
        lines: args.relayLines,
        requestedAt,
      });

      await client.query(
        `INSERT INTO ${SCHEMA}.project_billing_requests
           (id, tenant_id, project_id, request_key, billing_kind, milestone_line_id, subtotal_minor, currency_code, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          billingRequestId,
          tenantId,
          project.id,
          args.requestKey,
          args.billingKind,
          args.milestoneLineId,
          subtotalMinor,
          project.currency_code,
          context.principal.subject,
        ],
      );

      for (const timesheetId of args.timesheetIds) {
        await client.query(
          `INSERT INTO ${SCHEMA}.project_billing_timesheets (tenant_id, billing_request_id, timesheet_id)
           VALUES ($1, $2, $3)`,
          [tenantId, billingRequestId, timesheetId],
        );
        await client.query(
          `UPDATE ${SCHEMA}.timesheets SET status = 'BILLED', version = version + 1, updated_at = now()
            WHERE tenant_id = $1 AND id = $2 AND status = 'APPROVED'`,
          [tenantId, timesheetId],
        );
      }

      await client.query(
        `INSERT INTO ${SCHEMA}.outbox_events
           (id, tenant_id, topic, event_type, aggregate_type, aggregate_id, aggregate_version,
            correlation_id, schema_version, payload)
         VALUES ($1, $2, $3, $4, $5, $6, 1, $7, 1, $8::jsonb)`,
        [
          randomUUID(),
          tenantId,
          TOPIC,
          PROJECT_INVOICE_DRAFT_REQUESTED_V1,
          'project_billing_request',
          billingRequestId,
          context.correlationId,
          JSON.stringify(payload),
        ],
      );

    return {
      billingRequestId,
      replayed: false,
      subtotalMinor,
      lineCount: args.relayLines.length,
    };
  }
}
