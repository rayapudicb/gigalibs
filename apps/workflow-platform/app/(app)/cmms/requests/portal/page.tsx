import { CapabilityStatus } from '@/components/UnavailableCapability';

export default function PublicRequestPortalPage() {
  return (
    <CapabilityStatus
      title="Maintenance request portal is not connected"
      summary="The portal is contained because no production request-intake endpoint currently persists and routes these submissions."
      blockedActions={['Submitting contact or maintenance issue data.', 'Claiming dispatch, supervisor receipt, or technician assignment.']}
    />
  );
}

