import {
  TimesheetActionInputV1Schema,
  TimesheetApprovalQueueItemV1Schema,
  TimesheetApprovalQueueV1Schema,
} from '@gigalibs/contracts';
import { type ModuleCommandContext, recordMutation } from '@gigalibs/module-sdk';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { SCHEMA, TOPIC } from '../config.js';
import { DatabaseService } from '../database.service.js';

@Injectable()
export class TimesheetsService {
  constructor(private readonly database: DatabaseService) {}

  async listApprovalQueue(tenantId: string) {
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const result = await client.query<{
        id: string;
        project_id: string;
        project_code: string;
        project_name: string;
        task_id: string;
        task_name: string;
        worker_subject: string;
        work_date: string;
        hours: string;
        status: string;
        version: number;
        notes: string | null;
      }>(
        `SELECT ts.id, ts.project_id, p.project_code, p.name AS project_name,
                ts.task_id, pt.name AS task_name, ts.worker_subject, ts.work_date::text AS work_date,
                ts.hours::text AS hours, ts.status, ts.version, ts.notes
           FROM ${SCHEMA}.timesheets ts
           JOIN ${SCHEMA}.projects p ON p.tenant_id = ts.tenant_id AND p.id = ts.project_id
           JOIN ${SCHEMA}.project_tasks pt ON pt.tenant_id = ts.tenant_id AND pt.id = ts.task_id
          WHERE ts.tenant_id = $1 AND ts.status = 'SUBMITTED'
          ORDER BY ts.work_date, p.project_code, ts.worker_subject`,
        [tenantId],
      );
      const items = result.rows.map((row) =>
        TimesheetApprovalQueueItemV1Schema.parse({
          id: row.id,
          projectId: row.project_id,
          projectCode: row.project_code,
          projectName: row.project_name,
          taskId: row.task_id,
          taskName: row.task_name,
          workerSubject: row.worker_subject,
          workDate: row.work_date,
          hours: row.hours,
          status: row.status,
          version: row.version,
          notes: row.notes,
        }),
      );
      return TimesheetApprovalQueueV1Schema.parse({ items });
    });
  }

  async submitForApproval(context: ModuleCommandContext, timesheetId: string, input: { requestKey: string; expectedVersion: number }) {
    return this.transition(context, timesheetId, input, 'DRAFT', 'SUBMITTED', 'TIMESHEET_SUBMITTED');
  }

  async approve(context: ModuleCommandContext, timesheetId: string, input: unknown) {
    const parsed = TimesheetActionInputV1Schema.parse(input);
    return this.transition(context, timesheetId, parsed, 'SUBMITTED', 'APPROVED', 'TIMESHEET_APPROVED');
  }

  async reject(context: ModuleCommandContext, timesheetId: string, input: unknown) {
    const parsed = TimesheetActionInputV1Schema.parse(input);
    if (!parsed.rejectionReason) {
      throw new BadRequestException({ code: 'TIMESHEET_REJECTION_REASON_REQUIRED' });
    }
    return this.transition(context, timesheetId, parsed, 'SUBMITTED', 'REJECTED', 'TIMESHEET_REJECTED', parsed.rejectionReason);
  }

  private async transition(
    context: ModuleCommandContext,
    timesheetId: string,
    input: { requestKey: string; expectedVersion: number; rejectionReason?: string },
    fromStatus: string,
    toStatus: string,
    action: string,
    rejectionReason?: string,
  ) {
    const tenantId = context.principal.tenantId;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const row = await client.query<{ id: string; version: number; status: string; project_id: string }>(
        `SELECT id, version, status, project_id FROM ${SCHEMA}.timesheets
          WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
        [tenantId, timesheetId],
      );
      const timesheet = row.rows[0];
      if (!timesheet) throw new NotFoundException({ code: 'TIMESHEET_NOT_FOUND' });
      if (timesheet.version !== input.expectedVersion) {
        throw new ConflictException({ code: 'TIMESHEET_VERSION_CONFLICT' });
      }
      if (timesheet.status !== fromStatus) {
        throw new BadRequestException({ code: 'TIMESHEET_STATUS_INVALID', message: `Expected ${fromStatus}.` });
      }

      const updated = await client.query<{ version: number; status: string }>(
        `UPDATE ${SCHEMA}.timesheets
            SET status = $4, version = version + 1, updated_at = now(),
                notes = CASE WHEN $5::text IS NOT NULL THEN $5 ELSE notes END
          WHERE tenant_id = $1 AND id = $2 AND version = $3
          RETURNING version, status`,
        [tenantId, timesheetId, input.expectedVersion, toStatus, rejectionReason ?? null],
      );
      if (!updated.rows[0]) throw new ConflictException({ code: 'TIMESHEET_VERSION_CONFLICT' });

      await recordMutation(client, { schema: SCHEMA, topic: TOPIC }, context, {
        action,
        aggregateType: 'timesheet',
        aggregateId: timesheetId,
        aggregateVersion: updated.rows[0].version,
        payload: { timesheetId, projectId: timesheet.project_id, status: toStatus, rejectionReason: rejectionReason ?? null },
      });

      return { timesheetId, status: updated.rows[0].status, version: updated.rows[0].version, replayed: false };
    });
  }
}
