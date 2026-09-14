'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import type { VerifiedSession } from '../../lib/verified-session';

const denied = {
  tenantSlug: '', userRole: '', permissions: [] as string[], entitledModules: [] as string[],
  hasPermission: (_permission: string) => false,
  isModuleEntitled: (_moduleCode: string) => false,
};
const AuthContext = createContext(denied);

// Display hints only. The server enforces permissions on every operation.
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<VerifiedSession | null>(null);
  useEffect(() => {
    let active = true;
    void fetch('/api/auth/context', { cache: 'no-store' })
      .then(async response => response.ok ? response.json() : null)
      .then(value => { if (active) setSession(value); })
      .catch(() => { if (active) setSession(null); });
    return () => { active = false; };
  }, []);
  const permissions = Array.isArray(session?.permissions) ? session.permissions : [];
  return <AuthContext.Provider value={{
    ...denied,
    tenantSlug: session?.tenant?.slug ?? '',
    userRole: session?.roles?.[0] ?? '',
    permissions,
    hasPermission: permission => permissions.includes(permission),
  }}>{children}</AuthContext.Provider>;
}
export function useAuth() { return useContext(AuthContext); }
export function Can({ do: action, fallback = null, children }: {
  do: string; fallback?: React.ReactNode; children: React.ReactNode;
}) {
  return <>{useAuth().hasPermission(action) ? children : fallback}</>;
}
