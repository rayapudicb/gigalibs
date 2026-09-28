import { NextResponse } from 'next/server';
import { controlPlaneUrl } from '../../../../lib/control-plane';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const response = await fetch(controlPlaneUrl('/api/v1/ready'), {
      method: 'GET',
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(2_000),
    });
    const payload: unknown = await response.json().catch(() => null);
    if (
      !response.ok ||
      !payload ||
      typeof payload !== 'object' ||
      (payload as { status?: unknown }).status !== 'ready' ||
      (payload as { database?: unknown }).database !== 'connected'
    ) {
      throw new Error('Control-plane readiness contract was not satisfied.');
    }
    return NextResponse.json(
      { status: 'ready', controlPlane: 'ready' },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return NextResponse.json(
      { status: 'not-ready', controlPlane: 'unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
