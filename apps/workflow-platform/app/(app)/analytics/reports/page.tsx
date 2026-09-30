import { Heading, Text } from '@medusajs/ui';
import { ReportsWorkbench } from '@/components/analytics/reports/ReportsWorkbench';
import { analyticsPageAccess } from '@/lib/analytics/page-access';

// WI-OI-103e (ADR-0016 F11): Analytics owns reports; a report exports a saved chart or a dashboard as CSV.
export default async function AnalyticsReportsPage() {
  const access = await analyticsPageAccess();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Heading level="h1">Reports</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          Export a saved chart or a whole dashboard as CSV. Each run asks the questions again, so the file is always current.
        </Text>
      </div>
      <ReportsWorkbench canWrite={access.can('analytics:reports:write')} canExport={access.can('analytics:export')} />
    </div>
  );
}
