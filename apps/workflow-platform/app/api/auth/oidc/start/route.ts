import { controlPlaneUrl } from '@/lib/control-plane';
import { requestOrigin } from '@/lib/request-origin';
import { StartOidcLoginSchema } from '@gigalibs/contracts';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const parsed = StartOidcLoginSchema.safeParse({
    tenantSlug: new URL(request.url).searchParams.get('tenant'),
  });
  if (!parsed.success) {
    return NextResponse.redirect(new URL('/login?ssoError=workspace', requestOrigin(request)));
  }
  try {
    const upstream = await fetch(controlPlaneUrl('/api/v1/auth/oidc/start'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(parsed.data),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
    if (!upstream.ok) {
      return NextResponse.redirect(new URL('/login?ssoError=unavailable', requestOrigin(request)));
    }
    const payload = (await upstream.json().catch(() => null)) as {
      authorizationUrl?: unknown;
    } | null;
    if (typeof payload?.authorizationUrl !== 'string') {
      return NextResponse.redirect(new URL('/login?ssoError=invalid', requestOrigin(request)));
    }
    const authorizationUrl = new URL(payload.authorizationUrl);
    const testLoopback =
      process.env.NODE_ENV !== 'production' &&
      ['localhost', '127.0.0.1', '::1'].includes(authorizationUrl.hostname);
    if (
      authorizationUrl.protocol !== 'https:' &&
      !(testLoopback && authorizationUrl.protocol === 'http:')
    ) {
      return NextResponse.redirect(new URL('/login?ssoError=invalid', requestOrigin(request)));
    }
    return NextResponse.redirect(authorizationUrl);
  } catch {
    return NextResponse.redirect(new URL('/login?ssoError=unavailable', requestOrigin(request)));
  }
}
