import { CapabilityStatus } from '@/components/UnavailableCapability';

export default function CmmsWorkloadPage() {
  return (
    <CapabilityStatus
      title="CMMS workforce workload is moving to GigaOps Workforce"
      summary="CMMS will publish maintenance demand and consume tenant-bound GigaOps Workforce bookings. Capacity and utilization will not be calculated from a duplicate CMMS technician model."
      availableForTesting={['The CMMS-to-Workforce ownership boundary and containment state.']}
      blockedActions={[
        'Dispatching or reallocating people through the legacy CMMS-local workforce model.',
        'Displaying sample capacity or utilization as customer facts.',
      ]}
    />
  );
}
