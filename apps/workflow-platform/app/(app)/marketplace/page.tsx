import { redirect } from 'next/navigation';

// WI-OI-102g (ADR-0016 F6): the Marketplace became the kernel's "Modules & Plan". A tenant's plan and modules come
// from the kernel's entitlements, shown in Settings → Plan; platform operators enable modules in Platform Control.
export default function MarketplacePage(): never {
  redirect('/settings?tab=plan');
}
