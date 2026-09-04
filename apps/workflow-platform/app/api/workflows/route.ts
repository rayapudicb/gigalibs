import {
  authenticatedUpstream,
  authenticationRequired,
  proxyUpstream,
  readBoundedBody,
  unavailable,
} from '@/lib/authenticated-upstream';

export async function GET() {
  try {
    const response = await authenticatedUpstream('control', '/api/v1/workflows/pipelines');
    return response ? proxyUpstream(response) : authenticationRequired();
  } catch (error) {
    return unavailable(error);
  }
}

export async function POST(request: Request) {
  try {
    const response = await authenticatedUpstream('control', '/api/v1/workflows/pipelines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: await readBoundedBody(request),
    });
    return response ? proxyUpstream(response) : authenticationRequired();
  } catch (error) {
    return unavailable(error);
  }
}
