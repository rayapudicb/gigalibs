import {
  authenticatedUpstream,
  authenticationRequired,
  proxyUpstream,
  unavailable,
} from '@/lib/authenticated-upstream';

/**
 * Exact-route proxy for the code-owned control-plane registry.
 *
 * Surface definitions must never be duplicated in the web application: the
 * control plane owns registration, permissions, core locks and extension slots.
 */
export async function GET() {
  try {
    const response = await authenticatedUpstream('control', '/api/v1/configuration/surfaces');
    return response ? proxyUpstream(response) : authenticationRequired();
  } catch (error) {
    return unavailable(error);
  }
}
