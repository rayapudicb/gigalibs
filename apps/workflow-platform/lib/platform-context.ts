import { buildPlatformContext, signPlatformContextToken } from '@gigalibs/auth-core';
import type {
  PlatformContextOrgScope,
  PlatformContextPersona,
  PlatformContextSpatialScope,
  PlatformContextV1,
} from '@gigalibs/contracts';
import type { VerifiedSession } from './verified-session';

import { determinePersona } from './persona-utils';
export { determinePersona };

export function determineOrgScope(
  session: VerifiedSession,
): PlatformContextOrgScope {
  if (session.orgScope.mode === 'SCOPED_DEPARTMENTS') {
    return {
      mode: 'SCOPED_DEPARTMENTS',
      department_ids: session.orgScope.departmentIds,
    };
  }
  return {
    mode: 'FLAT_TENANT',
  };
}

export function determineSpatialScope(session: VerifiedSession): PlatformContextSpatialScope {
  return session.spatialScope.mode === 'SCOPED_PLACES'
    ? { mode: 'SCOPED_PLACES', place_ids: [...session.spatialScope.placeIds] }
    : { mode: 'UNBOUNDED' };
}

export interface MintPlatformContextOptions {
  ttlSeconds?: number;
  /** A server-resolved signing key for a bounded module runtime. Never pass client input. */
  privateKey?: string;
}

export function mintPlatformContextToken(
  session: VerifiedSession,
  moduleKey: string,
  audience: string,
  options?: MintPlatformContextOptions,
): string {
  const privateKey = options?.privateKey ?? process.env.PLATFORM_CONTEXT_PRIVATE_KEY;
  if (!privateKey?.trim()) {
    throw new Error(
      'PLATFORM_CONTEXT_PRIVATE_KEY must contain an Ed25519 private PEM key.',
    );
  }
  // WI-OI-104c: the claims come from the kernel's one builder, shared with the scheduled-job worker.
  const payload: PlatformContextV1 = buildPlatformContext(session, moduleKey, audience, {
    ...(options?.ttlSeconds !== undefined ? { ttlSeconds: options.ttlSeconds } : {}),
  });
  return signPlatformContextToken(payload, privateKey);
}
