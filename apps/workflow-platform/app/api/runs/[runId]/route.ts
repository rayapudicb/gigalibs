import { authenticatedUpstream, authenticationRequired, proxyUpstream, unavailable } from '@/lib/authenticated-upstream'

export async function GET(
  _request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  const { runId } = await context.params
  try {
    const response = await authenticatedUpstream(
      'execution',
      `/api/v1/runs/${encodeURIComponent(runId)}`,
    )
    return response ? proxyUpstream(response) : authenticationRequired()
  } catch (error) {
    return unavailable(error)
  }
}
