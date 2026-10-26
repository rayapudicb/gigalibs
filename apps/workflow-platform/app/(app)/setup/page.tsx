import { SetupWizard } from '@/components/setup/SetupWizard';
import { verifiedSession } from '@/lib/verified-session';
import { redirect } from 'next/navigation';

// WI-OI-120 (T11b): the full set-up wizard route. Company name and enabled-module count come from the signed session;
// the wizard fetches the rest of the signals it needs.
export default async function SetupPage() {
  const session = await verifiedSession(false);
  if (session.response?.status === 401) redirect('/login');
  if (session.response) redirect('/modules');

  const tenant = session.context.tenant;
  if (!tenant) redirect('/select-tenant');

  const enabledModuleCount = tenant.entitlements.filter(
    (entitlement) => entitlement.status === 'ENABLED',
  ).length;

  return (
    <SetupWizard
      companyName={tenant.name}
      companyNamed={tenant.name.trim().length > 0}
      enabledModuleCount={enabledModuleCount}
    />
  );
}
