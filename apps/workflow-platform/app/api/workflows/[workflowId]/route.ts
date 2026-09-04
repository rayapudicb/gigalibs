import { authenticatedUpstream, authenticationRequired, proxyUpstream, unavailable } from '@/lib/authenticated-upstream'

export async function GET(
  _request: Request,
  context: { params: Promise<{ workflowId: string }> },
) {
  const { workflowId } = await context.params
  try {
    const response = await authenticatedUpstream(
      'control',
      `/api/v1/workflows/pipelines/${encodeURIComponent(workflowId)}`,
    )
    return response ? proxyUpstream(response) : authenticationRequired()
  } catch (error) {
    return unavailable(error)
  }
}
