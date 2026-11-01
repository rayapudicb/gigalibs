import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { signJwt, verifyJwt } from '@gigalibs/auth-core';
import type { MobileBinding } from '@gigalibs/contracts';

// WI-OI-120cf: the mobile BFF's own credentials. Every key is derived from JWT_ACCESS_SECRET for one purpose, so a
// mobile access token never passes the web guard (and a web token never passes here), and the opaque values the BFF
// hands out (workspace choices, a stored switch outcome) are sealed with AES-256-GCM: readable by nobody else, and
// refused when changed.

export const MOBILE_AUDIENCE = 'gigalibs-mobile';
export const MOBILE_ISSUER = 'gigalibs-control-plane';
/** Mobile access tokens are short: a refresh rechecks the user, membership and tenant every ten minutes. */
export const MOBILE_ACCESS_TOKEN_SECONDS = 600;

type Purpose = 'access' | 'selection' | 'switch-outcome';

export interface MobileAccessClaims {
  readonly sub: string;
  readonly sid: string;
  readonly tid?: string;
  /** The installation and app profile the session is bound to. */
  readonly ins: string;
  readonly prf: string;
  readonly bnd: MobileBinding;
}

export class MobileKeys {
  private readonly keys: Readonly<Record<Purpose, Buffer>>;

  constructor(rootSecret: string) {
    if (rootSecret.length < 32) throw new Error('JWT_ACCESS_SECRET must be configured with at least 32 characters.');
    const derive = (purpose: Purpose) => createHmac('sha256', rootSecret).update(`gigalibs-mobile:${purpose}:v1`).digest();
    this.keys = { access: derive('access'), selection: derive('selection'), 'switch-outcome': derive('switch-outcome') };
  }

  signAccess(claims: MobileAccessClaims): { token: string; expiresAt: Date } {
    const token = signJwt(
      { ...claims, roles: [], aud: MOBILE_AUDIENCE, iss: MOBILE_ISSUER } as Parameters<typeof signJwt>[0],
      this.keys.access.toString('hex'),
      MOBILE_ACCESS_TOKEN_SECONDS,
    );
    const exp = (JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')) as { exp: number }).exp;
    return { token, expiresAt: new Date(exp * 1_000) };
  }

  /** The claims of a valid, unexpired mobile access token, or null. */
  verifyAccess(token: string): (MobileAccessClaims & { readonly exp: number }) | null {
    const payload = verifyJwt(token, this.keys.access.toString('hex')) as unknown as Record<string, unknown> | null;
    if (!payload || payload.aud !== MOBILE_AUDIENCE || payload.iss !== MOBILE_ISSUER) return null;
    const { sub, sid, tid, ins, prf, bnd, exp } = payload;
    if (typeof sub !== 'string' || typeof sid !== 'string' || typeof ins !== 'string' || typeof prf !== 'string') return null;
    if (typeof exp !== 'number') return null;
    if (bnd === 'TENANT_BOUND' && typeof tid === 'string' && tid.length > 0) return { sub, sid, tid, ins, prf, bnd, exp };
    if (bnd === 'PRE_TENANT' && tid === undefined) return { sub, sid, ins, prf, bnd, exp };
    return null;
  }

  seal(purpose: Exclude<Purpose, 'access'>, value: unknown): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.keys[purpose], iv);
    cipher.setAAD(Buffer.from(purpose));
    const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
  }

  /** The sealed value, or null when it was not sealed by this deployment for this purpose, or was changed. */
  open(purpose: Exclude<Purpose, 'access'>, sealed: string): unknown {
    try {
      const raw = Buffer.from(sealed, 'base64url');
      if (raw.length < 29 || raw.toString('base64url') !== sealed) return null;
      const decipher = createDecipheriv('aes-256-gcm', this.keys[purpose], raw.subarray(0, 12));
      decipher.setAAD(Buffer.from(purpose));
      decipher.setAuthTag(raw.subarray(12, 28));
      return JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8'));
    } catch {
      return null;
    }
  }
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function sameText(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** How long a refresh token lives (`JWT_REFRESH_EXPIRES_IN`, as the web uses it), in seconds. */
export function refreshLifetimeSeconds(value = process.env.JWT_REFRESH_EXPIRES_IN): number {
  const match = value?.match(/^(\d+)(s|m|h|d)$/);
  if (!match) throw new Error('JWT_REFRESH_EXPIRES_IN must use a positive duration such as 30d.');
  const unit = match[2] === 's' ? 1 : match[2] === 'm' ? 60 : match[2] === 'h' ? 3_600 : 86_400;
  return Number(match[1]) * unit;
}

/** `major.minor.patch` with an optional pre-release (`-beta.1`, lower than its release) or build (`+7`) suffix. */
export function parseAppVersion(value: string | undefined): readonly [number, number, number, boolean] | null {
  const match = value?.trim().match(/^(\d{1,6})\.(\d{1,6})\.(\d{1,6})(?:(-)[0-9A-Za-z.-]{1,64})?(?:\+[0-9A-Za-z.-]{1,64})?$/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3]), match[4] === '-'];
}

/**
 * Whether `version` is at least `minimum`. A pre-release counts as below its release; pre-releases of one version are
 * not ordered among themselves (1.2.0-beta.3 and 1.2.0-beta.1 both meet a 1.2.0-beta minimum).
 */
export function appVersionAtLeast(version: string | undefined, minimum: readonly [number, number, number, boolean]): boolean {
  const parsed = parseAppVersion(version);
  if (!parsed) return false;
  for (let index = 0; index < 3; index += 1) {
    const left = parsed[index] as number;
    const right = minimum[index] as number;
    if (left !== right) return left > right;
  }
  return !parsed[3] || minimum[3];
}

/** A random URL-safe value nobody can guess: challenge ids and the placeholder in a mobile session's web column. */
export function opaqueValue(): string {
  return randomBytes(32).toString('base64url');
}
