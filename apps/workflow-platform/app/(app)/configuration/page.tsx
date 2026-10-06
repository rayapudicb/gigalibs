import { UniversalDynamicFormsStudio } from '@/components/configuration/UniversalDynamicFormsStudio';
import { verifiedSession } from '@/lib/verified-session';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { holdsAnyPermission } from '@gigalibs/contracts';

export default async function ConfigurationStudioPage() {
  const session = await verifiedSession(false);
  if (session.response?.status === 401) redirect('/login');
  if (session.response) redirect('/modules');
  if (!session.context.tenant) redirect('/select-tenant');

  const canRead = holdsAnyPermission(session.context.permissions, ['configuration:read', 'configuration:draft']);

  if (!canRead) redirect('/modules');

  const cookieStore = await cookies();
  const locale = cookieStore.get('gigalibs_locale')?.value || 'en-US';
  const currency = cookieStore.get('gigalibs_currency')?.value || 'USD';

  return (
    <UniversalDynamicFormsStudio
      currentUserId={session.context.user.id}
      permissions={session.context.permissions}
      tenantId={session.context.tenant.id}
      tenantName={session.context.tenant.name}
      locale={locale}
      currency={currency}
    />
  );
}
