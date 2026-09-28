import { CapabilityStatus } from '@/components/UnavailableCapability';

export default function CmmsCalendarPage() {
  return (
    <CapabilityStatus
      title="CMMS workforce calendar is moving to GigaOps Workforce"
      summary="CMMS continues to own maintenance work orders and required skills. Scheduling people against that demand will be provided by the canonical GigaOps Workforce booking service after WI-OI-060 certification."
      availableForTesting={[
        'CMMS maintenance work orders remain separate from workforce identity and booking ownership.',
      ]}
      blockedActions={[
        'Scheduling technicians through the legacy CMMS-local workforce model.',
        'Presenting unpersisted calendar allocations as tenant records.',
      ]}
    />
  );
}
