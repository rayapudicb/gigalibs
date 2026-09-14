import PlatformTenantControl from '@/components/platform/PlatformTenantControl';
import { verifiedSession } from '@/lib/verified-session';

export default async function PlatformAdminPage() {
  const session = await verifiedSession(false);
  if (session.response) {
    return (
      <div className="p-10 text-sm text-red-700">Platform authority could not be verified.</div>
    );
  }
  if (session.context.platformRoles.length === 0) {
    return (
      <div className="p-10">
        <div className="max-w-xl rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <h1 className="text-xl font-semibold text-amber-950">
            Global platform authority required
          </h1>
          <p className="mt-3 text-sm leading-6 text-amber-900">
            Tenant roles, including the legacy SUPER_ADMIN membership role, do not grant access to
            cross-tenant administration. An operator must assign PLATFORM_OWNER, PLATFORM_ADMIN, or
            PLATFORM_AUDITOR authority in the canonical control plane.
          </p>
        </div>
      </div>
    );
  }
  return <PlatformTenantControl session={session.context} />;
}
