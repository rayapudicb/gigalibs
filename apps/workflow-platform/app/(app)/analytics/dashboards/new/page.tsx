import { Heading } from '@medusajs/ui';
import { redirect } from 'next/navigation';
import { DashboardBuilder } from '@/components/analytics/dashboards/DashboardBuilder';
import { analyticsPageAccess } from '@/lib/analytics/page-access';

// WI-OI-103e: building a dashboard needs analytics:dashboards:write.
export default async function NewAnalyticsDashboardPage() {
  const access = await analyticsPageAccess();
  if (!access.can('analytics:dashboards:write')) redirect('/analytics/dashboards');
  return (
    <div className="flex flex-col gap-4">
      <Heading level="h1">New dashboard</Heading>
      <DashboardBuilder />
    </div>
  );
}
