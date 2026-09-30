import { Heading } from '@medusajs/ui';
import { redirect } from 'next/navigation';
import { DashboardBuilder } from '@/components/analytics/dashboards/DashboardBuilder';
import { analyticsPageAccess } from '@/lib/analytics/page-access';

// WI-OI-103e: editing a dashboard needs analytics:dashboards:write.
export default async function EditAnalyticsDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await analyticsPageAccess();
  const id = (await params).id;
  if (!access.can('analytics:dashboards:write')) redirect(`/analytics/dashboards/${id}`);
  return (
    <div className="flex flex-col gap-4">
      <Heading level="h1">Edit dashboard</Heading>
      <DashboardBuilder dashboardId={id} />
    </div>
  );
}
