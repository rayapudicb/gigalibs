import { redirect } from 'next/navigation';
import { canUseTenantModule, hasPermission } from '@/lib/module-access';
import { verifiedSession } from '@/lib/verified-session';

/** Server-side gate for Analytics pages: a signed-in member of an entitled tenant with analytics:read. */
export async function analyticsPageAccess(): Promise<{ can: (permission: string) => boolean }> {
  const session = await verifiedSession(false);
  if (session.response?.status === 401) redirect('/login');
  if (session.response) redirect('/modules');
  const context = session.context;
  if (!context.tenant) redirect('/select-tenant');
  const features = new Set(context.tenant.features);
  if (!canUseTenantModule('analytics-studio', features, context.permissions) || !hasPermission(context.permissions, 'analytics:read')) {
    redirect('/modules');
  }
  return { can: (permission) => hasPermission(context.permissions, permission) };
}
