import { Heading, Text } from '@medusajs/ui';
import { redirect } from 'next/navigation';
import { canUseTenantModule, hasPermission } from '@/lib/module-access';
import { verifiedSession } from '@/lib/verified-session';
import { ExploreWorkbench } from '../../../../components/analytics/explore/ExploreWorkbench';

// WI-OI-103d: ask questions of a semantic model and see them as any chart that fits; charts store questions, not data.
// Demo Lab workspaces can also load the labelled sample farm source here (d7).
export default async function AnalyticsExplorePage() {
  const session = await verifiedSession(false);
  if (session.response?.status === 401) redirect('/login');
  if (session.response) redirect('/modules');
  const context = session.context;
  if (!context.tenant) redirect('/select-tenant');
  const features = new Set(context.tenant.features);
  if (!canUseTenantModule('analytics-studio', features, context.permissions) || !hasPermission(context.permissions, 'analytics:read')) {
    redirect('/modules');
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Heading level="h1">Explore</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          Pick measures, group-bys and time; switch chart types in one click; save the question as a chart.
        </Text>
      </div>
      <ExploreWorkbench />
    </div>
  );
}
