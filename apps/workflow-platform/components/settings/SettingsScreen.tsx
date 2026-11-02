import { StudioSurfaceBoundary } from '@/components/configuration/StudioMode';
import { type SettingsSection, TenantSettingsView } from '@/components/settings/TenantSettingsView';
import { uatPreviewEnabled } from '@/lib/uat-module-status';
import { verifiedSession } from '@/lib/verified-session';
import { holdsAnyPermission } from '@gigalibs/contracts';

/** One Settings screen for its route (WI-OI-145): the server half shared by /settings and /settings/[section]. */
export async function SettingsScreen({ section }: { section: SettingsSection }) {
  const session = await verifiedSession(false);
  if (session.response) {
    return (
      <p role="alert" className="text-sm text-ui-fg-subtle">
        Tenant access could not be verified. Reload the page or sign in again.
      </p>
    );
  }

  const tenantId = session.context.tenant?.id ?? '';
  const permissions = session.context.permissions;
  const canUpdateConfiguredValues = holdsAnyPermission(permissions, ['configuration-values:update']);

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
        uatPreview={uatPreviewEnabled()}
        section={section}
      />
    </StudioSurfaceBoundary>
  );
}
