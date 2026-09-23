// WI-OI-046 — Unit tests for IamUserImportService
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IamUserImportService } from '../iam-user-import.service.js';
import type { ValidatedRow } from '../types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRow(overrides: Partial<Record<string, unknown>> & { rowNumber?: number } = {}): ValidatedRow {
  const { rowNumber = 1, ...fields } = overrides;
  return {
    rowNumber,
    externalId: null,
    dbValues: {
      email: 'alice@example.com',
      name: 'Alice Example',
      role: 'MEMBER',
      ...fields,
    },
    specValues: {},
    customValues: {},
    warnings: [],
  };
}

function makeDb(queryResults: Array<{ rows: unknown[] }>) {
  let call = 0;
  const query = vi.fn(async () => {
    const result = queryResults[call++] ?? { rows: [] };
    return result;
  });
  return {
    getPool: () => ({ query }),
    _query: query,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('IamUserImportService', () => {
  const tenantId = '00000000-0000-0000-0000-000000000001';
  const actorId = 'actor-sub-001';

  describe('processUserRows — happy path', () => {
    it('creates an invite for a new user', async () => {
      // Sequence: member check → invite check → revoke stale → insert
      const db = makeDb([
        { rows: [] },  // member check: no existing member
        { rows: [] },  // invite check: no pending invite
        { rows: [] },  // revoke stale invites (UPDATE)
        { rows: [] },  // insert invite
      ]);
      const svc = new IamUserImportService(db as any);
      const result = await svc.processUserRows(tenantId, actorId, [makeRow()], false);
      expect(result.committed).toBe(1);
      expect(result.failed).toHaveLength(0);
      // insert call should include the email
      const insertCall = db._query.mock.calls[3] as unknown as [string, string[]] | undefined;
      const insertArgs = (insertCall?.[1] ?? []) as string[];
      expect(insertArgs).toContain('alice@example.com');
    });

    it('skips a user who is already an active member', async () => {
      const db = makeDb([
        { rows: [{ id: 'member-id' }] }, // member check: found
      ]);
      const svc = new IamUserImportService(db as any);
      const result = await svc.processUserRows(tenantId, actorId, [makeRow()], false);
      // ALREADY_MEMBER counts as committed (idempotent)
      expect(result.committed).toBe(1);
      expect(result.failed).toHaveLength(0);
      expect(db._query).toHaveBeenCalledTimes(1);
    });

    it('skips a user with an existing pending invite', async () => {
      const db = makeDb([
        { rows: [] },                        // member check: not a member
        { rows: [{ id: 'invite-id' }] },     // invite check: found
      ]);
      const svc = new IamUserImportService(db as any);
      const result = await svc.processUserRows(tenantId, actorId, [makeRow()], false);
      expect(result.committed).toBe(1);
      expect(result.failed).toHaveLength(0);
      expect(db._query).toHaveBeenCalledTimes(2);
    });

    it('assigns MEMBER role when role column is absent', async () => {
      const db = makeDb([{ rows: [] }, { rows: [] }, { rows: [] }, { rows: [] }]);
      const svc = new IamUserImportService(db as any);
      const row = makeRow({ role: undefined });
      await svc.processUserRows(tenantId, actorId, [row], false);
      const insertArgs = (db._query.mock.calls[3] as unknown as [string, unknown[]] | undefined)?.[1] ?? [];
      expect(insertArgs).toContain('MEMBER');
    });

    it('caps expires_in_hours at 168', async () => {
      const db = makeDb([{ rows: [] }, { rows: [] }, { rows: [] }, { rows: [] }]);
      const svc = new IamUserImportService(db as any);
      const row = makeRow({ expires_in_hours: 9999 });
      await svc.processUserRows(tenantId, actorId, [row], false);
      const insertArgs = (db._query.mock.calls[3] as unknown as [string, unknown[]] | undefined)?.[1] ?? [];
      // expiresAt param is index 4 (0-based); check it's not way in the future
      const expiresAt = new Date(insertArgs[4] as string);
      const maxFuture = new Date(Date.now() + 169 * 60 * 60 * 1_000);
      expect(expiresAt.getTime()).toBeLessThanOrEqual(maxFuture.getTime());
    });
  });

  describe('processUserRows — validation failures', () => {
    it('fails a row with an invalid email', async () => {
      const db = makeDb([]);
      const svc = new IamUserImportService(db as any);
      const row = makeRow({ email: 'not-an-email' });
      const result = await svc.processUserRows(tenantId, actorId, [row], false);
      expect(result.committed).toBe(0);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0]?.error).toMatch(/email/i);
      expect(db._query).not.toHaveBeenCalled();
    });

    it('fails a row with missing email', async () => {
      const db = makeDb([]);
      const svc = new IamUserImportService(db as any);
      const row = makeRow({ email: undefined });
      const result = await svc.processUserRows(tenantId, actorId, [row], false);
      expect(result.committed).toBe(0);
      expect(result.failed).toHaveLength(1);
    });
  });

  describe('processUserRows — all-or-nothing mode', () => {
    it('aborts remaining rows after first failure in allOrNothing mode', async () => {
      // Row 1: bad email → FAILED → should abort row 2 without DB queries
      const db = makeDb([]);
      const svc = new IamUserImportService(db as any);
      const rows = [
        makeRow({ rowNumber: 1, email: 'bad' }),
        makeRow({ rowNumber: 2, email: 'bob@example.com' }),
      ];
      const result = await svc.processUserRows(tenantId, actorId, rows, true);
      expect(result.committed).toBe(0);
      expect(result.failed).toHaveLength(2);
      expect(db._query).not.toHaveBeenCalled();
    });
  });

  describe('processUserRows — DB errors', () => {
    it('marks a row as failed when DB throws', async () => {
      const query = vi.fn().mockRejectedValue(new Error('connection refused'));
      const db = { getPool: () => ({ query }) };
      const svc = new IamUserImportService(db as any);
      const result = await svc.processUserRows(tenantId, actorId, [makeRow()], false);
      expect(result.committed).toBe(0);
      expect(result.failed[0]?.error).toMatch(/connection refused/i);
    });
  });

  describe('processUserRows — batch of mixed outcomes', () => {
    it('counts committed and failed independently', async () => {
      // Row 1: alice — valid new user → 4 DB calls
      // Row 2: bob@bad — invalid email → 0 DB calls
      // Row 3: carol — already a member → 1 DB call
      const db = makeDb([
        { rows: [] }, { rows: [] }, { rows: [] }, { rows: [] }, // alice: member, invite, revoke, insert
        { rows: [{ id: 'member-id' }] },                         // carol: already member
      ]);
      const svc = new IamUserImportService(db as any);
      const rows = [
        makeRow({ rowNumber: 1, email: 'alice@example.com' }),
        makeRow({ rowNumber: 2, email: 'bob@bad' }),
        makeRow({ rowNumber: 3, email: 'carol@example.com' }),
      ];
      const result = await svc.processUserRows(tenantId, actorId, rows, false);
      expect(result.committed).toBe(2); // alice (INVITED) + carol (ALREADY_MEMBER)
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0]?.rowNumber).toBe(2);
    });
  });
});
