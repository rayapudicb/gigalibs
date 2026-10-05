'use client';

import { platformModuleCatalog } from '@gigalibs/contracts';
import { usePathname } from 'next/navigation';
import { mostSpecificActiveModuleKey } from '@/lib/module-access';
import { uatStatusFor } from '@/lib/uat-module-status';

/**
 * Tells UAT testers what the current module's screens can be trusted for (WI-OI-120a). It renders only on the UAT
 * instance and only for a module that is not production-ready or still shows sample figures.
 */
export function UatPreviewBanner({ uatPreview }: { uatPreview: boolean }) {
  const pathname = usePathname();
  if (!uatPreview) return null;
  const key = mostSpecificActiveModuleKey(platformModuleCatalog, pathname);
  const module = key ? platformModuleCatalog.find((entry) => entry.key === key) : undefined;
  if (!module) return null;
  const status = uatStatusFor(module.key, module.readiness);
  if (!status) return null;

  const detail =
    status.status === 'sample-figures'
      ? 'Figures on these screens are hard-coded illustrations, not records in the database. Do not log them as ' +
        'defects; ' +
        `real data arrives with UAT card ${status.card}.`
      : `This module has not been verified for UAT yet (UAT cards ${status.card}). Record what works and what does not.`;

  return (
    <div
      role="status"
      data-uat-preview-banner={module.key}
      className="border-b border-ui-border-base bg-ui-tag-orange-bg px-6 py-2 text-sm text-ui-tag-orange-text print:hidden"
    >
      <span className="font-semibold">UAT preview · {module.navigationLabel}</span>
      <span> is not production-ready (readiness {module.readiness}). </span>
      <span>{detail}</span>
    </div>
  );
}
