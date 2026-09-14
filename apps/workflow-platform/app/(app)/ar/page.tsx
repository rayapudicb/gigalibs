import AccountsReceivableWorkbench from '@/components/ar/AccountsReceivableWorkbench';
import { StudioSurfaceBoundary } from '@/components/configuration/StudioMode';

export default function AccountsReceivablePage() {
  return (
    <StudioSurfaceBoundary
      registrationKey="ar-customer-record"
      moduleLabel="Accounts Receivable"
      screenLabel="Customer Records"
    >
      <AccountsReceivableWorkbench />
    </StudioSurfaceBoundary>
  );
}
