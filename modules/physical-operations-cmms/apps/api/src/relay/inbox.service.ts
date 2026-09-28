import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { RelayEnvelopeV1Schema, WorkforceHandshakeFactV1Schema, type RelayEnvelopeV1, type WorkforceHandshakeFactV1 } from '@gigalibs/contracts';
import { type InboxReceiptOptions, receiveOnce } from '@gigalibs/module-sdk';
import type { PoolClient } from 'pg';
import type { CmmsCommandContext, CmmsPrincipal } from '../auth/authorization.js';
import { recordMutation } from '../common/command.js';
import { DatabaseService } from '../database/database.service.js';

const CONSUMER = 'cmms.workforce-handshake';
const RECEIPTS: InboxReceiptOptions = { schema: 'gigalibs_cmms', consumer: CONSUMER, sourceModule: 'workforce' };
const HANDLED = new Set([
  'WORKFORCE_WORK_REQUIREMENT_REQUESTED_V1',
  'WORKFORCE_WORK_REQUIREMENT_CANCELLED_V1',
  'WORKFORCE_STAFFING_REQUEST_REJECTED_V1',
  'WORKFORCE_RESOURCE_BOOKING_CREATED_V1',
  'WORKFORCE_RESOURCE_BOOKING_STATUS_CHANGED_V1',
]);

export type CmmsInboxOutcome = { readonly status: 'PROCESSED' | 'DUPLICATE' | 'REJECTED'; readonly code?: string };

/**
 * CMMS inbox for Workforce facts (WI-OI-068). Projects staffing state and bookings onto the work order; never
 * stores worker master data. Receipts dedupe redeliveries. Requirement facts settle the staffing request with the
 * same request key (or requirement id), so a withdrawn and replaced request is never settled by a stale fact;
 * booking updates older than the stored aggregate version are ignored.
 */
@Injectable()
export class CmmsInboxService {
  private readonly logger = new Logger(CmmsInboxService.name);

  constructor(private readonly database: DatabaseService) {}

  async receive(rawEnvelope: unknown, rawBody: string): Promise<CmmsInboxOutcome> {
    const parsed = RelayEnvelopeV1Schema.safeParse(rawEnvelope);
    if (!parsed.success) throw new BadRequestException({ code: 'CMMS_INBOX_ENVELOPE_INVALID', message: parsed.error.issues[0]?.message });
    const envelope = parsed.data;
    if (!HANDLED.has(envelope.eventType)) {
      throw new BadRequestException({ code: 'CMMS_INBOX_EVENT_UNKNOWN', message: `No consumer for ${envelope.eventType}.` });
    }
    // Receipt de-duplication from the module SDK (WI-OI-082): a redelivery is a DUPLICATE with no effect.
    return this.database.withTenantTransaction(envelope.tenantId, (client) =>
      receiveOnce(client, RECEIPTS, envelope, rawBody, () => this.apply(client, envelope)),
    );
  }

  private async apply(client: PoolClient, envelope: RelayEnvelopeV1): Promise<CmmsInboxOutcome> {
    const payload = WorkforceHandshakeFactV1Schema.safeParse(envelope.payload);
    if (!payload.success) return { status: 'REJECTED', code: 'CMMS_INBOX_PAYLOAD_INVALID' };
    const fact = payload.data;
    const tenantId = envelope.tenantId;
    const workOrder = await client.query(`SELECT id FROM gigalibs_cmms.work_orders WHERE tenant_id = $1 AND id = $2`, [tenantId, fact.sourceRef]);
    if (!workOrder.rows[0]) {
      this.logger.warn(`Workforce fact ${envelope.messageId} refers to an unknown work order.`);
      return { status: 'REJECTED', code: 'CMMS_WORK_ORDER_UNKNOWN' };
    }
    let summary: Record<string, unknown>;
    switch (envelope.eventType) {
      case 'WORKFORCE_WORK_REQUIREMENT_REQUESTED_V1':
        summary = await this.accepted(client, tenantId, fact.sourceRef, fact.requestKey ?? null, envelope.aggregateId);
        break;
      case 'WORKFORCE_STAFFING_REQUEST_REJECTED_V1':
        summary = await this.rejected(client, tenantId, fact.sourceRef, fact.requestKey ?? null, fact.reason ?? fact.code ?? 'Refused by Workforce');
        break;
      case 'WORKFORCE_WORK_REQUIREMENT_CANCELLED_V1':
        summary = await this.cancelled(client, tenantId, fact.sourceRef, envelope.aggregateId);
        break;
      default:
        summary = await this.projectBooking(client, envelope, fact);
    }
    await client.query(
      `INSERT INTO gigalibs_cmms.work_order_events (tenant_id, work_order_id, event_type, actor_subject, details, correlation_id)
       VALUES ($1, $2, 'STAFFING_UPDATED', 'relay:workforce', $3::jsonb, $4)`,
      [tenantId, fact.sourceRef, JSON.stringify({ workforceEvent: envelope.eventType, ...summary }), envelope.correlationId],
    );
    const context: CmmsCommandContext = { principal: relayPrincipal(tenantId), correlationId: envelope.correlationId };
    await recordMutation(client, context, {
      action: 'CMMS_WORKFORCE_FACT_APPLIED',
      aggregateType: 'CMMS_STAFFING_INBOX',
      aggregateId: envelope.messageId,
      aggregateVersion: 1,
      payload: { workOrderId: fact.sourceRef, workforceEvent: envelope.eventType, ...summary },
    });
    return { status: 'PROCESSED' };
  }

  /** Workforce opened a requirement for the request: record its id and accept, unless CMMS withdrew it meanwhile. */
  private async accepted(client: PoolClient, tenantId: string, workOrderId: string, requestKey: string | null, requirementId: string) {
    if (!requestKey) return { staffing: 'UNMATCHED' };
    const updated = await client.query<{ status: string }>(
      `UPDATE gigalibs_cmms.work_order_staffing
          SET requirement_ref = $4::uuid,
              status = CASE WHEN status = 'REQUESTED' THEN 'ACCEPTED' ELSE status END,
              version = version + 1, updated_at = now()
        WHERE tenant_id = $1 AND work_order_id = $2 AND request_key = $3::uuid
        RETURNING status`,
      [tenantId, workOrderId, requestKey, requirementId],
    );
    return { staffing: updated.rows[0]?.status ?? 'UNMATCHED', requirementRef: requirementId };
  }

  /** A refusal settles only the request it answers; a refused cancellation leaves CMMS state as it is. */
  private async rejected(client: PoolClient, tenantId: string, workOrderId: string, requestKey: string | null, reason: string) {
    if (!requestKey) return { staffing: 'UNCHANGED', reason: reason.slice(0, 500) };
    const updated = await client.query<{ status: string }>(
      `UPDATE gigalibs_cmms.work_order_staffing
          SET status = 'REJECTED', rejection_reason = $4, version = version + 1, updated_at = now()
        WHERE tenant_id = $1 AND work_order_id = $2 AND request_key = $3::uuid AND status = 'REQUESTED'
        RETURNING status`,
      [tenantId, workOrderId, requestKey, reason.slice(0, 500)],
    );
    return { staffing: updated.rows[0]?.status ?? 'UNCHANGED', reason: reason.slice(0, 500) };
  }

  /** The requirement was cancelled in Workforce (by CMMS or by a dispatcher). */
  private async cancelled(client: PoolClient, tenantId: string, workOrderId: string, requirementId: string) {
    const updated = await client.query<{ status: string }>(
      `UPDATE gigalibs_cmms.work_order_staffing
          SET status = 'CANCELLED', version = version + 1, updated_at = now()
        WHERE tenant_id = $1 AND work_order_id = $2 AND requirement_ref = $3::uuid AND status IN ('REQUESTED', 'ACCEPTED')
        RETURNING status`,
      [tenantId, workOrderId, requirementId],
    );
    return { staffing: updated.rows[0]?.status ?? 'UNCHANGED', requirementRef: requirementId };
  }

  private async projectBooking(client: PoolClient, envelope: RelayEnvelopeV1, fact: WorkforceHandshakeFactV1): Promise<Record<string, unknown>> {
    const status = envelope.eventType === 'WORKFORCE_RESOURCE_BOOKING_CREATED_V1' ? 'DRAFT' : fact.to;
    if (!status || !fact.requirementId || !fact.resourceId || !fact.startsAt || !fact.endsAt) {
      return { booking: envelope.aggregateId, ignored: 'incomplete booking fact' };
    }
    const result = await client.query(
      `INSERT INTO gigalibs_cmms.work_order_bookings
         (tenant_id, booking_ref, work_order_id, requirement_ref, resource_ref, resource_name, starts_at, ends_at, status, source_version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (tenant_id, booking_ref) DO UPDATE
         SET status = EXCLUDED.status, resource_name = EXCLUDED.resource_name, starts_at = EXCLUDED.starts_at,
             ends_at = EXCLUDED.ends_at, source_version = EXCLUDED.source_version, updated_at = now()
         WHERE gigalibs_cmms.work_order_bookings.source_version < EXCLUDED.source_version
       RETURNING status`,
      [envelope.tenantId, envelope.aggregateId, fact.sourceRef, fact.requirementId, fact.resourceId, fact.resourceName ?? null,
        fact.startsAt, fact.endsAt, status, envelope.aggregateVersion],
    );
    return { booking: envelope.aggregateId, status, applied: (result.rowCount ?? 0) > 0 };
  }
}

function relayPrincipal(tenantId: string): CmmsPrincipal {
  return Object.freeze({
    tenantId,
    subject: 'relay:workforce',
    sessionId: 'relay',
    authVersion: 0,
    permissions: Object.freeze(['cmms:*']),
    roles: Object.freeze([]),
    persona: 'OPERATIONS_SUPERVISOR' as const,
    departmentScope: Object.freeze({ mode: 'ALL' as const }),
    placeScope: Object.freeze({ mode: 'ALL' as const }),
  });
}
