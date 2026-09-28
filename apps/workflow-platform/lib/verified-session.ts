import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  authenticatedUpstream,
  authenticationRequired,
  unavailable,
} from './authenticated-upstream';
import { ACCESS_COOKIE_NAME, UpstreamUnavailableError, controlPlaneUrl } from './control-plane';
import { SpatialScopePlaceIdsSchema } from '@gigalibs/contracts';

export interface VerifiedSession {
  user: { id: string; email: string; name: string | null; status: 'ACTIVE' };
  tenant: {
    id: string;
    name: string;
    slug: string;
    status: string;
    trialEndsAt: string | null;
    features: string[];
    entitlements: Array<{
      moduleKey: string;
      status: 'ENABLED';
      version: string;
    }>;
  } | null;
  roles: string[];
  platformRoles: string[];
  permissions: string[];
  session: { id: string; expiresAt: string };
  authVersion: number;
  orgScope:
    | { mode: 'FLAT_TENANT' }
    | { mode: 'SCOPED_DEPARTMENTS'; departmentIds: string[] };
  spatialScope: { mode: 'UNBOUNDED' } | { mode: 'SCOPED_PLACES'; placeIds: string[] };
  mfa: {
    required: boolean;
    enrolled: boolean;
    verified: boolean;
    recoveryCodesRemaining: number;
  };
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function text(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}
export function isVerifiedSession(value: unknown): value is VerifiedSession {
  if (!record(value) || !record(value.user) || !record(value.session) || !record(value.mfa))
    return false;
  const { user, tenant, session, mfa } = value;
  return (
    text(user.id) &&
    text(user.email) &&
    (user.name === null || typeof user.name === 'string') &&
    user.status === 'ACTIVE' &&
    text(session.id) &&
    text(session.expiresAt) &&
    Date.parse(session.expiresAt) > Date.now() &&
    (tenant === null ||
      (record(tenant) &&
        text(tenant.id) &&
        text(tenant.name) &&
        text(tenant.slug) &&
        text(tenant.status) &&
        (tenant.trialEndsAt === null || text(tenant.trialEndsAt)) &&
        Array.isArray(tenant.features) &&
        tenant.features.every(text) &&
        Array.isArray(tenant.entitlements) &&
        tenant.entitlements.every(
          (entitlement) =>
            record(entitlement) &&
            text(entitlement.moduleKey) &&
            entitlement.status === 'ENABLED' &&
            text(entitlement.version),
        ))) &&
    Array.isArray(value.roles) &&
    value.roles.every(text) &&
    Array.isArray(value.platformRoles) &&
    value.platformRoles.every(text) &&
    Array.isArray(value.permissions) &&
    value.permissions.every(text) &&
    Number.isSafeInteger(value.authVersion) &&
    Number(value.authVersion) > 0 &&
    record(value.orgScope) &&
    (value.orgScope.mode === 'FLAT_TENANT' ||
      (value.orgScope.mode === 'SCOPED_DEPARTMENTS' &&
        Array.isArray(value.orgScope.departmentIds) &&
        value.orgScope.departmentIds.every(text))) &&
    record(value.spatialScope) &&
    (value.spatialScope.mode === 'UNBOUNDED' ||
      (value.spatialScope.mode === 'SCOPED_PLACES' &&
        SpatialScopePlaceIdsSchema.safeParse(value.spatialScope.placeIds).success)) &&
    typeof mfa.required === 'boolean' &&
    typeof mfa.enrolled === 'boolean' &&
    typeof mfa.verified === 'boolean' &&
    Number.isSafeInteger(mfa.recoveryCodesRemaining) &&
    Number(mfa.recoveryCodesRemaining) >= 0
  );
}

export type SessionResult =
  | { context: VerifiedSession; response?: never }
  | { context?: never; response: NextResponse };

// This checks the canonical DB session and current membership, not decoded JWT claims.
// Server components must not rotate cookies; route handlers may renew the session.
export async function verifiedSession(allowRefresh = true): Promise<SessionResult> {
  try {
    let response: Response | null;
    if (allowRefresh) {
      response = await authenticatedUpstream('control', '/api/v1/auth/context');
    } else {
      const token = (await cookies()).get(ACCESS_COOKIE_NAME)?.value;
      if (!token) return { response: authenticationRequired() };
      response = await fetch(controlPlaneUrl('/api/v1/auth/context'), {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
      });
    }
    if (!response || response.status === 401) return { response: authenticationRequired() };
    if (response.status === 403)
      return {
        response: NextResponse.json(
          { detail: 'Access denied.' },
          { status: 403, headers: { 'Cache-Control': 'no-store' } },
        ),
      };
    if (!response.ok) throw new UpstreamUnavailableError('control');
    const context: unknown = await response.json();
    if (!isVerifiedSession(context)) throw new UpstreamUnavailableError('control');
    if (context.tenant && !['ACTIVE', 'TRIAL'].includes(context.tenant.status))
      return {
        response: NextResponse.json(
          { detail: 'This workspace is not active.' },
          { status: 403, headers: { 'Cache-Control': 'no-store' } },
        ),
      };
    return { context };
  } catch (error) {
    return { response: unavailable(error) };
  }
}
