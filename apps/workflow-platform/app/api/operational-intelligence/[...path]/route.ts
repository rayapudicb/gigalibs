import {
  authenticatedUpstream,
  authenticationRequired,
  proxyUpstream,
  readBoundedBody,
  unavailable,
} from '@/lib/authenticated-upstream';

function upstreamPath(path: string[], request: Request): string {
  const encoded = path.map((segment) => encodeURIComponent(segment)).join('/');
  const query = new URL(request.url).search;
  return `/api/v1/operational-intelligence/${encoded}${query}`;
}

export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  try {
    const { path } = await context.params;
    const response = await authenticatedUpstream('control', upstreamPath(path, request));
    return response ? proxyUpstream(response) : authenticationRequired();
  } catch (error) {
    return unavailable(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ path: string[] }> }) {
  try {
    const { path } = await context.params;
    const body = await readBoundedBody(request);
    const response = await authenticatedUpstream('control', upstreamPath(path, request), {
      method: 'POST',
      ...(body ? { headers: { 'Content-Type': 'application/json' }, body } : {}),
    });
    return response ? proxyUpstream(response) : authenticationRequired();
  } catch (error) {
    return unavailable(error);
  }
}
