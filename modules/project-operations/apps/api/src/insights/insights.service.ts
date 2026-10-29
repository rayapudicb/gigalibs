import {
  ProjectBurnMatrixV1Schema,
  ProjectGanttV1Schema,
  ProjectSummaryV1Schema,
  accrueProjectCosts,
  computeProjectBudgetBurn,
} from '@gigalibs/contracts';
import { Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { SCHEMA } from '../config.js';
import { DatabaseService } from '../database.service.js';

const ProjectListV1Schema = z.object({ items: z.array(ProjectSummaryV1Schema) }).strict();

@Injectable()
export class InsightsService {
  constructor(private readonly database: DatabaseService) {}

  async listProjects(tenantId: string) {
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const result = await client.query<{
        id: string;
        project_code: string;
        name: string;
        status: string;
        currency_code: string;
        budget_amount_minor: string;
        planned_start: string | null;
        planned_end: string | null;
      }>(
        `SELECT id, project_code, name, status, currency_code, budget_amount_minor::text,
                planned_start::text, planned_end::text
           FROM ${SCHEMA}.projects
          WHERE tenant_id = $1
          ORDER BY project_code`,
        [tenantId],
      );
      const items = result.rows.map((row) =>
        ProjectSummaryV1Schema.parse({
          id: row.id,
          projectCode: row.project_code,
          name: row.name,
          status: row.status,
          currencyCode: row.currency_code,
          budgetMinor: row.budget_amount_minor,
          plannedStart: row.planned_start,
          plannedEnd: row.planned_end,
        }),
      );
      return ProjectListV1Schema.parse({ items });
    });
  }

  async getGantt(tenantId: string, projectId: string) {
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const project = await client.query<{
        id: string;
        project_code: string;
        name: string;
        planned_start: string | null;
        planned_end: string | null;
      }>(
        `SELECT id, project_code, name, planned_start::text, planned_end::text
           FROM ${SCHEMA}.projects WHERE tenant_id = $1 AND id = $2`,
        [tenantId, projectId],
      );
      if (!project.rows[0]) throw new NotFoundException({ code: 'PROJECT_NOT_FOUND' });

      const phases = await client.query<{
        id: string;
        phase_number: number;
        name: string;
        status: string;
        planned_start: string | null;
        planned_end: string | null;
      }>(
        `SELECT id, phase_number, name, status, planned_start::text, planned_end::text
           FROM ${SCHEMA}.project_phases
          WHERE tenant_id = $1 AND project_id = $2
          ORDER BY phase_number`,
        [tenantId, projectId],
      );

      const tasks = await client.query<{
        id: string;
        phase_id: string;
        task_number: number;
        name: string;
        status: string;
        planned_hours: string;
        planned_start: string | null;
        planned_end: string | null;
      }>(
        `SELECT id, phase_id, task_number, name, status, planned_hours::text,
                planned_start::text, planned_end::text
           FROM ${SCHEMA}.project_tasks
          WHERE tenant_id = $1 AND project_id = $2
          ORDER BY phase_id, task_number`,
        [tenantId, projectId],
      );

      const tasksByPhase = new Map<string, typeof tasks.rows>();
      for (const task of tasks.rows) {
        const bucket = tasksByPhase.get(task.phase_id) ?? [];
        bucket.push(task);
        tasksByPhase.set(task.phase_id, bucket);
      }

      return ProjectGanttV1Schema.parse({
        projectId: project.rows[0].id,
        projectCode: project.rows[0].project_code,
        name: project.rows[0].name,
        plannedStart: project.rows[0].planned_start,
        plannedEnd: project.rows[0].planned_end,
        phases: phases.rows.map((phase) => ({
          id: phase.id,
          phaseNumber: phase.phase_number,
          name: phase.name,
          status: phase.status,
          plannedStart: phase.planned_start,
          plannedEnd: phase.planned_end,
          tasks: (tasksByPhase.get(phase.id) ?? []).map((task) => ({
            id: task.id,
            taskNumber: task.task_number,
            name: task.name,
            status: task.status,
            plannedHours: task.planned_hours,
            plannedStart: task.planned_start,
            plannedEnd: task.planned_end,
          })),
        })),
      });
    });
  }

  async getBurnMatrix(tenantId: string, projectId: string) {
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const project = await client.query<{
        id: string;
        project_code: string;
        currency_code: string;
        budget_amount_minor: string;
      }>(
        `SELECT id, project_code, currency_code, budget_amount_minor::text
           FROM ${SCHEMA}.projects WHERE tenant_id = $1 AND id = $2`,
        [tenantId, projectId],
      );
      if (!project.rows[0]) throw new NotFoundException({ code: 'PROJECT_NOT_FOUND' });

      const laborRows = await client.query<{
        timesheet_id: string;
        project_id: string;
        task_id: string;
        task_name: string;
        planned_hours: string;
        hours: string;
        hourly_rate_minor: string;
      }>(
        `SELECT ts.id AS timesheet_id, ts.project_id, ts.task_id, pt.name AS task_name,
                pt.planned_hours::text AS planned_hours, ts.hours::text AS hours,
                lr.hourly_rate_minor::text AS hourly_rate_minor
           FROM ${SCHEMA}.timesheets ts
           JOIN ${SCHEMA}.labor_rates lr ON lr.tenant_id = ts.tenant_id AND lr.id = ts.labor_rate_id
           JOIN ${SCHEMA}.project_tasks pt ON pt.tenant_id = ts.tenant_id AND pt.id = ts.task_id
          WHERE ts.tenant_id = $1 AND ts.project_id = $2
            AND ts.status IN ('SUBMITTED', 'APPROVED', 'BILLED')`,
        [tenantId, projectId],
      );

      const postingTotal = await client.query<{ material_minor: string; labor_minor: string }>(
        `SELECT COALESCE(SUM(material_minor), 0)::text AS material_minor,
                COALESCE(SUM(labor_minor), 0)::text AS labor_minor
           FROM ${SCHEMA}.project_cost_postings
          WHERE tenant_id = $1 AND project_id = $2`,
        [tenantId, projectId],
      );

      const accrual = accrueProjectCosts({
        materialLines: [],
        laborLines: laborRows.rows.map((row) => ({
          timesheetId: row.timesheet_id,
          projectId: row.project_id,
          taskId: row.task_id,
          hours: row.hours,
          hourlyRateMinor: row.hourly_rate_minor,
        })),
      });

      const postedMaterial = BigInt(postingTotal.rows[0]?.material_minor ?? '0');
      const postedLabor = BigInt(postingTotal.rows[0]?.labor_minor ?? '0');
      const postedTotal = postedMaterial + postedLabor;
      const accruedMinor = (postedTotal > 0n ? postedTotal : BigInt(accrual.totalMinor)).toString();

      const summary = computeProjectBudgetBurn(project.rows[0].budget_amount_minor, accruedMinor);

      const taskMeta = await client.query<{ id: string; name: string; planned_hours: string }>(
        `SELECT id, name, planned_hours::text FROM ${SCHEMA}.project_tasks
          WHERE tenant_id = $1 AND project_id = $2 ORDER BY task_number`,
        [tenantId, projectId],
      );

      const accrualByTask = new Map<string, { materialMinor: string; laborMinor: string; totalMinor: string }>();
      for (const projectSlice of accrual.projects) {
        for (const task of projectSlice.tasks) {
          if (task.taskId) accrualByTask.set(task.taskId, task);
        }
      }

      const rows = taskMeta.rows.map((task) => {
        const costs = accrualByTask.get(task.id);
        return {
          taskId: task.id,
          taskName: task.name,
          plannedHours: task.planned_hours,
          materialMinor: costs?.materialMinor ?? '0',
          laborMinor: costs?.laborMinor ?? '0',
          totalMinor: costs?.totalMinor ?? '0',
        };
      });

      return ProjectBurnMatrixV1Schema.parse({
        projectId: project.rows[0].id,
        projectCode: project.rows[0].project_code,
        currencyCode: project.rows[0].currency_code,
        summary,
        rows,
      });
    });
  }
}
