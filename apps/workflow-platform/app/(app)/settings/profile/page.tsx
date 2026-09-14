import { UserProfileSecurityView } from '@/components/settings/UserProfileSecurityView';
import { verifiedSession } from '@/lib/verified-session';

export default async function AccountSecurityPage() {
  const session = await verifiedSession(false);
  if (session.response) {
    return (
      <main className="p-8" role="alert">
        Account security could not be verified. Reload the page or sign in again.
      </main>
    );
  }
  return <UserProfileSecurityView session={session.context} />;
}
