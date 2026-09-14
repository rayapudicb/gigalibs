import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { authenticatedUpstream, unavailable } from '../../../../lib/authenticated-upstream';
import { ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME, UpstreamUnavailableError } from '../../../../lib/control-plane';

export async function POST() {
  try {
    const response = await authenticatedUpstream('control', '/api/v1/auth/logout', { method: 'POST' });
    if (response && !response.ok && response.status !== 401) throw new UpstreamUnavailableError('control');
    const store = await cookies();
    for (const name of [ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME, 'wf_session', 'wf_tenant', 'wf_user_id', 'wf_role']) {
      store.delete(name);
    }
    return NextResponse.json({ authenticated: false }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return unavailable(error); }
}
