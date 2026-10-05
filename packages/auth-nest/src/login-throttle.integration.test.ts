import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// WI-OI-120e (U3.2, P1-20): the login throttle's SQL against PostgreSQL 16. Opt-in only, and only against a database
// named login_throttle_proof on this machine; it never runs against the UAT instance (port 5440).
const proofUrl = process.env.LOGIN_THROTTLE_TEST_DATABASE_URL;
if (proofUrl) {
  const parsed = new URL(proofUrl);
  if (!['127.0.0.1', 'localhost'].includes(parsed.hostname) || parsed.port === '5440' || parsed.pathname !== '/login_throttle_proof') {
    throw new Error('Refusing the login throttle proof: only a local login_throttle_proof database (not port 5440) is allowed.');
  }
}

describe.skipIf(!proofUrl)('login throttle on PostgreSQL (isolated)', () => {
  let db: typeof import('@gigalibs/db').prisma;
  let throttle: typeof import('./login-throttle.js');
  const priorUrl = process.env.DATABASE_URL;
  const key = () => randomBytes(32).toString('hex');
  const row = async (emailHash: string) =>
    (
      await db.$queryRawUnsafe<Array<{ failedCount: number; lockedUntil: Date | null }>>(
        'SELECT "failedCount", "lockedUntil" FROM "login_throttles" WHERE "emailHash" = $1',
        emailHash,
      )
    )[0];
  const fail = (emailHash: string, times: number) =>
    Array.from({ length: times }).reduce<Promise<unknown>>(
      (previous) => previous.then(() => throttle.recordLoginFailure(emailHash)),
      Promise.resolve(),
    );

  beforeAll(async () => {
    process.env.DATABASE_URL = proofUrl!;
    ({ prisma: db } = await import('@gigalibs/db'));
    const identity = await db.$queryRawUnsafe<Array<{ name: string }>>('SELECT current_database()::text AS name');
    if (identity[0]?.name !== 'login_throttle_proof') throw new Error('Unexpected proof database identity.');
    await db.$executeRawUnsafe('DROP TABLE IF EXISTS "login_throttles"');
    const migration = readFileSync(
      new URL('../../db/migrations/20261005000000_login_throttle/migration.sql', import.meta.url),
      'utf8',
    );
    const statements = migration.replace(/^\s*--.*$/gm, '').split(';').map((part) => part.trim()).filter(Boolean);
    for (const statement of statements) {
      await db.$executeRawUnsafe(statement);
    }
    throttle = await import('./login-throttle.js');
  });

  afterAll(async () => {
    await db?.$disconnect();
    if (priorUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = priorUrl;
  });

  it('locks on the fifth failure, for about 15 minutes, and not before', async () => {
    const emailHash = key();
    await fail(emailHash, 4);
    expect(await row(emailHash)).toMatchObject({ failedCount: 4, lockedUntil: null });
    expect(await throttle.activeLoginLock(emailHash)).toBeNull();

    const fifth = await throttle.recordLoginFailure(emailHash);
    expect(fifth.failedCount).toBe(5);
    const lockMs = fifth.lockedUntil!.getTime() - Date.now();
    expect(lockMs).toBeGreaterThan(14 * 60_000);
    expect(lockMs).toBeLessThanOrEqual(15 * 60_000 + 5_000);
    expect((await throttle.activeLoginLock(emailHash))?.getTime()).toBe(fifth.lockedUntil!.getTime());
  });

  it('starts again at one after the lock expires', async () => {
    const emailHash = key();
    await fail(emailHash, 5);
    await db.$executeRawUnsafe(
      `UPDATE "login_throttles" SET "lockedUntil" = CURRENT_TIMESTAMP - INTERVAL '1 second' WHERE "emailHash" = $1`,
      emailHash,
    );
    expect(await throttle.activeLoginLock(emailHash)).toBeNull();
    expect(await throttle.recordLoginFailure(emailHash)).toEqual({ failedCount: 1, lockedUntil: null });
  });

  it('starts again at one when the 15-minute window has passed', async () => {
    const emailHash = key();
    await fail(emailHash, 4);
    await db.$executeRawUnsafe(
      `UPDATE "login_throttles" SET "windowStartedAt" = CURRENT_TIMESTAMP - INTERVAL '16 minutes' WHERE "emailHash" = $1`,
      emailHash,
    );
    expect(await throttle.recordLoginFailure(emailHash)).toEqual({ failedCount: 1, lockedUntil: null });
  });

  it('counts every one of 20 concurrent failures', async () => {
    const emailHash = key();
    await Promise.all(Array.from({ length: 20 }, () => throttle.recordLoginFailure(emailHash)));
    const stored = await row(emailHash);
    expect(stored?.failedCount).toBe(20);
    expect(stored?.lockedUntil).not.toBeNull();
  });

  it('clears the count after a successful login', async () => {
    const emailHash = key();
    await fail(emailHash, 3);
    await throttle.clearLoginFailures(emailHash);
    expect(await row(emailHash)).toBeUndefined();
  });

  it('prunes only rows with no live lock that have been idle for a day', async () => {
    const stale = key();
    const staleButLocked = key();
    const recent = key();
    await fail(stale, 1);
    await fail(staleButLocked, 5);
    await fail(recent, 1);
    await db.$executeRawUnsafe(
      `UPDATE "login_throttles" SET "updatedAt" = CURRENT_TIMESTAMP - INTERVAL '2 days' WHERE "emailHash" IN ($1, $2)`,
      stale,
      staleButLocked,
    );
    expect(await throttle.pruneLoginThrottles()).toBeGreaterThanOrEqual(1);
    expect(await row(stale)).toBeUndefined();
    expect(await row(staleButLocked)).toBeDefined();
    expect(await row(recent)).toBeDefined();
  });

  it('stores only a SHA-256 key, never an email', async () => {
    await expect(
      db.$executeRawUnsafe(
        `INSERT INTO "login_throttles" ("emailHash", "windowStartedAt", "updatedAt") VALUES ($1, now(), now())`,
        'tester@example.test'.padEnd(64, 'x'),
      ),
    ).rejects.toThrow();
  });
});
