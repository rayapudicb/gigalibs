import { ConfigurationStudioWorkbench } from '@/components/configuration/ConfigurationStudioWorkbench';
import { verifiedSession } from '@/lib/verified-session';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { holdsAnyPermission } from '@gigalibs/contracts';

export default async function StudioConfigurationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await verifiedSession(false);
  if (session.response?.status === 401) redirect('/login');
  if (session.response) redirect('/modules');
  if (!session.context.tenant) redirect('/select-tenant');

  const canUseStudioMode = holdsAnyPermission(session.context.permissions, ['configuration:draft', 'configuration:read']);

  if (!canUseStudioMode) redirect('/modules');

  const params = await searchParams;
  const initialRegistrationKey =
    typeof params.surface === 'string' ? params.surface : undefined;
  const initialTemplateId =
    typeof params.template === 'string' ? params.template : undefined;
  const returnTo = typeof params.returnTo === 'string' ? params.returnTo : '/configuration';

  const cookieStore = await cookies();
  const locale = cookieStore.get('gigalibs_locale')?.value || 'en-US';
  const currency = cookieStore.get('gigalibs_currency')?.value || 'USD';

  return (
    <ConfigurationStudioWorkbench
      currentUserId={session.context.user.id}
      permissions={session.context.permissions}
      tenantId={session.context.tenant.id}
      tenantName={session.context.tenant.name}
      locale={locale}
      currency={currency}
      initialRegistrationKey={initialRegistrationKey}
      initialTemplateId={initialTemplateId}
      returnTo={returnTo}
    />
  );
}
