import {
  authenticatedUpstream,
  authenticationRequired,
  proxyUpstream,
  readBoundedBody,
  unavailable,
} from '@/lib/authenticated-upstream';

export async function POST(request: Request, context: { params: Promise<{ workflowId: string }> }) {
  const { workflowId } = await context.params;
  try {
    const response = await authenticatedUpstream(
      'control',
      `/api/v1/workflows/pipelines/${encodeURIComponent(workflowId)}/publish`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: await readBoundedBody(request),
      },
    );
    return response ? proxyUpstream(response) : authenticationRequired();
  } catch (error) {
    return unavailable(error);
  }
}
