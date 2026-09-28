import { CapabilityStatus } from '@/components/UnavailableCapability';

export default function CmmsRequestsPage() {
  return (
    <CapabilityStatus
      title="Maintenance request intake is not connected"
      summary="Request intake is contained until authenticated create, review, approval, conversion, and audit endpoints are available."
      blockedActions={['Submitting or approving a maintenance request.', 'Claiming a request was routed or converted to a work order.']}
    />
  );
}

