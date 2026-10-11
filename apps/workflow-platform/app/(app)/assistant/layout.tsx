import { verifiedSession } from '@/lib/verified-session';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

export default async function AssistantLayout({ children }: { children: ReactNode }) {
  const session = await verifiedSession(false);
  if (session.response || !session.context?.tenant) notFound();
  const permissions = session.context.permissions || [];
  const canAccess =
    permissions.includes('assistant:read') ||
    permissions.includes('assistant:*') ||
    permissions.includes('*') ||
    permissions.includes('assistant:preview');
  if (!canAccess) notFound();
  return children;
}
