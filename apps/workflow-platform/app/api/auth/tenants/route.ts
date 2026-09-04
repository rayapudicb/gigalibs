import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { ACCESS_COOKIE_NAME, controlPlaneUrl, upstreamError } from '@/lib/control-plane'

export async function GET() {
  const accessToken = (await cookies()).get(ACCESS_COOKIE_NAME)?.value
  if (!accessToken) {
    return NextResponse.json({ detail: 'Authentication required.' }, { status: 401 })
  }

  try {
    const upstream = await fetch(controlPlaneUrl('/api/v1/tenants'), {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    })
    if (!upstream.ok) {
      return NextResponse.json({ detail: await upstreamError(upstream) }, { status: upstream.status })
    }
    return NextResponse.json(await upstream.json())
  } catch {
    return NextResponse.json({ detail: 'Tenant service is unavailable.' }, { status: 503 })
  }
}
