import { DashboardView } from '@/components/analytics/dashboards/DashboardView';
import { analyticsPageAccess } from '@/lib/analytics/page-access';

// WI-OI-103e: view a dashboard with shared filters; editing needs analytics:dashboards:write.
export default async function AnalyticsDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await analyticsPageAccess();
  const id = (await params).id;
  return <DashboardView dashboardId={id} canEdit={access.can('analytics:dashboards:write')} />;
}
