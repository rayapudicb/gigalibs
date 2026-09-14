import {
  authenticatedUpstream,
  authenticationRequired,
  proxyUpstream,
  readBoundedBody,
  unavailable,
} from '@/lib/authenticated-upstream';

const ALLOWED_QUERY_PARAMETERS = ['workflowId', 'status', 'limit', 'offset'] as const;

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const query = new URLSearchParams();
  for (const parameter of ALLOWED_QUERY_PARAMETERS) {
    const value = requestUrl.searchParams.get(parameter);
    if (value !== null) query.set(parameter, value);
  }
  const suffix = query.size > 0 ? `?${query.toString()}` : '';
  try {
    const response = await authenticatedUpstream('execution', `/api/v1/runs${suffix}`);
    return response ? proxyUpstream(response) : authenticationRequired();
  } catch {
    return Response.json(
      { items: [], total: 0, offset: 0, limit: 100 },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

export async function POST(request: Request) {
  const idempotencyKey = request.headers.get('Idempotency-Key');
  if (!idempotencyKey) {
    return Response.json({ detail: 'Idempotency-Key is required.' }, { status: 400 });
  }
  try {
    const response = await authenticatedUpstream('execution', '/api/v1/runs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: await readBoundedBody(request),
    });
    return response ? proxyUpstream(response) : authenticationRequired();
  } catch (error) {
    return unavailable(error);
  }
}
