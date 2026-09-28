import { PlaceDrilldownExplorer } from '@/components/analytics/PlaceDrilldownExplorer';
import { canUseTenantModule, hasPermission } from '@/lib/module-access';
import { verifiedSession } from '@/lib/verified-session';
import { redirect } from 'next/navigation';

// WI-OI-064f: governed place drill-down; Demo Lab controls appear only in workspaces labelled demo-lab.
export default async function PlaceDrilldownPage() {
  const session = await verifiedSession(false);
  if (session.response?.status === 401) redirect('/login');
  if (session.response) redirect('/modules');
  const context = session.context;
  if (!context.tenant) redirect('/select-tenant');
  const features = new Set(context.tenant.features);
  if (!canUseTenantModule('analytics-studio', features, context.permissions) || !hasPermission(context.permissions, 'analytics:read')) {
    redirect('/modules');
  }
  const demoLab = features.has('demo-lab');
  return (
    <PlaceDrilldownExplorer
      demoLab={demoLab}
      canManageDemo={demoLab && hasPermission(context.permissions, 'analytics:action')}
      canDeleteDemo={demoLab && context.platformRoles.length > 0}
    />
  );
}
