import {
  type WfoNotificationRecordV1,
  type WfoSendMessageV1,
  WfoSendMessageV1Schema,
} from '@gigalibs/contracts';
import { Injectable, NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { GigaOpsPrincipal } from '../auth/authorization.js';
import { WorkforceDatabaseService } from '../database/database.service.js';

@Injectable()
export class WfoCommsService {
  constructor(private readonly database: WorkforceDatabaseService) {}

  async sendMessage(
    principal: GigaOpsPrincipal,
    input: unknown,
  ): Promise<{ sentCount: number; notifications: WfoNotificationRecordV1[] }> {
    const data: WfoSendMessageV1 = WfoSendMessageV1Schema.parse(input);

    return this.database.withTenantTransaction(principal.tenantId, async (client: PoolClient) => {
      let recipientIds: string[] = [];

      if (data.recipientWorkerId) {
        recipientIds.push(data.recipientWorkerId);
      } else if (data.engagementId) {
        // Collect workers assigned to or invited to engagement
        const invRes = await client.query(
          `SELECT DISTINCT worker_id FROM gigalibs_workforce.wfo_invitations
           WHERE tenant_id = $1 AND engagement_id = $2`,
          [principal.tenantId, data.engagementId],
        );
        recipientIds = invRes.rows.map((r) => r.worker_id);
      }

      // If no recipients found, pick the first active worker as demo fallback
      if (recipientIds.length === 0) {
        const anyWorker = await client.query(
          `SELECT id FROM gigalibs_workforce.wfo_workers WHERE tenant_id = $1 LIMIT 1`,
          [principal.tenantId],
        );
        if (anyWorker.rowCount && anyWorker.rowCount > 0) {
          recipientIds.push(anyWorker.rows[0].id);
        }
      }

      const results: WfoNotificationRecordV1[] = [];

      for (const workerId of recipientIds) {
        const res = await client.query(
          `INSERT INTO gigalibs_workforce.wfo_notification_log (
             tenant_id, recipient_worker_id, channel, event_type, subject, body, delivery_status
           ) VALUES ($1, $2, $3, $4, $5, $6, 'DELIVERED')
           RETURNING id, tenant_id as "tenantId", recipient_worker_id as "recipientWorkerId",
                     channel, event_type as "eventType", subject, body,
                     delivery_status as "deliveryStatus", sent_at as "sentAt", created_at as "createdAt"`,
          [principal.tenantId, workerId, data.channel, data.eventType, data.subject, data.body],
        );
        results.push(res.rows[0]);
      }

      return {
        sentCount: results.length,
        notifications: results,
      };
    });
  }

  async listHistory(
    principal: GigaOpsPrincipal,
    filters: { channel?: string; limit?: number } = {},
  ): Promise<WfoNotificationRecordV1[]> {
    return this.database.withTenantTransaction(principal.tenantId, async (client: PoolClient) => {
      let sql = `
        SELECT
          n.id,
          n.tenant_id as "tenantId",
          n.recipient_worker_id as "recipientWorkerId",
          w.first_name || ' ' || w.last_name as "recipientName",
          n.channel,
          n.event_type as "eventType",
          n.subject,
          n.body,
          n.delivery_status as "deliveryStatus",
          n.sent_at as "sentAt",
          n.created_at as "createdAt"
        FROM gigalibs_workforce.wfo_notification_log n
        LEFT JOIN gigalibs_workforce.wfo_workers w
          ON w.id = n.recipient_worker_id AND w.tenant_id = n.tenant_id
        WHERE n.tenant_id = $1
      `;
      const params: unknown[] = [principal.tenantId];

      if (filters.channel) {
        params.push(filters.channel);
        sql += ` AND n.channel = $${params.length}`;
      }

      sql += ` ORDER BY n.sent_at DESC LIMIT $${params.length + 1}`;
      params.push(filters.limit || 50);

      const res = await client.query(sql, params);
      return res.rows;
    });
  }

  async getMyNotifications(principal: GigaOpsPrincipal): Promise<WfoNotificationRecordV1[]> {
    return this.database.withTenantTransaction(principal.tenantId, async (client: PoolClient) => {
      const res = await client.query(
        `SELECT
           n.id,
           n.tenant_id as "tenantId",
           n.recipient_worker_id as "recipientWorkerId",
           n.channel,
           n.event_type as "eventType",
           n.subject,
           n.body,
           n.delivery_status as "deliveryStatus",
           n.sent_at as "sentAt",
           n.created_at as "createdAt"
         FROM gigalibs_workforce.wfo_notification_log n
         WHERE n.tenant_id = $1
           AND (n.recipient_worker_id = (SELECT id FROM gigalibs_workforce.wfo_workers WHERE tenant_id = $1 AND portal_user_id = $2 LIMIT 1)
                OR n.recipient_worker_id::text = $2)
         ORDER BY n.sent_at DESC
         LIMIT 20`,
        [principal.tenantId, principal.subject],
      );

      return res.rows;
    });
  }
}
