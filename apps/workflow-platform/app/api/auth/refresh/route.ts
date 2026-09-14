import { NextResponse } from 'next/server';
import { refreshAccessToken, authenticationRequired, unavailable } from '../../../../lib/authenticated-upstream';
import { tokenHasTenant } from '../../../../lib/control-plane';

export async function POST() {
  try {
    const accessToken = await refreshAccessToken();
    return accessToken ? NextResponse.json({
      authenticated: true, requiresTenantSelection: !tokenHasTenant(accessToken),
    }, { headers: { 'Cache-Control': 'no-store' } }) : authenticationRequired();
  } catch (error) { return unavailable(error); }
}
