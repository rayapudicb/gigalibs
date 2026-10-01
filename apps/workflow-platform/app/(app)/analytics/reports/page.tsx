import { Heading, Text } from '@medusajs/ui';
import { ReportsWorkbench } from '@/components/analytics/reports/ReportsWorkbench';
import { analyticsPageAccess } from '@/lib/analytics/page-access';

// WI-OI-106 (ADR-0016 F17): Analytics owns reports; exports a saved chart or dashboard as CSV, typed Excel or server-rendered PDF.
export default async function AnalyticsReportsPage() {
  const access = await analyticsPageAccess();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Heading level="h1">Reports</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          Export a saved chart or a whole dashboard as CSV, typed Excel or server-rendered PDF. Each run asks the questions again, so the file is always current.
        </Text>
      </div>
      <ReportsWorkbench canWrite={access.can('analytics:reports:write')} canExport={access.can('analytics:export')} />
    </div>
  );
}
