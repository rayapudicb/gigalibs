import {
  authenticatedUpstream,
  authenticationRequired,
  proxyUpstream,
  readBoundedBody,
  unavailable,
} from '@/lib/authenticated-upstream';
import { NextResponse } from 'next/server';

const ALLOWED_ROOTS = new Set(['ap', 'exceptions', 'value']);

function upstreamPath(path: string[], request: Request): string | null {
  if (path.length === 0 || !ALLOWED_ROOTS.has(path[0] ?? '')) return null;
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
