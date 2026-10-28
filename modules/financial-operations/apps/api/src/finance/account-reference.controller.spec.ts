import 'reflect-metadata';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { signRelayToken } from '@gigalibs/auth-core';
import { BadRequestException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  FINANCE_ACCOUNT_REFERENCE_AUDIENCE,
  FinanceAccountReferenceController,
  FinanceAccountReferenceGuard,
  loadFinanceAccountReferenceConfig,
} from './account-reference.controller.js';

const keys = generateKeyPairSync('ed25519');
const publicBase64 = keys.publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
const privatePem = keys.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
const accountId = randomUUID();
const bookId = randomUUID();
const request = { tenantId: 'tenant-a', messageId: randomUUID(), accountId, accountClass: 'ASSET' };

describe('Finance account reference inbox', () => {
  it('accepts only a Business Partner relay token bound to the exact body', () => {
    const config = loadFinanceAccountReferenceConfig({ FINANCE_ACCOUNT_REF_INBOX_PUBLIC_KEY_BASE64: publicBase64 });
    const guard = new FinanceAccountReferenceGuard(config);
    const body = JSON.stringify(request);
    const token = signRelayToken({ audience: FINANCE_ACCOUNT_REFERENCE_AUDIENCE, source: 'business-partners', tenantId: 'tenant-a', messageId: request.messageId, body }, privatePem);
    const context = (rawBody: string, authorization = `Bearer ${token}`) => ({
      switchToHttp: () => ({ getRequest: () => ({ headers: { authorization }, rawBody: Buffer.from(rawBody), body: request }) }),
    }) as unknown as ExecutionContext;
    expect(guard.canActivate(context(body))).toBe(true);
    expect(() => guard.canActivate(context(JSON.stringify({ ...request, accountClass: 'LIABILITY' }))))
      .toThrow(UnauthorizedException);
    expect(() => guard.canActivate(context(body, 'Bearer user-token'))).toThrow(UnauthorizedException);
  });

  it('returns only a current active subledger control account of the required class', async () => {
    const finance = { getAccount: async () => ({
      id: accountId, accountingBookId: bookId, accountClass: 'ASSET',
      isSubledgerControl: true, active: true, version: 3,
    }) };
    const controller = new FinanceAccountReferenceController(finance as never);
    await expect(controller.check({} as never, request)).resolves.toEqual({
      accountId, accountingBookId: bookId, accountClass: 'ASSET', version: 3,
    });
    await expect(controller.check({} as never, { ...request, accountClass: 'LIABILITY' }))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.check({} as never, { ...request, tenantId: '' }))
      .rejects.toBeInstanceOf(BadRequestException);
  });
});
