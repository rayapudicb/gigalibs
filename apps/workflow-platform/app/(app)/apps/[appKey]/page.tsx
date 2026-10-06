import { TenantApplicationWorkbench } from '@/components/configuration/TenantApplicationWorkbench';
import { StudioSurfaceBoundary } from '@/components/configuration/StudioMode';
import { verifiedSession } from '@/lib/verified-session';
import { notFound } from 'next/navigation';
import { holdsAnyPermission } from '@gigalibs/contracts';

export default async function TenantApplicationPage({ params }: { params: Promise<{ appKey: string }> }) {
  const session = await verifiedSession(false);
  if (session.response) return <main className="p-8" role="alert">An active tenant session is required.</main>;
  const appKey = (await params).appKey;
  if (!/^[a-z][a-z0-9-]{1,79}$/.test(appKey)) notFound();
  const permissions = session.context.permissions;
  const canWrite = holdsAnyPermission(permissions, ['configuration-apps:write']);
  return (
    <StudioSurfaceBoundary
      registrationKey="tenant-record-application"
      moduleLabel="Application Record"
      screenLabel="App Configuration"
    >
      <TenantApplicationWorkbench appKey={appKey} canWrite={canWrite} />
    </StudioSurfaceBoundary>
  );
}
