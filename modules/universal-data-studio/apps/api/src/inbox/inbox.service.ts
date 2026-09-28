import { Injectable, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/database.service.js';
import { redactSensitiveData } from '../auth/data-redaction.js';

export interface InboxEventInput {
  tenantId: string;
  source: string;
  eventId: string;
  eventType: string;
  payload: Record<string, unknown>;
}

export interface InboxEventResult {
  status: string;
  replayed: boolean;
  eventId: string;
}

@Injectable()
export class InboxService {
  constructor(private readonly db: DatabaseService) {}

  async processEvent(input: InboxEventInput): Promise<InboxEventResult> {
    if (!input.tenantId || !input.source || !input.eventId || !input.eventType) {
      throw new BadRequestException('tenantId, source, eventId, and eventType are required');
    }

    const client = await this.db.getClient();
    try {
      await client.query('BEGIN');

      // 1. Deduplication check
      const existing = await client.query<{ id: string; status: string }>(
        `
          SELECT id, status
          FROM gigalibs_data_studio.inbox_events
          WHERE tenant_id = $1 AND source = $2 AND event_id = $3
          FOR UPDATE
        `,
        [input.tenantId, input.source, input.eventId],
      );

      if (existing.rows[0]?.status === 'PROCESSED') {
        await client.query('COMMIT');
        return {
          status: 'PROCESSED',
          replayed: true,
          eventId: input.eventId,
        };
      }

      // 2. Sanitize sensitive payload
      const { sanitized } = redactSensitiveData(input.payload);
      const inboxId = existing.rows[0]?.id ?? `inb-${randomUUID().slice(0, 8)}`;

      if (existing.rows[0]) {
        await client.query(
          `
            UPDATE gigalibs_data_studio.inbox_events
            SET status = 'PROCESSED', payload = $1::jsonb, processed_at = NOW()
            WHERE id = $2 AND tenant_id = $3
          `,
          [JSON.stringify(sanitized), inboxId, input.tenantId],
        );
      } else {
        await client.query(
          `
            INSERT INTO gigalibs_data_studio.inbox_events (
              id, tenant_id, source, event_id, event_type, payload, status, received_at, processed_at
            ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'PROCESSED', NOW(), NOW())
          `,
          [
            inboxId,
            input.tenantId,
            input.source,
            input.eventId,
            input.eventType,
            JSON.stringify(sanitized),
          ],
        );
      }

      await client.query('COMMIT');
      return {
        status: 'PROCESSED',
        replayed: false,
        eventId: input.eventId,
      };
    } catch (err: any) {
      await client.query('ROLLBACK');
      throw new BadRequestException(`Failed to process inbox event: ${err.message}`);
    } finally {
      client.release();
    }
  }
}
