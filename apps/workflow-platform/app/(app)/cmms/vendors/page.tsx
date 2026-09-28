import { CapabilityStatus } from '@/components/UnavailableCapability';

export default function CmmsVendorsPage() {
  return (
    <CapabilityStatus
      title="CMMS vendors are not connected"
      summary="The supplier screen is contained until a tenant-scoped vendor service and authoritative rating provenance are implemented."
      blockedActions={['Creating supplier records from this screen.', 'Showing inferred vendor ratings or default commercial rates.']}
    />
  );
}

