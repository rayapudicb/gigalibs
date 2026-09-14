import React from 'react';
import { CommunicationsWorkbench } from '@/components/communications/CommunicationsWorkbench';
import { verifiedSession } from '@/lib/verified-session';

export default async function CommunicationsPage() {
  const session = await verifiedSession(false);
  if (session.response) {
    return (
      <main className="p-8" role="alert">
        Communications Hub requires an active authenticated session.
      </main>
    );
  }

  return (
    <CommunicationsWorkbench
      currentUserId={session.context.user.id}
      currentUserEmail={session.context.user.email}
      currentUserName={session.context.user.name ?? undefined}
      tenantId={session.context.tenant?.id ?? 'default'}
      tenantName={session.context.tenant?.name ?? 'Current Workspace'}
      permissions={session.context.permissions}
    />
  );
}
