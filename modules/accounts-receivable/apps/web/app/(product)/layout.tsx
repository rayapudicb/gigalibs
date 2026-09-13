import { AppShell } from '@/components/app-shell';
import { openSession, sessionCookieName } from '@/lib/session';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function ProductLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  const session = await openSession(store.get(sessionCookieName())?.value);
  if (!session) redirect('/auth/login');
  return <AppShell subject={session.sub}>{children}</AppShell>;
}
