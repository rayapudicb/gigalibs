import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHmac } from 'node:crypto';
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

  describe('handleInboundWebhook Ingestion Lifecycle', () => {
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

    it('processes and ingests valid webhook and dispatches to workflow', async () => {
      process.env.WORKFLOW_STUDIO_API_URL = 'http://workflow-studio.gigalibs.internal:4000';
      const payload = { deal_id: 'OPP-101', amount: 75000 };
      const rawPayload = JSON.stringify(payload);
      const signature = createHmac('sha256', mockConnection.webhook_secret)
        .update(rawPayload)
        .digest('hex');

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
          'salesforce-crm',
          payload,
          { 'x-sfdc-signature': signature },
          '192.168.1.1',
          'tenant-corp-01',
        );

        expect(result.success).toBe(true);
        expect(result.status).toBe('DISPATCHED');
        expect(result.dispatched_run_id).toBe('run-o2c-01');
        expect(result.pipeline_status).toBe('COMPLETED');
        expect(result.steps_executed).toBe(2);
      } finally {
        global.fetch = originalFetch;
        delete process.env.WORKFLOW_STUDIO_API_URL;
      }
    });

    it('identifies duplicate webhook and returns prior receipt without re-dispatching', async () => {
      const payload = { deal_id: 'OPP-DUP', amount: 5000 };
      const rawPayload = JSON.stringify(payload);
      const signature = createHmac('sha256', mockConnection.webhook_secret)
        .update(rawPayload)
        .digest('hex');

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
        const result = await webhooksService.handleInboundWebhook(
          'salesforce-crm',
          payload,
          { 'x-sfdc-signature': signature, 'idempotency-key': 'idemp-opp-dup' },
          undefined,
          'tenant-corp-01',
        );

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
      const disabledConn = { ...mockConnection, status: 'DISABLED' };
      mockDb.query.mockResolvedValueOnce({ rowCount: 1, rows: [disabledConn] });

      await expect(
        webhooksService.handleInboundWebhook(
          'salesforce-crm',
          { any: 'data' },
          {},
          undefined,
          'tenant-corp-01',
        ),
      ).rejects.toThrow('currently disabled');
    });

    it('rejects unauthorized webhook when signature is invalid', async () => {
      mockDb.query.mockResolvedValueOnce({ rowCount: 1, rows: [mockConnection] });

      await expect(
        webhooksService.handleInboundWebhook(
          'salesforce-crm',
          { deal_id: 'OPP-1' },
          { 'x-sfdc-signature': 'invalid_signature_hex_0000000000000000000000000000000000000000000000000000000000000000' },
          undefined,
          'tenant-corp-01',
        ),
      ).rejects.toThrow('Webhook authentication failed');
    });

    it('rejects a webhook without a server-resolved tenant', async () => {
      await expect(
        webhooksService.handleInboundWebhook('salesforce-crm', { any: 'data' }, {}),
      ).rejects.toThrow('x-tenant-id header is required');
    });
  });
});
