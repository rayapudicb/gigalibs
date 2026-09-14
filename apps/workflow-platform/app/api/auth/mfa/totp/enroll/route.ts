import {
  authenticatedUpstream,
  authenticationRequired,
  proxyUpstream,
  unavailable,
} from '@/lib/authenticated-upstream';

export async function POST() {
  try {
    const response = await authenticatedUpstream('control', '/api/v1/auth/mfa/totp/enroll', {
      method: 'POST',
    });
    return response ? proxyUpstream(response) : authenticationRequired();
  } catch (error) {
    return unavailable(error);
  }
}
