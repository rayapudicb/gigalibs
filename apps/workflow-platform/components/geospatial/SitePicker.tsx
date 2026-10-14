'use client';

import { useAuthContext } from '@/components/auth/use-auth-context';
import { type PlacesAccessContext, canReadPlaces } from '@/lib/geospatial-access';
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
export function useSites(): { sites: readonly SiteOption[]; siteName: (siteRef: string | null) => string; available: boolean | null } {
  return useSitesFor(useAuthContext());
}

/**
 * WI-OI-120ao: places for a screen that already holds the session. They are asked for only when the user may read
 * them (`canReadPlaces`, the proxy's own rule), so a workspace without Geospatial Studio is never refused. `available`
 * is null while the session is unknown, false when places cannot be read here.
 */
export function useSitesFor(context: PlacesAccessContext | null | undefined): {
  sites: readonly SiteOption[];
  siteName: (siteRef: string | null) => string;
  available: boolean | null;
} {
  const available = context === undefined ? null : canReadPlaces(context);
  const [sites, setSites] = useState<readonly SiteOption[]>([]);
  useEffect(() => {
    if (!available) return;
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
  }, [available]);
  const shown = available ? sites : [];
  return {
    sites: shown,
    siteName: (siteRef) => (siteRef ? shown.find((site) => site.id === siteRef)?.label ?? `Place ${siteRef.slice(0, 8)}` : 'No site'),
    available,
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
