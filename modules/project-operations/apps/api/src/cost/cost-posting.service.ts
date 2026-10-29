import { randomUUID } from 'node:crypto';
import {
  PROJECT_WIP_ACCRUAL_REQUESTED_V1,
  ProjectCostAccrualInputV1Schema,
  ProjectWipAccrualRequestedPayloadV1Schema,
  accrueProjectCosts,
} from '@gigalibs/contracts';
import { type ModuleCommandContext, recordMutation } from '@gigalibs/module-sdk';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { SCHEMA, TOPIC } from '../config.js';
import { DatabaseService } from '../database.service.js';

export const PostProjectWipAccrualInputV1Schema = ProjectCostAccrualInputV1Schema.extend({
  requestKey: z.string().uuid(),
});
export type PostProjectWipAccrualInputV1 = z.infer<typeof PostProjectWipAccrualInputV1Schema>;

interface ProjectRow {
  id: string;
  org_unit_id: string;
  currency_code: string;
}

@Injectable()
export class CostPostingService {
  constructor(private readonly database: DatabaseService) {}

  async postWipAccrual(
    context: ModuleCommandContext,
    projectId: string,
    input: PostProjectWipAccrualInputV1,
  ): Promise<{ postingId: string; replayed: boolean; materialMinor: string; laborMinor: string; totalMinor: string }> {
    const parsed = PostProjectWipAccrualInputV1Schema.parse(input);
    const accrual = accrueProjectCosts(parsed);
    const projectSlice = accrual.projects.find((row) => row.projectId === projectId);
    if (!projectSlice || projectSlice.totalMinor === '0') {
      throw new BadRequestException({ code: 'PROJECT_WIP_ACCRUAL_EMPTY' });
    }

    const tenantId = context.principal.tenantId;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const prior = await client.query<{ id: string; material_minor: string; labor_minor: string; total_minor: string }>(
        `SELECT id, material_minor::text, labor_minor::text, total_minor::text
           FROM ${SCHEMA}.project_cost_postings
          WHERE tenant_id = $1 AND request_key = $2`,
        [tenantId, parsed.requestKey],
      );
      if (prior.rows[0]) {
        return {
          postingId: prior.rows[0].id,
          replayed: true,
          materialMinor: prior.rows[0].material_minor,
          laborMinor: prior.rows[0].labor_minor,
          totalMinor: prior.rows[0].total_minor,
        };
      }

      const project = await client.query<ProjectRow>(
        `SELECT id, org_unit_id, currency_code FROM ${SCHEMA}.projects WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
        [tenantId, projectId],
      );
      if (!project.rows[0]) throw new NotFoundException({ code: 'PROJECT_NOT_FOUND' });

      const postingId = randomUUID();
      const payload = ProjectWipAccrualRequestedPayloadV1Schema.parse({
        postingId,
        requestKey: parsed.requestKey,
        projectId,
        orgUnitId: project.rows[0].org_unit_id,
        currencyCode: project.rows[0].currency_code,
        materialMinor: projectSlice.materialMinor,
        laborMinor: projectSlice.laborMinor,
        totalMinor: projectSlice.totalMinor,
      });

      await client.query(
        `INSERT INTO ${SCHEMA}.project_cost_postings
           (id, tenant_id, project_id, request_key, material_minor, labor_minor, total_minor, currency_code, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          postingId,
          tenantId,
          projectId,
          parsed.requestKey,
          payload.materialMinor,
          payload.laborMinor,
          payload.totalMinor,
          payload.currencyCode,
          context.principal.subject,
        ],
      );

      await recordMutation(client, { schema: SCHEMA, topic: TOPIC }, context, {
        action: 'PROJECT_WIP_ACCRUAL_REQUESTED',
        aggregateType: 'project_cost_posting',
        aggregateId: postingId,
        aggregateVersion: 1,
        payload,
      });

      await client.query(
        `INSERT INTO ${SCHEMA}.outbox_events
           (id, tenant_id, topic, event_type, aggregate_type, aggregate_id, aggregate_version,
            correlation_id, schema_version, payload)
         VALUES ($1, $2, $3, $4, $5, $6, 1, $7, 1, $8::jsonb)`,
        [
          randomUUID(),
          tenantId,
          TOPIC,
          PROJECT_WIP_ACCRUAL_REQUESTED_V1,
          'project_cost_posting',
          postingId,
          context.correlationId,
          JSON.stringify(payload),
        ],
      );

      return {
        postingId,
        replayed: false,
        materialMinor: payload.materialMinor,
        laborMinor: payload.laborMinor,
        totalMinor: payload.totalMinor,
      };
    });
  }
}
