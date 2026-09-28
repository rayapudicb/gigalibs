import { BadRequestException, HttpException, Injectable, Logger } from '@nestjs/common';
import {
  CmmsStaffingCancelledV1Schema,
  CmmsStaffingRequestedV1Schema,
  CreateWorkRequirementV1Schema,
  RelayEnvelopeV1Schema,
} from '@gigalibs/contracts';
import { type InboxReceiptOptions, receiveOnce } from '@gigalibs/module-sdk';
import type { PoolClient } from 'pg';
import type { GigaOpsPrincipal } from '../auth/authorization.js';
import { BookingsService } from '../bookings/bookings.service.js';
import { type CommandContext, recordMutation } from '../common/commands.js';
import { WorkforceDatabaseService } from '../database/database.service.js';

const CONSUMER = 'workforce.cmms-handshake';
const RECEIPTS: InboxReceiptOptions = { schema: 'gigalibs_workforce', consumer: CONSUMER, sourceModule: 'cmms' };

export type InboxOutcome = { readonly status: 'PROCESSED' | 'DUPLICATE' | 'REJECTED'; readonly code?: string };

/**
 * Workforce inbox for CMMS staffing (WI-OI-068). A receipt keyed by (consumer, message id) commits in the same
 * transaction as the effect, so redelivery never repeats it. A business refusal (unknown capability, invalid
 * window, a live requirement already open) is receipted and answered with a
 * `WORKFORCE_STAFFING_REQUEST_REJECTED` fact rather than retried; infrastructure errors roll back so the
 * producer's relay retries. Facts carry the CMMS request key so CMMS settles the exact staffing request.
 */
@Injectable()
export class WorkforceInboxService {
  private readonly logger = new Logger(WorkforceInboxService.name);

  constructor(
    private readonly database: WorkforceDatabaseService,
    private readonly bookings: BookingsService,
  ) {}

  async receive(rawEnvelope: unknown, rawBody: string): Promise<InboxOutcome> {
    const parsed = RelayEnvelopeV1Schema.safeParse(rawEnvelope);
    if (!parsed.success) throw new BadRequestException({ code: 'WORKFORCE_INBOX_ENVELOPE_INVALID', message: parsed.error.issues[0]?.message });
    const envelope = parsed.data;
    if (!['CMMS_STAFFING_REQUESTED_V1', 'CMMS_STAFFING_CANCELLED_V1'].includes(envelope.eventType)) {
      throw new BadRequestException({ code: 'WORKFORCE_INBOX_EVENT_UNKNOWN', message: `No consumer for ${envelope.eventType}.` });
    }
    // Receipt de-duplication from the module SDK (WI-OI-082): a redelivery is a DUPLICATE with no effect.
    return this.database.withTenantTransaction(envelope.tenantId, (client) =>
      receiveOnce(client, RECEIPTS, envelope, rawBody, () => {
        const context: CommandContext = { principal: relayPrincipal(envelope.tenantId), correlationId: envelope.correlationId };
        return envelope.eventType === 'CMMS_STAFFING_REQUESTED_V1'
          ? this.staffingRequested(client, context, envelope.messageId, envelope.payload)
          : this.staffingCancelled(client, context, envelope.messageId, envelope.payload);
      }),
    );
  }

  private async staffingRequested(client: PoolClient, context: CommandContext, messageId: string, rawPayload: unknown): Promise<InboxOutcome> {
    const payload = CmmsStaffingRequestedV1Schema.safeParse(rawPayload);
    if (!payload.success) return this.reject(client, context, messageId, null, 'WORKFORCE_STAFFING_PAYLOAD_INVALID', payload.error.issues[0]?.message ?? 'Invalid staffing request.');
    const request = payload.data;
    const codes = [...new Set(request.capabilityCodes.map((code) => code.toUpperCase()))];
    const known = await client.query<{ id: string; code: string }>(
      `SELECT id, code FROM gigalibs_workforce.capability_definitions WHERE tenant_id = $1 AND status = 'ACTIVE' AND code = ANY($2::text[])`,
      [context.principal.tenantId, codes],
    );
    const unknown = codes.filter((code) => !known.rows.some((row) => row.code === code));
    if (unknown.length) {
      return this.reject(client, context, messageId, request.workOrderId, 'WORKFORCE_CAPABILITY_UNKNOWN', `Workforce has no active capability ${unknown.join(', ')}.`, request.requestKey);
    }
    const input = CreateWorkRequirementV1Schema.safeParse({
      requestKey: request.requestKey,
      title: `${request.woNumber} ${request.title}`.slice(0, 240),
      sourceType: 'CMMS_WORK_ORDER',
      sourceRef: request.workOrderId,
      siteRef: request.siteRef,
      startsAt: request.startsAt,
      endsAt: request.endsAt,
      headcount: request.headcount,
      requiredCapabilities: known.rows.map((row) => ({ capabilityDefinitionId: row.id, minimumProficiency: 'STANDARD' })),
    });
    if (!input.success) {
      return this.reject(client, context, messageId, request.workOrderId, 'WORKFORCE_STAFFING_PAYLOAD_INVALID', input.error.issues[0]?.message ?? 'Invalid staffing request.', request.requestKey);
    }
    try {
      await this.bookings.createRequirementWithClient(client, context, input.data);
      return { status: 'PROCESSED' };
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() < 500) {
        return this.reject(client, context, messageId, request.workOrderId, 'WORKFORCE_REQUIREMENT_REFUSED', messageOf(error), request.requestKey);
      }
      throw error;
    }
  }

  private async staffingCancelled(client: PoolClient, context: CommandContext, messageId: string, rawPayload: unknown): Promise<InboxOutcome> {
    const payload = CmmsStaffingCancelledV1Schema.safeParse(rawPayload);
    if (!payload.success) return this.reject(client, context, messageId, null, 'WORKFORCE_STAFFING_PAYLOAD_INVALID', payload.error.issues[0]?.message ?? 'Invalid cancellation.');
    const live = await client.query<{ id: string }>(
      `SELECT id FROM gigalibs_workforce.work_requirements
        WHERE tenant_id = $1 AND source_type = 'CMMS_WORK_ORDER' AND source_ref = $2 AND status <> 'CANCELLED'`,
      [context.principal.tenantId, payload.data.workOrderId],
    );
    if (!live.rows[0]) return { status: 'PROCESSED', code: 'NOTHING_TO_CANCEL' };
    try {
      await this.bookings.cancelRequirementWithClient(client, context, live.rows[0].id, null, `CMMS: ${payload.data.reason}`.slice(0, 500));
      return { status: 'PROCESSED' };
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() < 500) {
        return this.reject(client, context, messageId, payload.data.workOrderId, 'WORKFORCE_CANCELLATION_REFUSED', messageOf(error));
      }
      throw error;
    }
  }

  private async reject(
    client: PoolClient,
    context: CommandContext,
    messageId: string,
    workOrderId: string | null,
    code: string,
    reason: string,
    requestKey: string | null = null,
  ): Promise<InboxOutcome> {
    this.logger.warn(`Staffing message ${messageId} refused: ${code}.`);
    if (workOrderId) {
      await recordMutation(client, context, 'WORKFORCE_STAFFING_REQUEST_REJECTED', 'WORKFORCE_STAFFING_REQUEST', messageId, 1, {
        sourceType: 'CMMS_WORK_ORDER',
        sourceRef: workOrderId,
        requestKey,
        code,
        reason: reason.slice(0, 500),
      });
    }
    return { status: 'REJECTED', code };
  }
}

function relayPrincipal(tenantId: string): GigaOpsPrincipal {
  return Object.freeze({
    tenantId,
    subject: 'relay:cmms',
    sessionId: 'relay',
    authVersion: 0,
    permissions: Object.freeze(['workforce:*']),
    roles: Object.freeze([]),
    persona: 'OPERATIONS_SUPERVISOR' as const,
    orgScope: Object.freeze({ mode: 'FLAT_TENANT' as const }),
    spatialScope: Object.freeze({ mode: 'UNBOUNDED' as const }),
  });
}

function messageOf(error: HttpException): string {
  const response = error.getResponse();
  if (typeof response === 'object' && response && 'message' in response && typeof (response as { message: unknown }).message === 'string') {
    return (response as { message: string }).message;
  }
  return error.message;
}
