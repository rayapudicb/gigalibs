'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { label: 'Nexus Jurisdictions', href: '/tax' },
  { label: 'Rate Rules Matrix', href: '/tax/rates' },
  { label: 'Exemption Certificates', href: '/tax/exemptions' },
  { label: 'Calculation Audit Ledger', href: '/tax/audit' },
  { label: 'Threshold Monitor', href: '/tax/monitor' },
];

export function TaxNav() {
  const pathname = usePathname();

  return (
    <div className="flex border-b border-ui-border-base gap-1 px-8 pt-2 bg-ui-bg-base">
      {TABS.map((tab) => {
        const isActive = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={clsx(
              'px-4 py-3 text-xs font-medium border-b-2 transition-colors -mb-px',
              isActive
                ? 'border-ui-fg-base text-ui-fg-base font-semibold'
                : 'border-transparent text-ui-fg-muted hover:text-ui-fg-base hover:border-ui-border-base',
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
