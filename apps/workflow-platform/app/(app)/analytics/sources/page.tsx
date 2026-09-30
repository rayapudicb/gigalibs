import { Heading, Text } from '@medusajs/ui';
import { SourcesWorkbench } from '@/components/analytics/sources/SourcesWorkbench';
import { analyticsPageAccess } from '@/lib/analytics/page-access';

// WI-OI-104e (ADR-0016 F8): records pulled by Connector Hub, and other sources, become datasets without code.
export default async function AnalyticsSourcesPage() {
  const access = await analyticsPageAccess();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Heading level="h1">Sources</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          Map a source’s fields into a dataset, convert units, and rebuild it on a schedule. Its model then feeds Explore, charts and dashboards.
        </Text>
      </div>
      <SourcesWorkbench
        canMap={access.can('analytics:mappings:write')}
        canModel={access.can('analytics:models:write')}
      />
    </div>
  );
}
