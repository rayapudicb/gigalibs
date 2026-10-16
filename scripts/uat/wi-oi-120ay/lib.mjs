// WI-OI-120ay: the pure parts of the owner-run assisted reset (token, SQL, link). Tested by lib.test.mjs.
import { createHash, randomBytes } from 'node:crypto';

export const REASON = 'WI-OI-120ay: owner recovery of the platform owner login';
export const VALID_MINUTES = 30;
const EMAIL = /^[a-z0-9._+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const BASE36 = '0123456789abcdefghijklmnopqrstuvwxyz';

/** A login as the product stores it (lower case); null when it is not a plain address safe to embed in SQL. */
export function checkedEmail(value) {
  const email = String(value ?? '')
    .trim()
    .toLowerCase();
  return EMAIL.test(email) ? email : null;
}

/** The one-time token and the digest the product stores, as `issuePasswordReset` makes them. */
export function newToken() {
  const token = randomBytes(32).toString('base64url');
  return { token, digest: tokenDigest(token) };
}

/** The product's digest (`resetPassword` looks the credential up by it). */
export const tokenDigest = (token) => createHash('sha256').update(token, 'utf8').digest('hex');

/** A cuid-shaped id (25 characters, starting with `c`), as Prisma gives the product's rows. */
export function newId() {
  const bytes = randomBytes(24);
  return `c${[...bytes].map((byte) => BASE36[byte % 36]).join('')}`;
}

const platformOwner = (email) => `SELECT u.id FROM public.users u
    WHERE lower(u.email) = '${email}' AND u.status = 'ACTIVE'
      AND EXISTS (SELECT 1 FROM public.platform_role_assignments p
        WHERE p."userId" = u.id AND p.role = 'PLATFORM_OWNER' AND p.status = 'ACTIVE' AND p."revokedAt" IS NULL
          AND (p."expiresAt" IS NULL OR p."expiresAt" > now()))`;

/** email|open credentials|sessions of the login, when it is an active platform owner (read-only). */
export function targetSql(email) {
  if (!checkedEmail(email)) throw new Error('not a plain email address');
  return `SELECT u.email,
  (SELECT count(*) FROM public.password_reset_credentials r WHERE r."userId" = u.id AND r."usedAt" IS NULL AND r."expiresAt" > now()),
  (SELECT count(*) FROM public.sessions s WHERE s."userId" = u.id AND s.status = 'ACTIVE' AND s."expiresAt" > now())
FROM public.users u WHERE u.id IN (${platformOwner(email)});`;
}

/**
 * One guarded transaction (run with --single-transaction), as the product's `issuePasswordReset`: close the login's
 * open credentials, store the new token's digest for 30 minutes, and audit it. The login requests its own reset,
 * since no other platform actor can. Raises and writes nothing unless the login is one active platform owner.
 */
export function issueSql({ email, digest, credentialId, auditId }) {
  if (!checkedEmail(email)) throw new Error('not a plain email address');
  if (!/^[0-9a-f]{64}$/.test(digest)) throw new Error('not a SHA-256 digest');
  for (const id of [credentialId, auditId])
    if (!/^c[0-9a-z]{24}$/.test(id)) throw new Error('not a row id');
  return `DO $$
DECLARE target text; found integer; closed integer; expires timestamptz := now() + interval '${VALID_MINUTES} minutes';
BEGIN
  SELECT count(*) INTO found FROM (${platformOwner(email)}) owners;
  IF found <> 1 THEN
    RAISE EXCEPTION 'WI-OI-120ay: ${email} is not one active platform owner (% found); nothing written', found;
  END IF;
  SELECT id INTO target FROM (${platformOwner(email)}) owners;
  PERFORM 1 FROM public.users WHERE id = target FOR UPDATE;
  UPDATE public.password_reset_credentials SET "usedAt" = now()
    WHERE "userId" = target AND "usedAt" IS NULL AND "expiresAt" > now();
  GET DIAGNOSTICS closed = ROW_COUNT;
  INSERT INTO public.password_reset_credentials (id, "tokenDigest", reason, "expiresAt", "userId", "requestedById")
    VALUES ('${credentialId}', '${digest}', '${REASON}', expires, target, target);
  INSERT INTO public.audit_logs (id, action, resource, "resourceId", "userId", metadata)
    VALUES ('${auditId}', 'CREATE', 'password_reset_credential', '${credentialId}', target, jsonb_build_object(
      'event', 'ASSISTED_RESET_ISSUED', 'subjectUserId', target, 'expiresAt', expires,
      'delivery', 'OWNER_RUN_CONSOLE', 'reason', '${REASON}', 'closedOpenCredentials', closed));
END $$;`;
}

/** The read-back after issuing: check|expected|found rows for this run's credential. */
export function issuedSql({ email, credentialId }) {
  if (!checkedEmail(email)) throw new Error('not a plain email address');
  if (!/^c[0-9a-z]{24}$/.test(credentialId)) throw new Error('not a row id');
  return `SELECT 'credential open for the login', 1, count(*) FROM public.password_reset_credentials r
    WHERE r.id = '${credentialId}' AND r."usedAt" IS NULL AND r."expiresAt" > now() AND r."userId" IN (${platformOwner(email)})
UNION ALL SELECT 'other open credentials of the login', 0, count(*) FROM public.password_reset_credentials r
    WHERE r.id <> '${credentialId}' AND r."usedAt" IS NULL AND r."expiresAt" > now() AND r."userId" IN (${platformOwner(email)})
UNION ALL SELECT 'issue audited', 1, count(*) FROM public.audit_logs a
    WHERE a.resource = 'password_reset_credential' AND a."resourceId" = '${credentialId}'
      AND a.metadata->>'event' = 'ASSISTED_RESET_ISSUED';`;
}

/** The read-back after the owner's reset: the newest credential this card issued for the login was used, and audited. */
export function usedSql(email) {
  if (!checkedEmail(email)) throw new Error('not a plain email address');
  const newest = `(SELECT r.id FROM public.password_reset_credentials r
    WHERE r.reason = '${REASON}' AND r."userId" IN (${platformOwner(email)}) ORDER BY r."createdAt" DESC LIMIT 1)`;
  return `SELECT 'credential used', 1, count(*) FROM public.password_reset_credentials r
    WHERE r.id = ${newest} AND r."usedAt" IS NOT NULL
UNION ALL SELECT 'reset audited', 1, count(*) FROM public.audit_logs a
    WHERE a.resource = 'user_password' AND a.metadata->>'event' = 'ASSISTED_RESET_CONSUMED'
      AND a.metadata->>'credentialId' = ${newest};`;
}

/** The link the owner opens once; the token never leaves the owner's terminal. */
export const resetLink = (origin, token) =>
  `${origin}/reset-password?token=${encodeURIComponent(token)}`;
