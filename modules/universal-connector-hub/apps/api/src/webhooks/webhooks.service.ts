import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Inject,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { randomUUID, createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { DatabaseService } from '../database/database.service.js';

type WebhookHeaders = Record<string, unknown>;

/** Request headers never kept in the ingestion journal: they can carry the sender's own credentials. */
const UNSTORED_HEADERS = new Set(['authorization', 'proxy-authorization', 'cookie', 'set-cookie']);
const MAX_TEST_PAYLOAD_BYTES = 64 * 1024;

function isJsonObject(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Constant-time comparison that answers false, instead of throwing, when the lengths differ. */
function sameBytes(expected: Buffer, actual: Buffer): boolean {
  return expected.length === actual.length && expected.length > 0 && timingSafeEqual(expected, actual);
}

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  /**
   * CN-04: Validate cryptographic signature against raw payload.
   */
  verifySignature(
    secret: string,
    rawPayload: Buffer | string,
    headers: WebhookHeaders,
  ): { valid: boolean; reason?: string } {
    const normHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) {
      normHeaders[k.toLowerCase()] = String(v);
    }

    // 1. Stripe signature format: t=123456,v1=hexsignature
    const stripeSig = normHeaders['stripe-signature'];
    if (stripeSig) {
      const parts = stripeSig.split(',');
      let timestamp = '';
      let sig = '';
      for (const p of parts) {
        const [k, v] = p.trim().split('=');
        if (k === 't') timestamp = v;
        if (k === 'v1') sig = v;
      }

      if (!timestamp || !sig) {
        return { valid: false, reason: 'Malformed Stripe-Signature header' };
      }

      // Replay attack check: 300 seconds
      const eventTimeSec = parseInt(timestamp, 10);
      const currentTimeSec = Math.floor(Date.now() / 1000);
      if (Math.abs(currentTimeSec - eventTimeSec) > 300) {
        return { valid: false, reason: 'Webhook signature timestamp outside tolerance window (300s)' };
      }

      const expected = createHmac('sha256', secret)
        .update(`${timestamp}.`)
        .update(rawPayload)
        .digest('hex');

      const isValid = /^[0-9a-f]+$/i.test(sig) && sameBytes(Buffer.from(expected, 'hex'), Buffer.from(sig, 'hex'));

      return isValid ? { valid: true } : { valid: false, reason: 'Stripe signature mismatch' };
    }

    // 2. Generic HMAC signatures: x-sfdc-signature, x-coupa-signature, x-hub-signature-256, x-signature-sha256
    const candidateSig =
      normHeaders['x-sfdc-signature'] ||
      normHeaders['x-coupa-signature'] ||
      normHeaders['x-hub-signature-256'] ||
      normHeaders['x-signature-sha256'] ||
      normHeaders['x-signature'] ||
      normHeaders['plaid-verification'];

    if (!candidateSig) {
      return { valid: false, reason: 'Webhook signature header is required' };
    }

    // Clean up possible "sha256=" prefix (GitHub / generic standard)
    const cleanSig = candidateSig.startsWith('sha256=')
      ? candidateSig.slice(7)
      : candidateSig;

    // Verify timestamp if provided
    const tsHeader = normHeaders['x-timestamp'] || normHeaders['x-request-timestamp'];
    if (tsHeader) {
      const ts = parseInt(tsHeader, 10);
      const now = Date.now();
      // Supports both seconds and milliseconds timestamps
      const diffSec = ts > 1e11 ? Math.abs(now - ts) / 1000 : Math.abs(Math.floor(now / 1000) - ts);
      if (diffSec > 300) {
        return { valid: false, reason: 'Webhook timestamp expired (> 300s)' };
      }
    }

    const expectedHex = createHmac('sha256', secret).update(rawPayload).digest('hex');

    // Also support base64 signatures (Salesforce standard)
    const expectedBase64 = createHmac('sha256', secret).update(rawPayload).digest('base64');

    let isValid = false;
    if (cleanSig.length === expectedHex.length) {
      try {
        isValid = timingSafeEqual(Buffer.from(expectedHex, 'hex'), Buffer.from(cleanSig, 'hex'));
      } catch {
        isValid = false;
      }
    }

    if (!isValid && cleanSig.length === expectedBase64.length) {
      try {
        isValid = timingSafeEqual(Buffer.from(expectedBase64), Buffer.from(cleanSig));
      } catch {
        isValid = false;
      }
    }

    return isValid ? { valid: true } : { valid: false, reason: 'Cryptographic signature mismatch' };
  }

  /**
   * WI-OI-120e (U3.2, P0-08): an outside delivery. The endpoint ID names the connection, and so the tenant; the
   * connection must have a signing secret, and the signature must match the exact bytes received.
   */
  async handleInboundWebhook(
    endpointId: string,
    rawBody: Buffer,
    payload: unknown,
    headers: WebhookHeaders,
    clientIp: string = 'unknown',
  ): Promise<any> {
    const startTime = performance.now();
    if (!isJsonObject(payload)) {
      throw new BadRequestException('Webhook payload must be a valid JSON object');
    }

    const [endpoint] = await this.db.relayCall<{ tenant_id: string; connection_id: string }>(
      'resolve_webhook_endpoint',
      [endpointId],
    );
    const connection = endpoint ? await this.tenantConnection(endpoint.tenant_id, endpoint.connection_id) : undefined;
    if (!connection) {
      throw new NotFoundException('Webhook endpoint not found');
    }
    if (connection.status === 'DISABLED') {
      throw new BadRequestException('This connection is disabled');
    }
    if (!connection.webhook_secret) {
      throw new UnauthorizedException('Webhook authentication failed: the connection has no signing secret');
    }
    const sigCheck = this.verifySignature(connection.webhook_secret, rawBody, headers);
    if (!sigCheck.valid) {
      throw new UnauthorizedException(`Webhook authentication failed: ${sigCheck.reason}`);
    }
    return this.ingest(connection, rawBody, payload, headers, clientIp, startTime);
  }

  /**
   * A test delivery a signed-in user sends to one of their own tenant's connections. The hub signs the payload with
   * the connection's secret and ingests it through the same checks as an outside delivery.
   */
  async sendTestWebhook(tenantId: string, idOrSlug: string, payload: unknown): Promise<any> {
    const startTime = performance.now();
    if (!isJsonObject(payload)) {
      throw new BadRequestException('The test payload must be a JSON object');
    }
    const rawBody = Buffer.from(JSON.stringify(payload));
    if (rawBody.length > MAX_TEST_PAYLOAD_BYTES) {
      throw new BadRequestException(`The test payload must be at most ${MAX_TEST_PAYLOAD_BYTES} bytes`);
    }
    const connection = await this.tenantConnection(tenantId, idOrSlug);
    if (!connection) {
      throw new NotFoundException(`Connection '${idOrSlug}' not found`);
    }
    if (connection.status === 'DISABLED') {
      throw new BadRequestException('This connection is disabled');
    }
    if (!connection.webhook_secret) {
      throw new ConflictException('This connection has no signing secret, so it cannot receive webhooks');
    }
    const headers: WebhookHeaders = {
      'content-type': 'application/json',
      'x-signature-sha256': createHmac('sha256', connection.webhook_secret).update(rawBody).digest('hex'),
      'idempotency-key': `test-${randomUUID()}`,
      'x-gigalibs-test-delivery': 'true',
    };
    const sigCheck = this.verifySignature(connection.webhook_secret, rawBody, headers);
    if (!sigCheck.valid) {
      throw new Error('The test delivery did not pass its own signature check.');
    }
    return { ...(await this.ingest(connection, rawBody, payload, headers, 'test-delivery', startTime)), test_delivery: true };
  }

  /** One connection of one tenant, by ID or slug, read under that tenant's row-level security. */
  private async tenantConnection(tenantId: string, idOrSlug: string): Promise<any | undefined> {
    const result = await this.db.queryWithTenant(
      tenantId,
      `SELECT * FROM gigalibs_connectors.tenant_connections
       WHERE tenant_id = $1 AND (id = $2 OR slug = $2)`,
      [tenantId, idOrSlug],
    );
    return result.rows[0];
  }

  private async ingest(
    connection: any,
    rawBody: Buffer,
    payload: Record<string, any>,
    headers: WebhookHeaders,
    clientIp: string,
    startTime: number,
  ): Promise<any> {
    const tenantId: string = connection.tenant_id;
    const rawPayload = rawBody.toString('utf8');

    // 3. Payload SHA-256 and idempotency derivation
    const payloadSha256 = createHash('sha256').update(rawBody).digest('hex');

    const normHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) {
      normHeaders[k.toLowerCase()] = String(v);
    }

    const idempotencyKey =
      normHeaders['idempotency-key'] ||
      normHeaders['x-idempotency-key'] ||
      payload.event_id ||
      payload.id ||
      payload.deal_id ||
      payload.requisition_id ||
      payload.transaction_id ||
      `wh-${payloadSha256.slice(0, 16)}`;

    const eventType =
      normHeaders['x-event-type'] ||
      payload.event_type ||
      (payload.deal_id
        ? 'opportunity.closed_won'
        : payload.requisition_id
        ? 'requisition.created'
        : payload.transaction_id
        ? 'transaction.authorized'
        : 'inbound.webhook');

    const ingestId = `ing-${randomUUID().slice(0, 8)}`;

    // 4. Idempotency de-duplication check
    const existing = await this.db.queryWithTenant(
      tenantId,
      `SELECT * FROM gigalibs_connectors.raw_ingestion_journal 
       WHERE tenant_id = $1 AND idempotency_key = $2`,
      [connection.tenant_id, idempotencyKey],
    );

    if (existing.rowCount && existing.rowCount > 0) {
      const prior = existing.rows[0];
      return {
        success: true,
        status: 'DUPLICATE',
        message: 'Webhook already processed (Idempotency token matched)',
        idempotency_key: idempotencyKey,
        original_ingested_at: prior.received_at,
        dispatched_run_id: prior.dispatched_run_id,
        duration_ms: Math.round(performance.now() - startTime),
      };
    }

    // 5. Append-only archive to Raw Ingestion Journal
    await this.db.queryWithTenant(
      tenantId,
      `INSERT INTO gigalibs_connectors.raw_ingestion_journal (
        id, tenant_id, connection_id, idempotency_key, event_type, payload_sha256,
        raw_payload, headers, client_ip, status, received_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'INGESTED', NOW())`,
      [
        ingestId,
        connection.tenant_id,
        connection.id,
        idempotencyKey,
        eventType,
        payloadSha256,
        rawPayload,
        JSON.stringify(Object.fromEntries(Object.entries(headers || {}).filter(([name]) => !UNSTORED_HEADERS.has(name.toLowerCase())))),
        clientIp || 'unknown',
      ],
    );

    // 6. Dispatch to Workflow Studio if target pipeline attached
    let dispatchedRunId: string | null = null;
    let pipelineStatus = 'UNATTACHED';
    let stepsExecuted = 0;
    let dispatchError: string | null = null;

    if (connection.target_workflow_code) {
      try {
        const wfBaseUrl = process.env.WORKFLOW_STUDIO_API_URL;
        if (!wfBaseUrl) {
          this.logger.debug('WORKFLOW_STUDIO_API_URL not set; skipping automated dispatch');
          pipelineStatus = 'DISPATCH_UNCONFIGURED';
        } else {
          const wfUrl = `${wfBaseUrl.replace(/\/$/, '')}/api/workflow/v1/workflows/${connection.target_workflow_code}/execute`;

          const wfRes = await fetch(wfUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-tenant-id': connection.tenant_id,
              'x-correlation-id': idempotencyKey,
            },
            body: JSON.stringify({
              trigger_type: 'EVENT_WEBHOOK',
              trigger_payload: payload,
            }),
            signal: AbortSignal.timeout(5_000),
          });

          if (wfRes.ok) {
            const wfData: any = await wfRes.json();
            const receivedRunId = wfData.run?.id || wfData.run_id;
            if (typeof receivedRunId !== 'string' || !receivedRunId) {
              throw new Error('Workflow Studio response did not include a durable run identifier.');
            }
            dispatchedRunId = receivedRunId;
            pipelineStatus = wfData.run?.status || wfData.status || 'COMPLETED';
            stepsExecuted = wfData.steps?.length || wfData.steps_executed || 0;

            await this.db.queryWithTenant(
              tenantId,
              `UPDATE gigalibs_connectors.raw_ingestion_journal
               SET status = 'DISPATCHED', dispatched_run_id = $1, duration_ms = $2, dispatch_attempts = 1
               WHERE id = $3`,
              [dispatchedRunId, Math.round(performance.now() - startTime), ingestId],
            );
          } else {
            dispatchError = `Workflow Studio dispatch returned HTTP ${wfRes.status}`;
            this.logger.warn(dispatchError);
            await this.db.queryWithTenant(
              tenantId,
              `UPDATE gigalibs_connectors.raw_ingestion_journal
               SET status = 'FAILED', last_dispatch_error = $1, dispatch_attempts = 1
               WHERE id = $2`,
              [dispatchError, ingestId],
            );
          }
        }
      } catch (wfErr: any) {
        dispatchError = `Failed to trigger Workflow Studio: ${wfErr.message}`;
        this.logger.error(dispatchError);
        await this.db.queryWithTenant(
          tenantId,
          `UPDATE gigalibs_connectors.raw_ingestion_journal
           SET status = 'FAILED', last_dispatch_error = $1, dispatch_attempts = 1
           WHERE id = $2`,
          [dispatchError, ingestId],
        );
      }
    }

    // 7. Update connection stats
    await this.db.queryWithTenant(
      tenantId,
      `UPDATE gigalibs_connectors.tenant_connections 
       SET events_count = events_count + 1, last_sync_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [connection.id],
    );

    const totalDurationMs = Math.round(performance.now() - startTime);

    return {
      success: true,
      status: dispatchedRunId ? 'DISPATCHED' : (dispatchError ? 'FAILED' : 'INGESTED'),
      ingest_id: ingestId,
      connection_id: connection.id,
      connection_name: connection.name,
      slug: connection.slug,
      target_workflow: connection.target_workflow_code,
      idempotency_key: idempotencyKey,
      payload_sha256: payloadSha256,
      dispatched_run_id: dispatchedRunId,
      pipeline_status: pipelineStatus,
      steps_executed: stepsExecuted,
      duration_ms: totalDurationMs,
      ...(dispatchError ? { dispatch_error: dispatchError } : {}),
    };
  }
}
