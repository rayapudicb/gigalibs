import { NextResponse } from 'next/server';
import { nextGovernorStore, TenantTier } from '../../../../lib/governor';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const tenantId =
      body?.tenantId ||
      request.headers.get('x-tenant-id') ||
      'default-system-tenant';
    const tier = body?.tier as TenantTier | undefined;

    const decision = nextGovernorStore.consume(tenantId, tier);

    const headers: Record<string, string> = {
      'X-RateLimit-Limit': String(decision.limit),
      'X-RateLimit-Remaining': String(decision.remaining),
      'X-RateLimit-Reset': String(decision.resetSeconds),
      'X-Governor-Tier': decision.tier,
    };

    if (!decision.allowed) {
      headers['Retry-After'] = String(decision.retryAfterSeconds);
      return NextResponse.json(
        {
          statusCode: 429,
          error: 'Too Many Requests',
          code: 'GOVERNOR_RATE_LIMIT_EXCEEDED',
          message: `Governor rate limit exceeded for tenant '${tenantId}' on tier '${decision.tier}'. Retry after ${decision.retryAfterSeconds}s.`,
          tenantId,
          tier: decision.tier,
          retryAfterSeconds: decision.retryAfterSeconds,
        },
        { status: 429, headers },
      );
    }

    return NextResponse.json(
      {
        allowed: true,
        decision,
      },
      { status: 200, headers },
    );
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
