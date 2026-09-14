import {
  authenticatedUpstream,
  authenticationRequired,
  proxyUpstream,
  readBoundedBody,
  unavailable,
} from '@/lib/authenticated-upstream';
import { NextResponse } from 'next/server';

const ALLOWED_ROOTS = new Set([
  'ap',
  'auth',
  'configuration',
  'exceptions',
  'platform',
  'settings',
  'tenants',
  'value',
]);

function isAllowedAuthPath(path: string[]): boolean {
  const joined = path.join('/');
  if (
    joined === 'auth/oidc/config' ||
    joined === 'auth/oidc/link/start' ||
    joined === 'auth/external-identities' ||
    joined === 'auth/mfa/assisted-recovery'
  )
    return true;
  if (joined === 'auth/mfa/assisted-recovery/consume') return true;
  if (
    path.length === 4 &&
    path[0] === 'auth' &&
    path[1] === 'external-identities' &&
    typeof path[2] === 'string' &&
    path[2].length > 0 &&
    path[3] === 'revoke'
  )
    return true;
  return (
    path.length === 5 &&
    path[0] === 'auth' &&
    path[1] === 'mfa' &&
    path[2] === 'assisted-recovery' &&
    typeof path[3] === 'string' &&
    path[3].length > 0 &&
    (path[4] === 'approve' || path[4] === 'reject')
  );
}

function upstreamPath(path: string[], request: Request): string | null {
  if (path.length === 0 || !ALLOWED_ROOTS.has(path[0] ?? '')) return null;
  if (path[0] === 'auth' && !isAllowedAuthPath(path)) return null;
  const encoded = path.map((segment) => encodeURIComponent(segment)).join('/');
  return `/api/v1/${encoded}${new URL(request.url).search}`;
}

export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  try {
    const path = upstreamPath((await context.params).path, request);
    if (!path)
      return NextResponse.json({ detail: 'Unsupported control-plane route.' }, { status: 404 });
    const response = await authenticatedUpstream('control', path);
    return response ? proxyUpstream(response) : authenticationRequired();
  } catch (error) {
    return unavailable(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ path: string[] }> }) {
  try {
    const path = upstreamPath((await context.params).path, request);
    if (!path)
      return NextResponse.json({ detail: 'Unsupported control-plane route.' }, { status: 404 });
    const body = await readBoundedBody(request);
    const response = await authenticatedUpstream('control', path, {
      method: 'POST',
      ...(body ? { headers: { 'Content-Type': 'application/json' }, body } : {}),
    });
    return response ? proxyUpstream(response) : authenticationRequired();
  } catch (error) {
    return unavailable(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ path: string[] }> }) {
  try {
    const path = upstreamPath((await context.params).path, request);
    if (!path)
      return NextResponse.json({ detail: 'Unsupported control-plane route.' }, { status: 404 });
    const body = await readBoundedBody(request);
    const response = await authenticatedUpstream('control', path, {
      method: 'PATCH',
      ...(body ? { headers: { 'Content-Type': 'application/json' }, body } : {}),
    });
    return response ? proxyUpstream(response) : authenticationRequired();
  } catch (error) {
    return unavailable(error);
  }
}

export async function PUT(request: Request, context: { params: Promise<{ path: string[] }> }) {
  try {
    const path = upstreamPath((await context.params).path, request);
    if (!path)
      return NextResponse.json({ detail: 'Unsupported control-plane route.' }, { status: 404 });
    const body = await readBoundedBody(request);
    const response = await authenticatedUpstream('control', path, {
      method: 'PUT',
      ...(body ? { headers: { 'Content-Type': 'application/json' }, body } : {}),
    });
    return response ? proxyUpstream(response) : authenticationRequired();
  } catch (error) {
    return unavailable(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ path: string[] }> }) {
  try {
    const path = upstreamPath((await context.params).path, request);
    if (!path)
      return NextResponse.json({ detail: 'Unsupported control-plane route.' }, { status: 404 });
    const response = await authenticatedUpstream('control', path, { method: 'DELETE' });
    return response ? proxyUpstream(response) : authenticationRequired();
  } catch (error) {
    return unavailable(error);
  }
}
