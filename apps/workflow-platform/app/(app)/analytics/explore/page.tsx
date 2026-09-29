import { Heading, Text } from '@medusajs/ui';
import { ExploreWorkbench } from '../../../../components/analytics/explore/ExploreWorkbench';

// WI-OI-103d: ask questions of a semantic model and see them as any chart that fits; charts store questions, not data.
export default function AnalyticsExplorePage() {
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
