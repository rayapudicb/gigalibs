import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import {
  ACCESS_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  controlPlaneUrl,
} from '@/lib/control-plane'

export async function POST() {
  const cookieStore = await cookies()
  const accessToken = cookieStore.get(ACCESS_COOKIE_NAME)?.value
  if (accessToken) {
    try {
      await fetch(controlPlaneUrl('/api/v1/auth/logout'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      })
    } catch {
      // Local credentials are still removed; the short-lived server token will expire.
    }
  }
  cookieStore.delete(ACCESS_COOKIE_NAME)
  cookieStore.delete(REFRESH_COOKIE_NAME)
  cookieStore.delete('wf_session')
  return NextResponse.json({ message: 'Logged out successfully.' })
}
