import { ConfigurationStudioWorkbench } from '@/components/configuration/ConfigurationStudioWorkbench';
import { verifiedSession } from '@/lib/verified-session';

export default async function ConfigurationStudioPage() {
  const session = await verifiedSession(false);
  if (session.response) {
    return <main className="p-8" role="alert">Configuration Studio requires an active tenant session.</main>;
  }

  return (
    <ConfigurationStudioWorkbench
      currentUserId={session.context.user.id}
      permissions={session.context.permissions}
      tenantId={session.context.tenant?.id ?? ''}
      tenantName={session.context.tenant?.name ?? 'Current workspace'}
      {/* TODO: wire locale + currency from tenant profile once multi-currency
          module exposes them via session context */}
    />
  );
}
