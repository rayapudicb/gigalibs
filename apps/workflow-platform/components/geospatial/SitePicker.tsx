'use client';

import { requestGeospatial } from '@/lib/geospatial-api';
import type { SpatialNodePageV1 } from '@gigalibs/contracts';
import { useEffect, useState } from 'react';

// Native selects keep FormData and empty options; this matches the Medusa Input field style.
const selectClass =
  'h-8 w-full rounded-md bg-ui-bg-field px-2 txt-compact-small text-ui-fg-base shadow-borders-base outline-none transition-fg hover:bg-ui-bg-field-hover focus-visible:shadow-borders-interactive-with-active';

export interface SiteOption {
  readonly id: string;
  readonly label: string;
}

/**
 * Geospatial places the user can see, for the site picker and for showing site names. CMMS holds only the place
 * id; when places cannot be read (no Maps access) the UI shows ids and the picker is empty.
 */
export function useSites(): { sites: readonly SiteOption[]; siteName: (siteRef: string | null) => string } {
  const [sites, setSites] = useState<readonly SiteOption[]>([]);
  useEffect(() => {
    let active = true;
    requestGeospatial<SpatialNodePageV1>('/nodes?pageSize=200')
      .then((page) => {
        if (active) {
          setSites(page.items.filter((node) => node.status === 'ACTIVE').map((node) => ({ id: node.id, label: `${node.displayName} (${node.code})` })));
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  return {
    sites,
    siteName: (siteRef) => (siteRef ? sites.find((site) => site.id === siteRef)?.label ?? `Place ${siteRef.slice(0, 8)}` : 'No site'),
  };
}

export function SiteSelect({ id, name, defaultValue, sites, label }: { id: string; name: string; defaultValue?: string | null; sites: readonly SiteOption[]; label?: string }) {
  return (
    <select id={id} name={name} defaultValue={defaultValue ?? ''} className={selectClass} aria-label={label}>
      <option value="">No site</option>
      {sites.map((site) => (
        <option key={site.id} value={site.id}>{site.label}</option>
      ))}
    </select>
  );
}
