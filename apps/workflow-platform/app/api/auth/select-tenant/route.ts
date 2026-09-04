import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import {
  ACCESS_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  accessCookieOptions,
  controlPlaneUrl,
  isTokenResponse,
  refreshCookieOptions,
  upstreamError,
} from '@/lib/control-plane'

export async function POST(request: Request) {
  const cookieStore = await cookies()
  const accessToken = cookieStore.get(ACCESS_COOKIE_NAME)?.value
  if (!accessToken) {
    return NextResponse.json({ detail: 'Authentication required.' }, { status: 401 })
  }

  const body = (await request.json()) as { tenantId?: unknown }
  if (typeof body.tenantId !== 'string' || body.tenantId.length === 0) {
    return NextResponse.json({ detail: 'A tenant must be selected.' }, { status: 400 })
  }

  try {
    const upstream = await fetch(controlPlaneUrl('/api/v1/auth/select-tenant'), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tenantId: body.tenantId }),
      cache: 'no-store',
    })
    if (!upstream.ok) {
      return NextResponse.json({ detail: await upstreamError(upstream) }, { status: upstream.status })
    }

    const tokenResponse: unknown = await upstream.json()
    if (!isTokenResponse(tokenResponse)) {
      return NextResponse.json({ detail: 'Tenant service returned an invalid token contract.' }, { status: 502 })
    }
    cookieStore.set(
      ACCESS_COOKIE_NAME,
      tokenResponse.accessToken,
      accessCookieOptions(tokenResponse.expiresIn),
    )
    cookieStore.set(REFRESH_COOKIE_NAME, tokenResponse.refreshToken, refreshCookieOptions())
    return NextResponse.json({ authenticated: true })
  } catch {
    return NextResponse.json({ detail: 'Tenant service is unavailable.' }, { status: 503 })
  }
}
