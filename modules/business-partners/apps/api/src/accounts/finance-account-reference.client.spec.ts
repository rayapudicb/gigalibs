import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { verifyRelayToken } from '@gigalibs/auth-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FinanceAccountReferenceClient } from './finance-account-reference.client.js';

const keys = generateKeyPairSync('ed25519');
const privateBase64 = keys.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
const publicPem = keys.publicKey.export({ format: 'pem', type: 'spki' }).toString();
const original = { ...process.env };
const accountId = randomUUID();
const bookId = randomUUID();

describe('Business Partner Finance account validation', () => {
  afterEach(() => {
    process.env = { ...original };
    vi.unstubAllGlobals();
  });

  it('asks Finance through a signed body-bound read and records its version', async () => {
    process.env.BUSINESS_PARTNERS_FINANCE_URL = 'http://module-host:4790';
    process.env.FINANCE_ACCOUNT_REF_INBOX_PRIVATE_KEY_BASE64 = privateBase64;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe('http://module-host:4790/financial-operations/internal/v1/account-reference');
      const body = String(init.body);
      const token = String((init.headers as Record<string, string>).Authorization).slice(7);
      expect(verifyRelayToken(token, publicPem, {
        audience: 'gigalibs-finance-account-reference', source: 'business-partners', body,
      })).toMatchObject({ tenant_id: 'tenant-a' });
      expect(JSON.parse(body)).toMatchObject({ tenantId: 'tenant-a', accountId, accountClass: 'ASSET' });
      return new Response(JSON.stringify({ accountId, accountingBookId: bookId, accountClass: 'ASSET', version: 4 }), { status: 200 });
    }));
    await expect(new FinanceAccountReferenceClient().check('tenant-a', accountId, 'ASSET'))
      .resolves.toEqual({ accountId, accountingBookId: bookId, accountClass: 'ASSET', version: 4 });
  });

  it('refuses an unapproved account and fails closed when Finance is unavailable', async () => {
    process.env.BUSINESS_PARTNERS_FINANCE_URL = 'http://module-host:4790';
    process.env.FINANCE_ACCOUNT_REF_INBOX_PRIVATE_KEY_BASE64 = privateBase64;
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 400 })));
    await expect(new FinanceAccountReferenceClient().check('tenant-a', accountId, 'ASSET'))
      .rejects.toMatchObject({ status: 400 });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })));
    await expect(new FinanceAccountReferenceClient().check('tenant-a', accountId, 'ASSET'))
      .rejects.toMatchObject({ status: 503 });
    delete process.env.BUSINESS_PARTNERS_FINANCE_URL;
    delete process.env.FINANCE_ACCOUNT_REF_INBOX_PRIVATE_KEY_BASE64;
    await expect(new FinanceAccountReferenceClient().check('tenant-a', accountId, 'ASSET'))
      .rejects.toMatchObject({ status: 503 });
  });
});
