import ExecutiveControlTower from '@/components/dashboard/ExecutiveControlTower';
import { determinePersona } from '@/lib/persona-utils';
import { verifiedSession } from '@/lib/verified-session';
import { redirect } from 'next/navigation';

export default async function DashboardPage() {
  const session = await verifiedSession(false);
  if (session.response?.status === 401) redirect('/login');
  if (session.response) redirect('/modules');

  const persona = determinePersona(session.context.roles, session.context.platformRoles);
  const permitted = new Set([
    'C_LEVEL',
    'TENANT_ADMIN',
    'OPERATIONS_SUPERVISOR',
    'PLATFORM_OPERATOR',
  ]);
  if (!permitted.has(persona)) {
    return (
      <section className="p-8" aria-labelledby="control-tower-denied">
        <h1 id="control-tower-denied" className="text-xl font-semibold text-ui-fg-base">
          Executive Control Tower unavailable
        </h1>
        <p className="mt-2 text-sm text-ui-fg-subtle">
          Your current workspace role does not grant access to executive operational intelligence.
        </p>
      </section>
    );
  }

  return (
    <ExecutiveControlTower
      initialPersona={persona}
      initialDepartment={session.context.orgScope.mode === 'FLAT_TENANT' ? 'ALL' : 'SCOPED'}
    />
  );
}
