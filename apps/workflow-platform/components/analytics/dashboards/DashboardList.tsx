'use client';

/** WI-OI-103e: the tenant's dashboards. Each one is saved charts plus shared filters; it holds no data. */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Alert, Button, Container, Heading, Table, Text } from '@medusajs/ui';
import type { DashboardSummaryV1 } from '@gigalibs/contracts';
import { analyticsApi } from '../explore/analytics-api';

export function DashboardList({ canEdit }: { canEdit: boolean }) {
  const [dashboards, setDashboards] = useState<DashboardSummaryV1[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    analyticsApi<DashboardSummaryV1[]>('v1/dashboards')
      .then(setDashboards)
      .catch((cause: Error) => {
        setDashboards([]);
        setError(cause.message);
      });
  }, []);

  return (
    <Container className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Heading level="h2">Dashboards</Heading>
        {canEdit ? (
          <Button size="small" asChild>
            <Link href="/analytics/dashboards/new">New dashboard</Link>
          </Button>
        ) : null}
      </div>
      {error ? <Alert variant="error">{error}</Alert> : null}
      {dashboards === null ? (
        <Text size="small" className="text-ui-fg-subtle">Loading…</Text>
      ) : dashboards.length === 0 ? (
        <Text size="small" className="text-ui-fg-subtle">
          No dashboards yet. {canEdit ? 'Save a few charts in Explore, then combine them here with shared filters.' : 'Ask an analyst to build one.'}
        </Text>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Name</Table.HeaderCell>
                <Table.HeaderCell>Charts</Table.HeaderCell>
                <Table.HeaderCell>Updated</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {dashboards.map((dashboard) => (
                <Table.Row key={dashboard.id}>
                  <Table.Cell>
                    <Link href={`/analytics/dashboards/${dashboard.id}`} className="text-ui-fg-interactive hover:underline">
                      {dashboard.name}
                    </Link>
                    {dashboard.description ? (
                      <Text size="xsmall" className="text-ui-fg-subtle">{dashboard.description}</Text>
                    ) : null}
                  </Table.Cell>
                  <Table.Cell className="tabular-nums">{dashboard.tileCount}</Table.Cell>
                  <Table.Cell className="tabular-nums">{new Date(dashboard.updatedAt).toLocaleDateString()}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </div>
      )}
    </Container>
  );
}
