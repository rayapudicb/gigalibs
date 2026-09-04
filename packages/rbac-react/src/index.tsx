/**
 * @gigalibs/rbac-react
 *
 * Declarative RBAC React components: <Can>, <RoleGate>, and usePermission() hook.
 *
 * @module
 */

import * as React from 'react';
import { PermissionEvaluator } from '@gigalibs/rbac-core';

export interface RbacContextType {
  roles: string[];
  permissions: string[];
  hasPermission: (permission: string) => boolean;
  hasRole: (role: string) => boolean;
}

const RbacContext = React.createContext<RbacContextType>({
  roles: [],
  permissions: [],
  hasPermission: () => false,
  hasRole: () => false,
});

export const RbacProvider: React.FC<{
  roles?: string[];
  permissions?: string[];
  children: React.ReactNode;
}> = ({ roles = [], permissions = [], children }) => {
  const hasPermission = React.useCallback(
    (permission: string) => PermissionEvaluator.hasPermission(permissions, permission),
    [permissions],
  );

  const hasRole = React.useCallback((role: string) => roles.includes(role), [roles]);

  return (
    <RbacContext.Provider value={{ roles, permissions, hasPermission, hasRole }}>
      {children}
    </RbacContext.Provider>
  );
};

export const usePermission = (permission: string): boolean => {
  const { hasPermission } = React.useContext(RbacContext);
  return hasPermission(permission);
};

export const Can: React.FC<{
  permission: string;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}> = ({ permission, fallback = null, children }) => {
  const isAllowed = usePermission(permission);
  if (!isAllowed) return <>{fallback}</>;
  return <>{children}</>;
};
