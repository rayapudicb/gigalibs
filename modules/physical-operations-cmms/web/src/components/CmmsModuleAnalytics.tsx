'use client';

import { holdsPermission } from '@gigalibs/contracts';
import { ModuleAnalyticsEmbedded } from '@gigalibs/analytics-charts/workbench';
import { Container, Heading, Text } from '@medusajs/ui';

const REQUIRED_PERMISSIONS = ['cmms.analytics.read', 'analytics:read'] as const;

export function CmmsModuleAnalytics(props: { readonly permissions?: readonly string[] }) {
  const permissions = props.permissions ?? [];
  if (!REQUIRED_PERMISSIONS.every((code) => holdsPermission(permissions, code))) {
    return (
      <Container className="p-8 max-w-2xl">
        <Heading level="h1" className="text-lg font-semibold">
          Reliability analytics
        </Heading>
        <Text className="mt-2 text-sm text-ui-fg-muted">
          This tab requires CMMS analytics read access and Analytics read permission. Your administrator can assign these on Settings → Team.
        </Text>
      </Container>
    );
  }

  return (
    <Container className="p-6 max-w-7xl">
      <ModuleAnalyticsEmbedded sourceKey="cmms-downtime" className="cmms-module-analytics" />
    </Container>
  );
}
