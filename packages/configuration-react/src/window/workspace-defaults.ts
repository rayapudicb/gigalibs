import { PLATFORM_LOOKUP_BASE_PATH } from '@gigalibs/contracts';
import { useEffect, useState } from 'react';
import type { WorkspaceDefaults } from './window-model.js';

// WI-OI-153 (ADR-0038 §5): what a form needs to know of the workspace for computed defaults — its base currency —
// read once per page from the member-readable workspace profile. Without it (not loaded, no access), a form keeps
// its fixed defaults.

const PROFILE_PATH = `${PLATFORM_LOOKUP_BASE_PATH}/tenants/current/profile`;
let cached: Promise<WorkspaceDefaults> | null = null;

export function loadWorkspaceDefaults(fetchImpl: typeof fetch = fetch): Promise<WorkspaceDefaults> {
  cached ??= fetchImpl(PROFILE_PATH, { cache: 'no-store' })
    .then(async (response) => {
      const body = (await response.json().catch(() => null)) as { defaultCurrency?: unknown } | null;
      return response.ok && typeof body?.defaultCurrency === 'string' ? { defaultCurrency: body.defaultCurrency } : {};
    })
    .catch(() => ({}));
  return cached;
}

/** For tests: forget the profile read on this page. */
export function resetWorkspaceDefaults(): void {
  cached = null;
}

export function useWorkspaceDefaults(): WorkspaceDefaults {
  const [defaults, setDefaults] = useState<WorkspaceDefaults>({});
  useEffect(() => {
    let live = true;
    void loadWorkspaceDefaults().then((loaded) => {
      if (live) setDefaults(loaded);
    });
    return () => {
      live = false;
    };
  }, []);
  return defaults;
}
