import { randomUUID } from 'node:crypto';
import { signPlatformContextToken } from '@gigalibs/auth-core';
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
  if (!session.tenant) {
    throw new Error('Cannot mint module context token without an active tenant workspace.');
  }

  const privateKey = options?.privateKey ?? process.env.PLATFORM_CONTEXT_PRIVATE_KEY;

  if (!privateKey?.trim()) {
    throw new Error(
      'PLATFORM_CONTEXT_PRIVATE_KEY must contain an Ed25519 private PEM key.',
    );
  }

  const entitlement = session.tenant.entitlements.find(
    (candidate) => candidate.moduleKey === moduleKey && candidate.status === 'ENABLED',
  );
  if (!entitlement) {
    throw new Error(`Module '${moduleKey}' is not actively entitled for this workspace.`);
  }

  const now = Math.floor(Date.now() / 1000);
  const ttl = Math.min(options?.ttlSeconds ?? 300, 300);
  const persona = determinePersona(session.roles, session.platformRoles);
  const orgScope = determineOrgScope(session);

  const payload: PlatformContextV1 = {
    iss: 'gigalibs-control-plane',
    aud: audience,
    sub: session.user.id,
    tenant_id: session.tenant.id,
    session_id: session.session?.id ?? randomUUID(),
    auth_version: session.authVersion,
    roles: session.roles,
    granted_scopes: session.permissions,
    persona_type: persona,
    org_scope: orgScope,
    spatial_scope: determineSpatialScope(session),
    entitlement: {
      module_key: moduleKey,
      status: 'ENABLED',
      version: entitlement.version,
    },
    iat: now,
    exp: now + ttl,
    jti: randomUUID(),
  };

  return signPlatformContextToken(payload, privateKey);
}
