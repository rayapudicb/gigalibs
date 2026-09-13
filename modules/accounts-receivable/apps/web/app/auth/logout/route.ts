import { webConfig } from '@/lib/config';
import { clearAuthCookies } from '@/lib/session';
import { NextResponse } from 'next/server';

export async function POST(): Promise<NextResponse> {
  const response = NextResponse.redirect(new URL('/auth/signed-out', webConfig().webBaseUrl), 303);
  clearAuthCookies(response);
  return response;
}
