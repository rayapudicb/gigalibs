import { NextRequest, NextResponse } from 'next/server'

// Hostnames and legacy browser cookies are never authoritative tenant identity.
// Route handlers and the app layout validate the canonical session independently.
export function middleware(request: NextRequest) {
  const headers = new Headers(request.headers)
  for (const name of ['x-tenant-id', 'x-tenant-slug', 'x-tenant-subdomain', 'x-user-id', 'x-user-role']) {
    headers.delete(name)
  }
  return NextResponse.next({ request: { headers } })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
