import { CapabilityStatus } from '@/components/UnavailableCapability';

export default function CmmsFloorPage() {
  return (
    <CapabilityStatus
      title="Shop-floor kiosk is not connected"
      summary="The kiosk view needs device identity and live meter alerts, which arrive with governed meter-to-work automation (CM-04). Technicians use the work-order screen to execute work."
      availableForTesting={['Work-order execution at /cmms/work-orders.']}
      blockedActions={['Displaying simulated sensor alerts or line status as live facts.']}
    />
  );
}
