import { NextResponse } from 'next/server';
import { verifiedSession } from '../../../../lib/verified-session';

export async function GET() {
  const session = await verifiedSession();
  return session.response ?? NextResponse.json(session.context, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
