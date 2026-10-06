import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { HttpException } from '@nestjs/common';
import type { IdempotencyStore, ModulePrincipal, RecordCommandContext } from '@gigalibs/module-sdk';
import { describe, expect, it, vi } from 'vitest';
import { financeRecordDispatcher, type FinanceRecordDependencies } from './finance-record-adapters.js';
import { FinanceVersionConflict } from './journal-drafts.service.js';

// WI-OI-120l (U12): the general ledger's record adapters. The rules that hold before any database call: what a window
// may change, which actions need a reason, version conflicts as 412, and that every action and picker the five Finance
// windows name is one the API registers. The HTTP proof (scripts/verify-u12-general-ledger.mjs) covers the rest.

const dictionary = new URL('../../../../dictionary/', import.meta.url);
const id = randomUUID();

function context(permissions: string[] = ['finance:*']): RecordCommandContext {
  const principal = { tenantId: 'tenant-a', subject: 'maker', sessionId: randomUUID(), authVersion: 1, permissions, roles: [] } as unknown as ModulePrincipal;
  return { principal, correlationId: randomUUID() };
}

const noIdempotency: IdempotencyStore = { claim: async () => null, complete: async () => undefined, release: async () => undefined };

function dispatcher() {
  const deps = {
    finance: { createAccount: vi.fn(), updateAccount: vi.fn(), updatePeriodStatus: vi.fn(async () => ({ id, status: 'OPEN', version: 2 })), reverseJournal: vi.fn() },
    drafts: { create: vi.fn(), update: vi.fn(), addLine: vi.fn(), removeLine: vi.fn(), submit: vi.fn(), approve: vi.fn(async () => ({ id, status: 'POSTED', version: 4 })), returnToDraft: vi.fn() },
    records: { page: vi.fn(), get: vi.fn(), lookup: vi.fn() },
  };
  return { deps, records: financeRecordDispatcher(deps as unknown as FinanceRecordDependencies, noIdempotency) };
}

async function status(promise: Promise<unknown>): Promise<number> {
  try {
    await promise;
    return 200;
  } catch (error) {
    return error instanceof HttpException ? error.getStatus() : 500;
  }
}

describe('Finance record adapters (U12)', () => {
  it('registers every entity, action and picker the five Finance windows name', () => {
    const { records } = dispatcher();
    const registry = records.registry();
    const files = readdirSync(dictionary).filter((name) => name.endsWith('.window.json'));
    expect(files).toHaveLength(5);
    for (const file of files) {
      const window = JSON.parse(readFileSync(new URL(file, dictionary), 'utf8'));
      const definition = window.definition.dictionary;
      for (const entity of definition.entities) expect(registry.entities).toContain(entity.entityKey);
      for (const action of definition.actions) expect(registry.actions).toContain(action.handlerKey);
      for (const reference of definition.references.filter((entry: { resolverKey?: string }) => entry.resolverKey)) expect(registry.resolvers).toContain(reference.resolverKey);
    }
  });

  it("refuses to change an account's book, code, class, subtype or normal balance", async () => {
    const { deps, records } = dispatcher();
    expect(await status(records.update(context(), 'finance.accounts', id, { 'account-code': '1001' }, '"1"'))).toBe(400);
    expect(deps.finance.updateAccount).not.toHaveBeenCalled();
  });

  it("needs a book, date and description for a draft, and never moves a draft to another book", async () => {
    const { deps, records } = dispatcher();
    expect(await status(records.create(context(), 'finance.journal-drafts', { 'accounting-book-id': id, 'posting-date': '2026-03-01' }, randomUUID()))).toBe(400);
    expect(await status(records.update(context(), 'finance.journal-drafts', id, { 'accounting-book-id': randomUUID() }, '"1"'))).toBe(400);
    expect(deps.drafts.create).not.toHaveBeenCalled();
    expect(deps.drafts.update).not.toHaveBeenCalled();
  });

  it('opens a period without a reason, but soft-closes and locks only with one', async () => {
    const { deps, records } = dispatcher();
    expect(await status(records.action(context(), 'finance.periods', id, 'lock', {}, randomUUID()))).toBe(400);
    expect(await status(records.action(context(), 'finance.periods', id, 'soft-close', { reason: ' ' }, randomUUID()))).toBe(400);
    await records.action(context(), 'finance.periods', id, 'open', {}, randomUUID());
    expect(deps.finance.updatePeriodStatus).toHaveBeenCalledExactlyOnceWith('tenant-a', 'maker', id, { status: 'OPEN' });
  });

  it('approves with a reason and the version the checker saw; a moved draft answers 412', async () => {
    const { deps, records } = dispatcher();
    expect(await status(records.action(context(), 'finance.journal-drafts', id, 'approve', { expectedVersion: 3 }, randomUUID()))).toBe(400);
    expect(await status(records.action(context(), 'finance.journal-drafts', id, 'approve', { reason: 'Checked' }, randomUUID()))).toBe(400);
    await records.action(context(), 'finance.journal-drafts', id, 'approve', { expectedVersion: 3, reason: 'Checked' }, randomUUID());
    expect(deps.drafts.approve).toHaveBeenCalledExactlyOnceWith('tenant-a', 'maker', id, 3, 'Checked');
    deps.drafts.submit.mockRejectedValueOnce(new FinanceVersionConflict());
    expect(await status(records.action(context(), 'finance.journal-drafts', id, 'submit', { expectedVersion: 2 }, randomUUID()))).toBe(412);
  });

  it('reverses only with a reason and a YYYY-MM-DD date', async () => {
    const { deps, records } = dispatcher();
    expect(await status(records.action(context(), 'finance.journals', id, 'reverse', {}, randomUUID()))).toBe(400);
    expect(await status(records.action(context(), 'finance.journals', id, 'reverse', { reason: 'Wrong', 'reversal-date': '31/03/2026' }, randomUUID()))).toBe(400);
    expect(deps.finance.reverseJournal).not.toHaveBeenCalled();
  });

  it('keeps approval and reversal behind their own permissions', async () => {
    const { deps, records } = dispatcher();
    const poster = context(['finance:read', 'finance:journals:post']);
    expect(await status(records.action(poster, 'finance.journal-drafts', id, 'approve', { expectedVersion: 3, reason: 'Mine' }, randomUUID()))).toBe(403);
    expect(await status(records.action(poster, 'finance.journals', id, 'reverse', { reason: 'Mine' }, randomUUID()))).toBe(403);
    expect(await status(records.create(context(['finance:read']), 'finance.journal-drafts', { description: 'x' }, randomUUID()))).toBe(403);
    expect(deps.drafts.approve).not.toHaveBeenCalled();
  });
});
