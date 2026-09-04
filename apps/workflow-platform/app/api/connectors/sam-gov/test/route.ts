import { NextResponse } from 'next/server';
import { SamGovClient } from '@/lib/connectors/sam-gov-client';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { apiKey, isSandbox, naicsCodes } = body;

    if (!apiKey) {
      return NextResponse.json({ detail: 'SAM.gov API Key is required.' }, { status: 400 });
    }

    const start = Date.now();
    const client = new SamGovClient({
      apiKey,
      isSandbox: !!isSandbox,
      naicsCodes: naicsCodes || ['541512'],
      syncFrequencyHours: 6,
    });

    const opportunities = await client.getOpportunities('test');
    const latencyMs = Date.now() - start;

    return NextResponse.json({
      success: true,
      status: 'CONNECTED',
      latencyMs,
      opportunitiesCount: opportunities.length,
      gateway: isSandbox ? 'GSA Open Technology Sandbox' : 'api.sam.gov Production Gateway',
      verifiedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message || 'Connection test failed' }, { status: 500 });
  }
}
