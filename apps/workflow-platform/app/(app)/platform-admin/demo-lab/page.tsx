import { DemoLabConsole } from '@/components/platform/DemoLabConsole';
import { verifiedSession } from '@/lib/verified-session';
import { redirect } from 'next/navigation';

// WI-OI-064e: platform administrators create isolated, labelled Demo Lab workspaces with synthetic data only.
export default async function DemoLabPage() {
  const session = await verifiedSession(false);
  if (session.response?.status === 401) redirect('/login');
  if (session.response || session.context.platformRoles.length === 0) redirect('/platform-admin');
  return <DemoLabConsole />;
}
