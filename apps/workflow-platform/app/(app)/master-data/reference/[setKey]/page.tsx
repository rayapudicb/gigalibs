import { ReferenceSetKeySchema } from '@gigalibs/contracts';
import { notFound } from 'next/navigation';
import { PlatformReferenceViewer } from '@/components/master-data/PlatformReferenceViewer';
import { hasPermission } from '@/lib/module-access';
import { verifiedSession } from '@/lib/verified-session';

export default async function PlatformReferencePage({ params }: { params: Promise<{ setKey: string }> }) {
  const { setKey } = await params;
  const parsed = ReferenceSetKeySchema.safeParse(setKey);
  if (!parsed.success) notFound();
  const session = await verifiedSession(false);
  if (session.response) notFound();
  if (!hasPermission(session.context.permissions, 'tenant:read')) notFound();
  return <PlatformReferenceViewer setKey={parsed.data} />;
}
