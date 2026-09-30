import { generateKeyPairSync } from 'node:crypto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConnectorsService } from './connectors.service.js';
import { VaultCryptoService } from './vault-crypto.service.js';
import type { DatabaseService } from '../database/database.service.js';

describe('ConnectorsService & VaultCryptoService', () => {
  let vaultCrypto: VaultCryptoService;
  let connectorsService: ConnectorsService;
  let mockDb: any;

  beforeEach(() => {
    process.env.CONNECTOR_HUB_API_HOST = '127.0.0.1';
    process.env.CONNECTOR_HUB_API_PORT = '4100';
    process.env.CONNECTOR_HUB_CORS_ORIGINS = 'http://localhost:5180';
    process.env.CONNECTORS_DATABASE_URL =
      'postgresql://connectors_runtime:secret@localhost:5440/gigalibs';
    process.env.CONNECTOR_HUB_DATABASE_POOL_SIZE = '10';
    process.env.CONNECTOR_VAULT_KEY = 'local-test-key-that-is-at-least-32-bytes-long';
    process.env.CONNECTOR_HUB_EXPECTED_MIGRATION_VERSION = '7';
    process.env.CONNECTOR_HUB_PLATFORM_CONTEXT_PUBLIC_KEY_BASE64 = generateKeyPairSync('ed25519').publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
    process.env.CONNECTOR_HUB_ALLOWED_OUTBOUND_HOSTS = 'example.com';
    process.env.CONNECTOR_HUB_ALLOW_INSECURE_OUTBOUND = 'false';
    vaultCrypto = new VaultCryptoService();

    const query = vi.fn();
    mockDb = {
      query,
      queryWithTenant: query,
      withTenantTransaction: vi.fn(),
      getClient: vi.fn(),
    };

    connectorsService = new ConnectorsService(mockDb as unknown as DatabaseService, vaultCrypto);
  });

  describe('VaultCryptoService (CN-02 Security)', () => {
    it('encrypts and decrypts secret payloads accurately using AES-256-GCM', () => {
      const plainSecret = JSON.stringify({
        client_secret: 'sec_live_99214812491a',
        refresh_token: 'ref_prod_8819230192',
      });

      const encrypted = vaultCrypto.encrypt(plainSecret);
      expect(encrypted.encryptedData).toBeDefined();
      expect(encrypted.iv).toHaveLength(24); // 12 bytes = 24 hex characters
      expect(encrypted.authTag).toHaveLength(32); // 16 bytes = 32 hex characters

      const decrypted = vaultCrypto.decrypt(encrypted);
      expect(decrypted).toBe(plainSecret);
      expect(JSON.parse(decrypted)).toEqual({
        client_secret: 'sec_live_99214812491a',
        refresh_token: 'ref_prod_8819230192',
      });
    });

    it('rejects decryption when authentication tag is tampered with', () => {
      const encrypted = vaultCrypto.encrypt('sensitive-api-token');
      const tampered = {
        ...encrypted,
        authTag: '0'.repeat(32),
      };

      expect(() => vaultCrypto.decrypt(tampered)).toThrow();
    });

    it('generates and verifies RFC 7636 PKCE code challenge and verifier', () => {
      const { codeVerifier, codeChallenge } = vaultCrypto.generatePkcePair();
      expect(codeVerifier.length).toBeGreaterThanOrEqual(43);
      expect(codeChallenge).toBeDefined();

      const valid = vaultCrypto.verifyPkce(codeVerifier, codeChallenge);
      expect(valid).toBe(true);

      const invalid = vaultCrypto.verifyPkce('wrong-verifier-1234567890123456789012345', codeChallenge);
      expect(invalid).toBe(false);
    });
  });

  describe('ConnectorsService (CN-01 & CN-02)', () => {
    it('rejects requests missing tenantId', async () => {
      await expect(connectorsService.getConnections('')).rejects.toThrow('tenantId is required');
      await expect(connectorsService.getConnectionById('', 'conn-1')).rejects.toThrow('tenantId is required');
      await expect(connectorsService.createConnection('', {} as any)).rejects.toThrow('tenantId is required');
    });

    it('creates connection and stores AES-256-GCM encrypted credentials', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ connector_code: 'SALESFORCE_CRM' }] }) // catalog check
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [
            {
              id: 'conn-test-1',
              tenant_id: 'tenant-test',
              connector_code: 'SALESFORCE_CRM',
              name: 'SF Prod',
              slug: 'sf-prod',
              status: 'READY',
            },
          ],
        }) // insert connection
        .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // insert credentials
        .mockResolvedValueOnce({ rowCount: 1, rows: [] }); // insert audit

      const res = await connectorsService.createConnection('tenant-test', {
        connector_code: 'SALESFORCE_CRM',
        name: 'SF Prod',
        slug: 'sf-prod',
        auth_type: 'OAUTH2',
        credentials: { client_secret: 'secret-123' },
      });

      expect(res.slug).toBe('sf-prod');
      expect(mockDb.query).toHaveBeenCalledTimes(4);

      // Verify that the credentials insert received encrypted_data, iv, and auth_tag
      const credCall = mockDb.query.mock.calls[2];
      expect(credCall[1]).toContain('INSERT INTO gigalibs_connectors.connector_credentials');
      expect(credCall[2][4]).toBeDefined(); // encryptedData
      expect(credCall[2][5]).toHaveLength(24); // iv
      expect(credCall[2][6]).toHaveLength(32); // auth_tag
    });

    it('performs live health probe with network check and updates status', async () => {
      const mockConn = {
        id: 'conn-probe-1',
        slug: 'sf-probe',
        connector_code: 'SALESFORCE_CRM',
        auth_type: 'WEBHOOK',
        webhook_secret: 'whsec_123',
        target_workflow_code: 'WF-01',
        configuration: { instance_url: 'https://example.com/api' },
      };

      // Mock getConnectionById
      mockDb.query
        .mockResolvedValueOnce({ rowCount: 1, rows: [mockConn] }) // getConnectionById
        .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // getDecryptedCredential
        .mockResolvedValueOnce({ rowCount: 1, rows: [] }); // UPDATE status

      // Mock global fetch for probe
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({ status: 200 } as any);

      try {
        const result = await connectorsService.testConnection('tenant-test', 'conn-probe-1');
        expect(result.success).toBe(true);
        expect(result.status).toBe('READY');
        expect(result.checks.network_probe).toBe('REACHABLE_HTTP_200');
        expect(result.checks.webhook_listener).toBe('ACTIVE');
        expect(result.checks.target_pipeline).toBe('ATTACHED');
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('rejects testConnection when credentials are required but missing', async () => {
      const mockConn = {
        id: 'conn-probe-nocred',
        slug: 'sf-nocred',
        connector_code: 'SALESFORCE_CRM',
        auth_type: 'OAUTH2',
        webhook_secret: null,
        target_workflow_code: null,
        configuration: { instance_url: 'https://example.com/api' },
      };

      mockDb.query
        .mockResolvedValueOnce({ rowCount: 1, rows: [mockConn] })
        .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // missing credential
        .mockResolvedValueOnce({ rowCount: 1, rows: [] }); // UPDATE status

      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({ status: 200 } as any);

      try {
        const result = await connectorsService.testConnection('tenant-test', 'conn-probe-nocred');
        expect(result.success).toBe(false);
        expect(result.status).toBe('ERROR');
        expect(result.checks.credential_vault).toBe('MISSING_CREDENTIALS');
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('detects network probe failure and sets status to ERROR without fabricating PASS', async () => {
      const mockConn = {
        id: 'conn-probe-fail',
        slug: 'sf-broken',
        connector_code: 'SALESFORCE_CRM',
        auth_type: 'OAUTH2',
        webhook_secret: 'whsec_123',
        target_workflow_code: null,
        configuration: { instance_url: 'https://invalid-non-existent-host.internal' },
      };

      mockDb.query
        .mockResolvedValueOnce({ rowCount: 1, rows: [mockConn] })
        .mockResolvedValueOnce({ rowCount: 0, rows: [] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [] });

      const originalFetch = global.fetch;
      process.env.CONNECTOR_HUB_ALLOWED_OUTBOUND_HOSTS =
        'example.com,invalid-non-existent-host.internal';
      global.fetch = vi.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND'));

      try {
        const result = await connectorsService.testConnection('tenant-test', 'conn-probe-fail');
        expect(result.success).toBe(false);
        expect(result.status).toBe('ERROR');
        expect(result.checks.network_probe).toContain('FAILED');
        expect(result.error).toContain('ENOTFOUND');
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('keeps OAuth provider exchange contained until real provider configuration exists', async () => {
      await expect(connectorsService.initiateOAuthFlow('tenant-test', {
        connector_code: 'SALESFORCE_CRM',
        redirect_uri: 'https://gigalibs.app/callback',
      })).rejects.toThrow('contained');

      await expect(connectorsService.exchangeOAuthCode('tenant-test', 'conn-oauth-1', {
        code: 'auth_code_123',
        state: 'state-1',
        code_verifier: 'verifier-1',
      })).rejects.toThrow('contained');
    });
  });
});
