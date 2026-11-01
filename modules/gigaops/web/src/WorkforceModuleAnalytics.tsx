'use client';

import { holdsPermission } from '@gigalibs/contracts';
import { ModuleAnalyticsEmbedded } from '@gigalibs/analytics-charts/workbench';

const REQUIRED_PERMISSIONS = ['workforce.positions.read', 'analytics:read'] as const;

export function WorkforceModuleAnalytics(props: { readonly permissions?: readonly string[] }) {
  const permissions = props.permissions ?? [];
  if (!REQUIRED_PERMISSIONS.every((code) => holdsPermission(permissions, code))) {
    return (
      <div className="p-8 max-w-2xl">
        <h1 className="text-lg font-semibold">Workforce analytics</h1>
        <p className="mt-2 text-sm text-ui-fg-subtle">
          This tab requires workforce positions read access and Analytics read permission.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl">
      <ModuleAnalyticsEmbedded sourceKey="workforce-positions" className="workforce-module-analytics" />
    </div>
  );
}
