'use client';

import { holdsPermission } from '@gigalibs/contracts';
import { ModuleAnalyticsEmbedded, rolesGranting } from '@gigalibs/analytics-charts/workbench';

const REQUIRED_PERMISSIONS = ['workforce.positions.read', 'analytics:read'] as const;

export function WorkforceModuleAnalytics(props: { readonly permissions?: readonly string[] }) {
  const permissions = props.permissions ?? [];
  if (!REQUIRED_PERMISSIONS.every((code) => holdsPermission(permissions, code))) {
    return (
      <p className="max-w-2xl text-sm text-ui-fg-subtle">
        Workforce trends need the {rolesGranting('workforce.positions.read') || 'Workforce supervisor'} role and an
        Analytics role. Ask your workspace administrator.
      </p>
    );
  }

  return (
    <ModuleAnalyticsEmbedded sourceKey="workforce-positions" className="workforce-module-analytics" />
  );
}
