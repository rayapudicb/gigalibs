import { Injectable, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

@Injectable()
export class LogsService {
  constructor(private readonly db: DatabaseService) {}

  async getLogs(tenantId: string, limit: number = 50): Promise<any[]> {
    if (!tenantId) {
      throw new BadRequestException('tenant_id is required');
    }

    return this.db.withTenantTransaction(tenantId, async (client) => {
      const sql = `
        SELECT 
          l.id, l.tenant_id, l.rule_id, l.rule_code, l.rule_version_id, l.context_id, l.domain,
          l.input_payload, l.matched, l.evaluation_verdict, l.proposed_action, l.is_preview,
          l.execution_latency_ms, l.action_taken, l.evaluated_at,
          r.name AS rule_name, r.scope, r.department, r.priority
        FROM gigalibs_rules.rule_evaluation_logs l
        LEFT JOIN gigalibs_rules.rules r ON l.rule_id = r.id
        WHERE l.tenant_id = $1
        ORDER BY l.evaluated_at DESC
        LIMIT $2
      `;
      const res = await client.query(sql, [tenantId, limit]);
      return res.rows;
    });
  }

  async getStats(tenantId: string): Promise<any> {
    if (!tenantId) {
      throw new BadRequestException('tenant_id is required');
    }

    return this.db.withTenantTransaction(tenantId, async (client) => {
      const rulesCountRes = await client.query(
        `SELECT count(*)::int AS total_rules,
                count(*) FILTER (WHERE status = 'ACTIVE')::int AS active_rules,
                count(*) FILTER (WHERE scope = 'PLATFORM')::int AS platform_rules,
                count(*) FILTER (WHERE scope = 'DEPARTMENT')::int AS department_rules
         FROM gigalibs_rules.rules WHERE tenant_id = $1 OR scope = 'PLATFORM'`,
        [tenantId]
      );

      const evalStatsRes = await client.query(
        `SELECT count(*)::int AS total_evaluations,
                count(*) FILTER (WHERE matched = true)::int AS matched_evaluations,
                count(*) FILTER (WHERE is_preview = true)::int AS preview_evaluations,
                coalesce(avg(execution_latency_ms), 0)::numeric(8, 3) AS avg_latency_ms
         FROM gigalibs_rules.rule_evaluation_logs WHERE tenant_id = $1`,
        [tenantId]
      );

      const tablesCountRes = await client.query(
        `SELECT count(*)::int AS total_decision_tables
         FROM gigalibs_rules.decision_tables WHERE tenant_id = $1`,
        [tenantId]
      );

      return {
        rules: rulesCountRes.rows[0],
        evaluations: evalStatsRes.rows[0],
        decision_tables: tablesCountRes.rows[0],
      };
    });
  }
}
