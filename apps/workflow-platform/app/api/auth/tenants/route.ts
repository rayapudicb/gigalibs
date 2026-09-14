import { authenticatedUpstream, authenticationRequired, proxyUpstream, unavailable } from '../../../../lib/authenticated-upstream';

export async function GET() {
  try {
    const response = await authenticatedUpstream('control', '/api/v1/tenants');
    return response ? proxyUpstream(response) : authenticationRequired();
  } catch (error) { return unavailable(error); }
}
