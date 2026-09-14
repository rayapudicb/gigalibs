import { StudioSurfaceBoundary } from '@/components/configuration/StudioMode';
import { ConfiguredTenantFields } from '@/components/settings/ConfiguredTenantFields';
import { TenantAccessManager } from '@/components/settings/TenantAccessManager';
import { TenantLocalizationSettings } from '@/components/settings/TenantLocalizationSettings';
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
      <>
        <div className="bg-ui-bg-subtle px-8 pt-8">
          <TenantLocalizationSettings tenantId={tenantId} canUpdate={canUpdateConfiguredValues} />
        </div>
        <TenantAccessManager
          currentUserId={session.context.user.id}
          permissions={permissions}
          roles={session.context.roles}
          tenantName={session.context.tenant?.name ?? 'Current workspace'}
        />
        {tenantId ? (
          <div className="bg-ui-bg-subtle px-8 pb-8">
            <ConfiguredTenantFields tenantId={tenantId} canUpdate={canUpdateConfiguredValues} />
          </div>
        ) : null}
      </>
    </StudioSurfaceBoundary>
  );
}
