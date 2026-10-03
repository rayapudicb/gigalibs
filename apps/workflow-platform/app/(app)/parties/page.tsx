import { PartyWorkspace } from '@/components/parties/PartyWorkspace';
import { verifiedSession } from '@/lib/verified-session';

export const metadata = {
  title: 'Core Parties & Counterparties | GigaLibs',
  description: 'Manage master organizations, counterparties, roles and addresses',
};

export default async function PartiesPage() {
  const session = await verifiedSession(false);
  if (session.response) {
    return (
      <main className="p-8 text-rose-300" role="alert">
        Tenant access could not be verified. Reload the page or sign in again.
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950">
      <PartyWorkspace />
    </main>
  );
}
