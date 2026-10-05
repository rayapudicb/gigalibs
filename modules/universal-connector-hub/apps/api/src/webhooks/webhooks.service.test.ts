import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHash, createHmac } from 'node:crypto';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { WebhooksService } from './webhooks.service.js';
import type { DatabaseService } from '../database/database.service.js';

describe('WebhooksService (CN-04 Signature & Ingestion)', () => {
  let webhooksService: WebhooksService;
  let mockDb: any;

  beforeEach(() => {
    const query = vi.fn();
    mockDb = {
      query,
      queryWithTenant: query,
    };
    webhooksService = new WebhooksService(mockDb as unknown as DatabaseService);
  });

  describe('HMAC-SHA256 Signature Verification', () => {
    const secret = 'whsec_test_secret_9981273';
    const payload = JSON.stringify({ event: 'deal_won', amount: 50000 });

    it('validates a valid HMAC-SHA256 signature', () => {
      const validSig = createHmac('sha256', secret).update(payload).digest('hex');
      const res = webhooksService.verifySignature(secret, payload, {
        'x-sfdc-signature': validSig,
      });

      expect(res.valid).toBe(true);
    });

    it('rejects a tampered payload with mismatched signature', () => {
      const validSig = createHmac('sha256', secret).update(payload).digest('hex');
      const tamperedPayload = JSON.stringify({ event: 'deal_won', amount: 999999 });

      const res = webhooksService.verifySignature(secret, tamperedPayload, {
        'x-sfdc-signature': validSig,
      });

      expect(res.valid).toBe(false);
      expect(res.reason).toContain('mismatch');
    });

    it('validates Stripe signature format with timestamp', () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const v1Sig = createHmac('sha256', secret)
        .update(`${nowSec}.${payload}`)
        .digest('hex');

      const res = webhooksService.verifySignature(secret, payload, {
        'stripe-signature': `t=${nowSec},v1=${v1Sig}`,
      });

      expect(res.valid).toBe(true);
    });

    it('rejects webhook with expired timestamp outside 300s tolerance window', () => {
      const expiredSec = Math.floor(Date.now() / 1000) - 400; // 400 seconds ago
      const v1Sig = createHmac('sha256', secret)
        .update(`${expiredSec}.${payload}`)
        .digest('hex');

      const res = webhooksService.verifySignature(secret, payload, {
        'stripe-signature': `t=${expiredSec},v1=${v1Sig}`,
      });

      expect(res.valid).toBe(false);
      expect(res.reason).toContain('tolerance window');
    });
  });

  // WI-OI-120e (U3.2, P0-08): the endpoint ID in the URL names the connection and so the tenant; a header never does.
  describe('handleInboundWebhook Ingestion Lifecycle', () => {
    const endpointId = '6f1c2a7e-4b8d-4c3a-9e2f-0a1b2c3d4e5f';
    const mockConnection = {
      id: 'conn-wh-01',
      tenant_id: 'tenant-corp-01',
      name: 'Salesforce CRM',
      slug: 'salesforce-crm',
      status: 'READY',
      webhook_secret: 'whsec_secret_123',
      target_workflow_code: 'WF-O2C',
      connector_code: 'SALESFORCE_CRM',
    };
    const body = (payload: unknown) => Buffer.from(JSON.stringify(payload));
    const sign = (raw: Buffer) => createHmac('sha256', mockConnection.webhook_secret).update(raw).digest('hex');

    beforeEach(() => {
      mockDb.relayCall = vi.fn().mockResolvedValue([{ tenant_id: 'tenant-corp-01', connection_id: 'conn-wh-01' }]);
    });

    it('processes and ingests valid webhook and dispatches to workflow', async () => {
      process.env.WORKFLOW_STUDIO_API_URL = 'http://workflow-studio.gigalibs.internal:4000';
      const payload = { deal_id: 'OPP-101', amount: 75000 };
      const raw = body(payload);

      mockDb.query
        .mockResolvedValueOnce({ rowCount: 1, rows: [mockConnection] }) // find connection
        .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // idempotency check: not duplicate
        .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // insert raw_ingestion_journal
        .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // update journal DISPATCHED
        .mockResolvedValueOnce({ rowCount: 1, rows: [] }); // update tenant_connections

      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ run: { id: 'run-o2c-01', status: 'COMPLETED' }, steps: [1, 2] }),
      } as any);

      try {
        const result = await webhooksService.handleInboundWebhook(
          endpointId,
          raw,
          payload,
          { 'x-sfdc-signature': sign(raw), authorization: 'Basic c2VjcmV0' },
          '192.168.1.1',
        );

        expect(mockDb.relayCall).toHaveBeenCalledWith('resolve_webhook_endpoint', [endpointId]);
        expect(mockDb.query.mock.calls[0]?.[0]).toBe('tenant-corp-01');
        expect(result.success).toBe(true);
        expect(result.status).toBe('DISPATCHED');
        expect(result.dispatched_run_id).toBe('run-o2c-01');
        expect(result.pipeline_status).toBe('COMPLETED');
        expect(result.steps_executed).toBe(2);
        const journalInsert = mockDb.query.mock.calls[2]?.[2] as unknown[];
        expect(journalInsert[6]).toBe(raw.toString('utf8'));
        expect(JSON.parse(String(journalInsert[7]))).not.toHaveProperty('authorization');
      } finally {
        global.fetch = originalFetch;
        delete process.env.WORKFLOW_STUDIO_API_URL;
      }
    });

    it('checks the signature over the exact bytes received, not a re-serialised copy', async () => {
      const raw = Buffer.from('{ "deal_id" : "OPP-SPACED",  "amount": 1 }');
      mockDb.query
        .mockResolvedValueOnce({ rowCount: 1, rows: [mockConnection] })
        .mockResolvedValueOnce({ rowCount: 0, rows: [] })
        .mockResolvedValue({ rowCount: 1, rows: [] });
      const result = await webhooksService.handleInboundWebhook(
        endpointId,
        raw,
        JSON.parse(raw.toString('utf8')),
        { 'x-signature-sha256': `sha256=${sign(raw)}` },
      );
      // No Workflow Studio address is configured here, so the delivery is stored and not dispatched.
      expect(result.status).toBe('INGESTED');
      expect(result.payload_sha256).toBe(createHash('sha256').update(raw).digest('hex'));
    });

    it('identifies duplicate webhook and returns prior receipt without re-dispatching', async () => {
      const payload = { deal_id: 'OPP-DUP', amount: 5000 };
      const raw = body(payload);

      mockDb.query
        .mockResolvedValueOnce({ rowCount: 1, rows: [mockConnection] }) // find connection
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [
            {
              received_at: '2026-09-16T12:00:00Z',
              dispatched_run_id: 'run-prior-99',
            },
          ],
        }); // idempotency check: FOUND DUPLICATE

      const originalFetch = global.fetch;
      global.fetch = vi.fn(); // Should NOT be called

      try {
        const result = await webhooksService.handleInboundWebhook(endpointId, raw, payload, {
          'x-sfdc-signature': sign(raw),
          'idempotency-key': 'idemp-opp-dup',
        });

        expect(result.success).toBe(true);
        expect(result.status).toBe('DUPLICATE');
        expect(result.original_ingested_at).toBe('2026-09-16T12:00:00Z');
        expect(result.dispatched_run_id).toBe('run-prior-99');
        expect(global.fetch).not.toHaveBeenCalled();
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('rejects disabled connection with BadRequestException', async () => {
      mockDb.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ ...mockConnection, status: 'DISABLED' }] });
      await expect(
        webhooksService.handleInboundWebhook(endpointId, body({ any: 'data' }), { any: 'data' }, {}),
      ).rejects.toThrow('disabled');
    });

    it('rejects unauthorized webhook when signature is invalid', async () => {
      mockDb.query.mockResolvedValueOnce({ rowCount: 1, rows: [mockConnection] });
      await expect(
        webhooksService.handleInboundWebhook(endpointId, body({ deal_id: 'OPP-1' }), { deal_id: 'OPP-1' }, {
          'x-sfdc-signature': 'invalid_signature_hex_0000000000000000000000000000000000000000000000000000000000000000',
        }),
      ).rejects.toThrow('Webhook authentication failed');
    });

    it('refuses a connection that has no signing secret instead of skipping the check', async () => {
      mockDb.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ ...mockConnection, webhook_secret: null }] });
      await expect(
        webhooksService.handleInboundWebhook(endpointId, body({ deal_id: 'OPP-1' }), { deal_id: 'OPP-1' }, {}),
      ).rejects.toThrow('no signing secret');
      expect(mockDb.query).toHaveBeenCalledTimes(1);
    });

    it('answers 404 for an unknown endpoint and ignores any tenant header', async () => {
      mockDb.relayCall = vi.fn().mockResolvedValue([]);
      await expect(
        webhooksService.handleInboundWebhook(endpointId, body({ any: 'data' }), { any: 'data' }, { 'x-tenant-id': 'tenant-corp-01' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(mockDb.query).not.toHaveBeenCalled();
    });
  });

  describe('sendTestWebhook', () => {
    const connection = {
      id: 'conn-wh-02',
      tenant_id: 'tenant-a',
      name: 'Coupa',
      slug: 'coupa',
      status: 'READY',
      webhook_secret: 'whsec_test_delivery',
      target_workflow_code: null,
      connector_code: 'COUPA',
    };

    it("signs the payload with the connection's secret and ingests it for the caller's tenant only", async () => {
      mockDb.query
        .mockResolvedValueOnce({ rowCount: 1, rows: [connection] })
        .mockResolvedValueOnce({ rowCount: 0, rows: [] })
        .mockResolvedValue({ rowCount: 1, rows: [] });
      const result = await webhooksService.sendTestWebhook('tenant-a', 'coupa', { event_type: 'test.ping' });
      expect(result).toMatchObject({ success: true, status: 'INGESTED', test_delivery: true, connection_id: 'conn-wh-02' });
      expect(mockDb.query.mock.calls.every((call: unknown[]) => call[0] === 'tenant-a')).toBe(true);
      expect(String(mockDb.query.mock.calls[1]?.[2]?.[1])).toMatch(/^test-/);
    });

    it("answers 404 for another tenant's connection", async () => {
      mockDb.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
      await expect(webhooksService.sendTestWebhook('tenant-b', 'coupa', { event_type: 'test.ping' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('refuses a connection without a signing secret, and a payload that is not an object', async () => {
      mockDb.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ ...connection, webhook_secret: null }] });
      await expect(webhooksService.sendTestWebhook('tenant-a', 'coupa', { event_type: 'x' })).rejects.toBeInstanceOf(ConflictException);
      await expect(webhooksService.sendTestWebhook('tenant-a', 'coupa', ['not', 'an', 'object'])).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });
});
