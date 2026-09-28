import { CapabilityStatus } from '@/components/UnavailableCapability';

export default function CmmsAnalyticsPage() {
  return (
    <CapabilityStatus
      title="Reliability reporting is not connected yet"
      summary="Mean time between failures, availability and downtime Pareto need attributable downtime and service-restoration records, which arrive with downtime capture (CM-07). The CMMS overview shows open, overdue and completed work and the stock position from persisted records."
      availableForTesting={['Work-order and stock overview at /cmms, derived from persisted CMMS records.']}
      blockedActions={['Presenting reliability, availability or downtime figures that are not measured.']}
    />
  );
}
