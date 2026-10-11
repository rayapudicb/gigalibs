import { verifiedSession } from '@/lib/verified-session';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

export default async function AuditLayout({ children }: { children: ReactNode }) {
  const session = await verifiedSession(false);
  if (session.response || !session.context?.tenant) notFound();
  return children;
}
