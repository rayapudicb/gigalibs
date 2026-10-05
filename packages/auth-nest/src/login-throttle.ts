import { createHash } from 'node:crypto';
import { prisma } from '@gigalibs/db';

// WI-OI-120e (U3.2, P1-20): password login is throttled per account. The key is a SHA-256 of the normalised email and
// unknown emails are counted the same way, so the answers do not reveal which accounts exist. Limits per network
// address belong at the ingress. Times come from the database clock, so every API replica agrees on them.
export const LOGIN_MAX_FAILURES = 5; // must stay above 1: a restarted window holds one failure and no lock
export const LOGIN_FAILURE_WINDOW_SECONDS = 15 * 60;
export const LOGIN_LOCK_SECONDS = 15 * 60;
/** Rows untouched for this long hold no lock and no live window, so the retention worker removes them. */
export const LOGIN_THROTTLE_RETENTION_SECONDS = 24 * 60 * 60;

export function loginThrottleKey(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}

/** The end of the lock on this email, or null when it may try a password. */
export async function activeLoginLock(emailHash: string): Promise<Date | null> {
  const rows = await prisma.$queryRaw<Array<{ lockedUntil: Date }>>`
    SELECT "lockedUntil" FROM "login_throttles"
    WHERE "emailHash" = ${emailHash} AND "lockedUntil" > CURRENT_TIMESTAMP`;
  return rows[0]?.lockedUntil ?? null;
}

export interface LoginFailureOutcome {
  failedCount: number;
  lockedUntil: Date | null;
}

/**
 * Counts one failed login in a single statement, so concurrent failures are all counted. A window that has passed,
 * or a lock that has expired, starts the count again at one.
 */
export async function recordLoginFailure(emailHash: string): Promise<LoginFailureOutcome> {
  const rows = await prisma.$queryRaw<LoginFailureOutcome[]>`
    INSERT INTO "login_throttles" AS t ("emailHash", "failedCount", "windowStartedAt", "lockedUntil", "updatedAt")
    VALUES (${emailHash}, 1, CURRENT_TIMESTAMP, NULL, CURRENT_TIMESTAMP)
    ON CONFLICT ("emailHash") DO UPDATE SET
      "failedCount" = CASE
        WHEN t."windowStartedAt" <= CURRENT_TIMESTAMP - make_interval(secs => ${LOGIN_FAILURE_WINDOW_SECONDS})
          OR t."lockedUntil" <= CURRENT_TIMESTAMP THEN 1
        ELSE t."failedCount" + 1
      END,
      "windowStartedAt" = CASE
        WHEN t."windowStartedAt" <= CURRENT_TIMESTAMP - make_interval(secs => ${LOGIN_FAILURE_WINDOW_SECONDS})
          OR t."lockedUntil" <= CURRENT_TIMESTAMP THEN CURRENT_TIMESTAMP
        ELSE t."windowStartedAt"
      END,
      "lockedUntil" = CASE
        WHEN t."windowStartedAt" <= CURRENT_TIMESTAMP - make_interval(secs => ${LOGIN_FAILURE_WINDOW_SECONDS})
          OR t."lockedUntil" <= CURRENT_TIMESTAMP THEN NULL
        WHEN t."failedCount" + 1 >= ${LOGIN_MAX_FAILURES} THEN CURRENT_TIMESTAMP + make_interval(secs => ${LOGIN_LOCK_SECONDS})
        ELSE NULL
      END,
      "updatedAt" = CURRENT_TIMESTAMP
    RETURNING "failedCount", "lockedUntil"`;
  const row = rows[0];
  if (!row) throw new Error('The login throttle did not record the failure.');
  return { failedCount: Number(row.failedCount), lockedUntil: row.lockedUntil };
}

export async function clearLoginFailures(emailHash: string): Promise<void> {
  await prisma.loginThrottle.deleteMany({ where: { emailHash } });
}

/** Removes rows that hold no lock and no live window. Returns how many were removed. */
export async function pruneLoginThrottles(): Promise<number> {
  return prisma.$executeRaw`
    DELETE FROM "login_throttles"
    WHERE "updatedAt" < CURRENT_TIMESTAMP - make_interval(secs => ${LOGIN_THROTTLE_RETENTION_SECONDS})
      AND ("lockedUntil" IS NULL OR "lockedUntil" < CURRENT_TIMESTAMP)`;
}
