import { PlatformReferenceOperator } from '@/components/platform/PlatformReferenceOperator';
import { verifiedSession } from '@/lib/verified-session';

export default async function PlatformReferenceAdminPage() {
  const session = await verifiedSession(false);
  if (session.response) {
    return <div className="p-10 text-sm text-ui-fg-error">Platform authority could not be verified.</div>;
  }
  if (session.context.platformRoles.length === 0) {
    return (
      <div className="p-10">
        <div className="max-w-xl rounded-2xl border border-ui-border-base bg-ui-bg-subtle p-6">
          <h1 className="text-xl font-semibold text-ui-fg-base">Global platform authority required</h1>
          <p className="mt-3 text-sm leading-6 text-ui-fg-subtle">
            Only platform operators may load reference data versions.
          </p>
        </div>
      </div>
    );
  }
  return <PlatformReferenceOperator />;
}
