import { NextRequest, NextResponse } from 'next/server'
import { ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME } from '@/lib/auth-constants'

export function middleware(request: NextRequest) {
  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*', '/workflows/:path*', '/runs/:path*', '/brain/:path*', '/connections/:path*', '/usage/:path*', '/audit/:path*', '/admin/:path*'],
}
