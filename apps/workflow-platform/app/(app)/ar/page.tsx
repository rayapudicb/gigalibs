import AccountsReceivableMetadataWorkspace from '@/components/ar/AccountsReceivableMetadataWorkspace';
import { verifiedSession } from '@/lib/verified-session';

export default async function AccountsReceivablePage() {
  const session = await verifiedSession(false);
  return <AccountsReceivableMetadataWorkspace permissions={session.context?.permissions ?? []} />;
}
