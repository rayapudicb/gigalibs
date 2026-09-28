import { CapabilityStatus } from '@/components/UnavailableCapability';

export default function CmmsPurchaseOrdersPage() {
  return (
    <CapabilityStatus
      title="CMMS purchase orders are not connected"
      summary="Procurement actions are contained until an authenticated purchase-order service, approval policy, goods receipt, and reconciliation path are implemented."
      blockedActions={['Creating or approving purchase orders.', 'Claiming inventory replenishment without a persisted goods receipt.']}
    />
  );
}

