import { Heading, Text } from '@medusajs/ui';
import { DashboardList } from '@/components/analytics/dashboards/DashboardList';
import { analyticsPageAccess } from '@/lib/analytics/page-access';

// WI-OI-103e: dashboards of saved charts with shared filters.
export default async function AnalyticsDashboardsPage() {
  const access = await analyticsPageAccess();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Heading level="h1">Dashboards</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          Saved charts side by side, filtered together by date and shared fields such as farm or site.
        </Text>
      </div>
      <DashboardList canEdit={access.can('analytics:dashboards:write')} />
    </div>
  );
}
