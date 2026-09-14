import { ResetPasswordSchema } from '@gigalibs/contracts';
import { NextResponse } from 'next/server';
import { readBoundedBody, unavailable } from '@/lib/authenticated-upstream';
import { controlPlaneUrl } from '@/lib/control-plane';

export async function POST(request: Request) {
  try {
    const rawBody = await readBoundedBody(request);
    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ detail: 'Request body must be valid JSON.' }, { status: 400 });
    }
    const parsed = ResetPasswordSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { detail: 'A valid reset credential and password of 12 to 128 characters are required.' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    const upstream = await fetch(controlPlaneUrl('/api/v1/auth/reset-password'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(parsed.data),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]),
    });
    const payload: unknown = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      return NextResponse.json(
        {
          detail:
            upstream.status === 401
              ? 'The reset credential is invalid, expired, or already used.'
              : 'Password reset could not be completed.',
        },
        { status: upstream.status, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return unavailable(error);
  }
}
