import { NextResponse } from 'next/server';
import { SamGovClient } from '@/lib/connectors/sam-gov-client';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { apiKey = 'DEMO_SANDBOX_KEY', isSandbox = true, naicsCodes = ['541512'] } = body;

    const client = new SamGovClient({
      apiKey,
      isSandbox,
      naicsCodes,
      syncFrequencyHours: 6,
    });

    const [opportunities, exclusions] = await Promise.all([
      client.getOpportunities('tenant-default'),
      client.getExclusions('tenant-default'),
    ]);

    return NextResponse.json({
      success: true,
      syncedAt: new Date().toISOString(),
      opportunities,
      exclusions,
      summary: {
        totalOpportunities: opportunities.length,
        totalExclusions: exclusions.length,
        topDepartment: 'DEPARTMENT OF DEFENSE',
        activeNAICS: naicsCodes[0] || '541512',
      },
    });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message || 'Sync failed' }, { status: 500 });
  }
}
