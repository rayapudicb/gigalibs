import { StudioSurfaceBoundary } from '@/components/configuration/StudioMode';
import { TenantSettingsView } from '@/components/settings/TenantSettingsView';
import { verifiedSession } from '@/lib/verified-session';

export default async function TenantSettingsPage() {
  const session = await verifiedSession(false);
  if (session.response) {
    return (
      <main className="p-8" role="alert">
        Tenant access could not be verified. Reload the page or sign in again.
      </main>
    );
  }

  const tenantId = session.context.tenant?.id ?? '';
  const permissions = session.context.permissions;
  const canUpdateConfiguredValues =
    permissions.includes('*') ||
    permissions.includes('configuration-values:*') ||
    permissions.includes('configuration-values:update');

  return (
    <StudioSurfaceBoundary
      registrationKey="tenant-profile-extension"
      moduleLabel="Tenant & Access"
      screenLabel="Tenant Settings"
    >
      <TenantSettingsView
        session={session.context}
        tenantId={tenantId}
        canUpdateConfiguredValues={canUpdateConfiguredValues}
      />
    </StudioSurfaceBoundary>
  );
}
