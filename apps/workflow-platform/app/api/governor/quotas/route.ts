import { NextResponse } from 'next/server';
import { nextGovernorStore } from '../../../../lib/governor';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tenantId =
    request.headers.get('x-tenant-id') ||
    searchParams.get('tenantId') ||
    'default-system-tenant';

  const status = nextGovernorStore.getQuotaStatus(tenantId);

  return NextResponse.json({
    status: 'active',
    governor: {
      tenantId: status.tenantId,
      tier: status.tier,
      limits: status.config,
      liveState: {
        availableTokens: status.availableTokens,
      },
    },
  });
}
