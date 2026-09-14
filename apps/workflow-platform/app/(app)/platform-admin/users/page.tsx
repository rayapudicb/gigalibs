import { PlatformUserControl } from '@/components/platform/PlatformUserControl';
import { verifiedSession } from '@/lib/verified-session';

export default async function PlatformUsersPage() {
  const session = await verifiedSession(false);
  if (session.response) {
    return <div className="p-10 text-sm text-red-700">Platform authority could not be verified.</div>;
  }
  if (session.context.platformRoles.length === 0) {
    return <div className="p-10 text-sm text-amber-800">Global platform authority is required.</div>;
  }
  return <PlatformUserControl session={session.context} />;
}
