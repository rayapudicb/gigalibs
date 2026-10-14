'use client';

import type { VerifiedSession } from '@/lib/verified-session';
import { useEffect, useState } from 'react';

/**
 * The signed-in session as `/api/auth/context` returns it: undefined while it is being asked, null if it could not be
 * read. For display decisions only; every API still decides for itself.
 */
export function useAuthContext(): VerifiedSession | null | undefined {
  const [context, setContext] = useState<VerifiedSession | null | undefined>(undefined);
  useEffect(() => {
    let active = true;
    void fetch('/api/auth/context', { cache: 'no-store' })
      .then(async (response) => (response.ok ? ((await response.json()) as VerifiedSession) : null))
      .then((value) => {
        if (active) setContext(value);
      })
      .catch(() => {
        if (active) setContext(null);
      });
    return () => {
      active = false;
    };
  }, []);
  return context;
}
