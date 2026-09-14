import { TenantApplicationWorkbench } from '@/components/configuration/TenantApplicationWorkbench';
import { verifiedSession } from '@/lib/verified-session';
import { notFound } from 'next/navigation';

export default async function TenantApplicationPage({ params }: { params: Promise<{ appKey: string }> }) {
  const session = await verifiedSession(false);
  if (session.response) return <main className="p-8" role="alert">An active tenant session is required.</main>;
  const appKey = (await params).appKey;
  if (!/^[a-z][a-z0-9-]{1,79}$/.test(appKey)) notFound();
  const permissions = session.context.permissions;
  const canWrite = permissions.includes('*') || permissions.includes('configuration-apps:*') || permissions.includes('configuration-apps:write');
  return <TenantApplicationWorkbench appKey={appKey} canWrite={canWrite} />;
}
