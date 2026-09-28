import { NextRequest, NextResponse } from 'next/server';
import { verifiedSession } from '@/lib/verified-session';
import { formsEngineService } from '@/lib/forms-engine-service';
import { MobileFormsSyncQuerySchema } from '@gigalibs/contracts';

export const runtime = 'nodejs';

/**
 * GET /api/forms/mobile/sync
 * Mobile-First Delta Sync for offline caching in SQLite/WatermelonDB.
 */
export async function GET(request: NextRequest) {
  const session = await verifiedSession(false);
  if (session.response) return session.response;
  if (!session.context.tenant) {
    return NextResponse.json({ error: 'Tenant context required.' }, { status: 400 });
  }

  const searchParams = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = MobileFormsSyncQuerySchema.safeParse(searchParams);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid sync query parameters', details: parsed.error.issues },
      { status: 400 }
    );
  }

  try {
    const syncData = await formsEngineService.mobileSync(
      session.context.tenant.id,
      parsed.data
    );
    return NextResponse.json(syncData);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to sync mobile forms' },
      { status: 500 }
    );
  }
}
