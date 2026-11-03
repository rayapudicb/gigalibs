import type { MasterDataGroup } from '@gigalibs/contracts';
import { ErrorState } from '@gigalibs/web-sdk';
import { readableMasters } from '@/lib/master-data';
import { uatPreviewEnabled } from '@/lib/uat-module-status';
import { verifiedSession } from '@/lib/verified-session';
import { MasterDataHub } from './MasterDataHub';

// WI-OI-152: the server decides which masters the person may read (entitlement, readiness and read permission); the
// hub only counts them, as the person, through each module's own API.
export async function MasterDataScreen({ group }: { group: MasterDataGroup | 'all' }) {
  const session = await verifiedSession(false);
  if (session.response) return <ErrorState message="Your access could not be checked. Reload the page or sign in again." />;
  const masters = readableMasters({ ...session.context, uatPreview: uatPreviewEnabled() });
  return <MasterDataHub masters={masters} group={group} />;
}
