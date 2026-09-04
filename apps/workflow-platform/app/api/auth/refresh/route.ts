import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import {
  ACCESS_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  accessCookieOptions,
  controlPlaneUrl,
  isTokenResponse,
  refreshCookieOptions,
  tokenHasTenant,
} from '@/lib/control-plane'

export async function POST() {
  const cookieStore = await cookies()
  const refreshToken = cookieStore.get(REFRESH_COOKIE_NAME)?.value
  if (!refreshToken) {
    return NextResponse.json({ detail: 'Refresh session is missing.' }, { status: 401 })
  }

  try {
    const upstream = await fetch(controlPlaneUrl('/api/v1/auth/refresh'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      cache: 'no-store',
    })
    const response: unknown = await upstream.json()
    if (!upstream.ok || !isTokenResponse(response)) {
      cookieStore.delete(ACCESS_COOKIE_NAME)
      cookieStore.delete(REFRESH_COOKIE_NAME)
      return NextResponse.json({ detail: 'Refresh session is invalid or expired.' }, { status: 401 })
    }

    cookieStore.set(ACCESS_COOKIE_NAME, response.accessToken, accessCookieOptions(response.expiresIn))
    cookieStore.set(REFRESH_COOKIE_NAME, response.refreshToken, refreshCookieOptions())
    return NextResponse.json({
      authenticated: true,
      requiresTenantSelection: !tokenHasTenant(response.accessToken),
    })
  } catch {
    return NextResponse.json({ detail: 'Authentication service is unavailable.' }, { status: 503 })
  }
}
