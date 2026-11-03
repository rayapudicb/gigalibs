'use client';

import { holdsPermission } from '@gigalibs/contracts';
import { ModuleAnalyticsEmbedded, rolesGranting } from '@gigalibs/analytics-charts/workbench';
import { Text } from '@medusajs/ui';

const REQUIRED_PERMISSIONS = ['cmms.analytics.read', 'analytics:read'] as const;

export function CmmsModuleAnalytics(props: { readonly permissions?: readonly string[] }) {
  const permissions = props.permissions ?? [];
  if (!REQUIRED_PERMISSIONS.every((code) => holdsPermission(permissions, code))) {
    return (
      <Text className="max-w-2xl text-sm text-ui-fg-muted">
        Reliability needs the {rolesGranting('cmms.analytics.read') || 'Maintenance planner'} role and an Analytics role.
        Ask your workspace administrator (Settings › Team &amp; access).
      </Text>
    );
  }

  return (
    <ModuleAnalyticsEmbedded sourceKey="cmms-downtime" className="cmms-module-analytics" />
  );
}
