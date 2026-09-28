'use client';

import { useEffect, useState } from 'react';

/** The signed-in user's id from the shell's session endpoint (for example the default worker for labour entries). */
export function useCurrentUserId(): string | null {
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    fetch('/api/auth/context', { cache: 'no-store' })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((session: { user?: { id?: string } } | null) => {
        if (active) setUserId(session?.user?.id ?? null);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  return userId;
}
