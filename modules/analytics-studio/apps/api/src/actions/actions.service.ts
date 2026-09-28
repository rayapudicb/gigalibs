import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { AnalyticsPrincipal } from '../auth/authorization.js';
import { DatabaseService } from '../database/database.service.js';

export interface ExecuteActionDto {
  actionType:
    | 'FORCE_METRIC_RECOMPUTE'
    | 'DISPATCH_LINEAGE_ATTESTATION'
    | 'TRIGGER_CROSS_MODULE_AUDIT'
    | 'FREEZE_SUSPICIOUS_ANOMALY';
  targetDomain: string;
  targetEntity: string;
  reason?: string;
  parameters?: Record<string, unknown>;
}

export interface ActionReceipt {
  actionId: string;
  tenantId: string;
  actionType: string;
  targetDomain: string;
  targetEntity: string;
  actorSubject: string;
  receiptDigest: string;
  executedAt: string;
  impactSummary: Record<string, unknown>;
}

type ActionRow = {
  id: string;
  action_type: string;
  target_domain: string;
  target_entity: string;
  actor_subject: string;
  reason: string | null;
  impact_summary: Record<string, unknown>;
  receipt_digest: string;
  executed_at: Date | string;
};

@Injectable()
export class ActionsService {
  constructor(private readonly db: DatabaseService) {}

  async executeAction(
    _tenantId: string,
    _dto: ExecuteActionDto,
    _principal: AnalyticsPrincipal,
  ): Promise<ActionReceipt> {
    throw new ServiceUnavailableException(
      'Legacy executive actions are contained until WI-OI-043 implements real governed actions and reconciliation.',
    );
  }

  async listRecentActions(tenantId: string): Promise<ActionRow[]> {
    const result = await this.db.queryWithTenant<ActionRow>(
      tenantId,
      `SELECT id, action_type, target_domain, target_entity, actor_subject, reason,
              impact_summary, receipt_digest, executed_at
       FROM gigalibs_analytics.executive_actions
       WHERE tenant_id = $1
       ORDER BY executed_at DESC
       LIMIT 20`,
      [tenantId],
    );
    return result.rows;
  }
}
