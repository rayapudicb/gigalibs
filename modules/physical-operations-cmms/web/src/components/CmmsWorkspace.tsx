'use client';

import type {
  CmmsInventorySummaryV1,
  CmmsWorkOrderOverviewV1,
  CmmsWorkOrderV1,
} from '@gigalibs/contracts';
import {
  BellAlert,
  CheckCircle,
  Clock,
  ExclamationCircle,
  ShieldCheck,
  Tools,
} from '@medusajs/icons';
import { Badge, Button, Container, Heading, StatusBadge, Table, Text } from '@medusajs/ui';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { type CmmsApiError, cmmsApi } from '../api';
import { CmmsAssets } from './CmmsAssets';
import { CmmsMeters } from './CmmsMeters';
import { CmmsParts } from './CmmsParts';
import { CmmsSchedules } from './CmmsSchedules';
import { CmmsSpaceExplorer } from './CmmsSpaceExplorer';
import { CmmsWindow } from './CmmsWindow';
import { EmptyState, ErrorState, LoadingState, formatDate, formatMoney } from './CmmsShared';
import { CmmsWorkOrders, priorityColor, statusColor } from './CmmsWorkOrders';

export type CmmsSection =
  | 'overview'
  | 'work-orders'
  | 'assets'
  | 'spaces'
  | 'schedules'
  | 'meters'
  | 'inventory'
  | 'requests'
  | 'classifications';

const SECTIONS: ReadonlyArray<{
  key: CmmsSection;
  label: string;
  href: string;
  description: string;
}> = [
  {
    key: 'overview',
    label: 'Overview',
    href: '/cmms',
    description: 'Open work, overdue work and stock position from persisted records.',
  },
  {
    key: 'work-orders',
    label: 'Work orders',
    href: '/cmms/work-orders',
    description: 'Raise, execute and complete maintenance work with evidence.',
  },
  {
    key: 'assets',
    label: 'Assets',
    href: '/cmms/assets',
    description: 'The asset register, placed at Geospatial sites.',
  },
  {
    key: 'spaces',
    label: 'Spatial topology',
    href: '/cmms/spaces',
    description: 'CAFM spatial hierarchy (Sites, Buildings, Floors, Rooms) with CAD/BIM containment.',
  },
  {
    key: 'schedules',
    label: 'Preventive maintenance',
    href: '/cmms/schedules',
    description: 'Recurring maintenance that generates work orders.',
  },
  {
    key: 'meters',
    label: 'Meters',
    href: '/cmms/meters',
    description: 'Asset meters and their recorded readings.',
  },
  {
    key: 'inventory',
    label: 'Parts & stock',
    href: '/cmms/inventory',
    description: 'Spare parts and the stock ledger.',
  },
  // WI-OI-120t windows, drawn here since 2026-10-13 (their pages had no section).
  {
    key: 'requests',
    label: 'Requests',
    href: '/cmms/requests',
    description: 'Intake, track and triage maintenance requests.',
  },
  {
    key: 'classifications',
    label: 'Classifications',
    href: '/cmms/classifications',
    description: 'Engineering taxonomies and specification schemas for equipment classes.',
  },
];

/**
 * Asset & Maintenance core (WI-OI-038): every figure is read from the tenant's CMMS records. Window sections get the
 * signed-in user's permissions for the windows' deny-by-default rules (the server still decides).
 */
export function CmmsWorkspace({ section, permissions = [] }: { section: CmmsSection; permissions?: readonly string[] }) {
  const meta = SECTIONS.find((item) => item.key === section)!;
  return (
    <section
      className="min-h-full bg-ui-bg-subtle px-[5px] py-5 text-ui-fg-base"
      aria-labelledby="cmms-title"
    >
      <div className="mx-auto w-full max-w-[1800px] space-y-5">
        <Container className="p-3">
          <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Maintenance sections">
            {SECTIONS.map((item) => (
              <Button
                key={item.key}
                asChild
                size="small"
                variant={item.key === section ? 'primary' : 'secondary'}
                className="whitespace-nowrap"
              >
                <Link href={item.href} aria-current={item.key === section ? 'page' : undefined}>
                  {item.label}
                </Link>
              </Button>
            ))}
          </nav>
        </Container>
        {section === 'overview' ? <Overview /> : null}
        {section === 'work-orders' ? <CmmsWorkOrders /> : null}
        {section === 'assets' ? <CmmsAssets /> : null}
        {section === 'spaces' ? <CmmsSpaceExplorer /> : null}
        {section === 'schedules' ? <CmmsSchedules /> : null}
        {section === 'meters' ? <CmmsMeters /> : null}
        {section === 'inventory' ? <CmmsParts /> : null}
        {section === 'requests' ? <CmmsWindow surface="cmms-requests" permissions={permissions} /> : null}
        {section === 'classifications' ? <CmmsWindow surface="cmms-classifications" permissions={permissions} /> : null}
      </div>
    </section>
  );
}

function Overview() {
  const [overview, setOverview] = useState<CmmsWorkOrderOverviewV1 | null>(null);
  const [inventory, setInventory] = useState<CmmsInventorySummaryV1 | null>(null);
  const [urgent, setUrgent] = useState<readonly CmmsWorkOrderV1[]>([]);
  const [error, setError] = useState<CmmsApiError | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [workOrders, stock, queue] = await Promise.all([
        cmmsApi.overview(),
        cmmsApi.inventory(),
        cmmsApi.searchWorkOrders({ openOnly: true, pageSize: 8 }),
      ]);
      setOverview(workOrders);
      setInventory(stock);
      setUrgent(queue.items);
    } catch (reason) {
      setError(reason as CmmsApiError);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <LoadingState />;
  if (error || !overview || !inventory)
    return (
      <ErrorState
        error={error ?? (new Error('No data') as CmmsApiError)}
        retry={() => void load()}
      />
    );

  const cards = [
    { label: 'Open', value: overview.openCount, icon: Tools },
    { label: 'In progress', value: overview.inProgressCount, icon: Clock },
    { label: 'Overdue', value: overview.overdueCount, icon: ExclamationCircle },
    { label: 'Active emergencies', value: overview.activeEmergencies, icon: BellAlert },
    { label: 'Completed (30 days)', value: overview.completedLast30Days, icon: CheckCircle },
  ];
  const nothingYet =
    overview.openCount +
      overview.inProgressCount +
      overview.onHoldCount +
      overview.completedLast30Days ===
    0;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map(({ label, value, icon: Icon }) => (
          <Container key={label} className="p-5">
            <Icon className="text-ui-fg-subtle" />
            <p className="mt-4 text-3xl font-semibold tabular-nums text-ui-fg-base">{value}</p>
            <Text size="small" className="mt-1 text-ui-fg-subtle">
              {label}
            </Text>
          </Container>
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Container className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Heading level="h2">Open work</Heading>
            <Button asChild size="small" variant="secondary">
              <Link href="/cmms/work-orders">All work orders</Link>
            </Button>
          </div>
          {nothingYet && urgent.length === 0 ? (
            <EmptyState
              title="No maintenance work yet"
              text="Register assets at their sites, then raise work orders or set up preventive maintenance."
              action={
                <Button asChild size="small">
                  <Link href="/cmms/assets">Register assets</Link>
                </Button>
              }
            />
          ) : urgent.length === 0 ? (
            <EmptyState title="No open work" text="Every work order is completed or cancelled." />
          ) : (
            <div className="mt-4 overflow-x-auto">
              <Table>
                <Table.Header>
                  <Table.Row>
                    <Table.HeaderCell>Work order</Table.HeaderCell>
                    <Table.HeaderCell>Priority</Table.HeaderCell>
                    <Table.HeaderCell>Status</Table.HeaderCell>
                    <Table.HeaderCell>Due</Table.HeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {urgent.map((workOrder) => (
                    <Table.Row key={workOrder.id}>
                      <Table.Cell className="py-2">
                        <span className="block txt-compact-small-plus">{workOrder.title}</span>
                        <span className="font-mono text-xs text-ui-fg-subtle">
                          {workOrder.woNumber}
                          {workOrder.assetName ? ` · ${workOrder.assetName}` : ''}
                        </span>
                      </Table.Cell>
                      <Table.Cell>
                        <StatusBadge color={priorityColor[workOrder.priority]}>
                          {workOrder.priority}
                        </StatusBadge>
                      </Table.Cell>
                      <Table.Cell>
                        <StatusBadge color={statusColor[workOrder.status]}>
                          {workOrder.status.replace('_', ' ')}
                        </StatusBadge>
                      </Table.Cell>
                      <Table.Cell>{formatDate(workOrder.dueAt)}</Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table>
            </div>
          )}
        </Container>
        <Container className="p-5">
          <Heading level="h2">Stock position</Heading>
          <dl className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <dt className="txt-compact-xsmall text-ui-fg-subtle">Parts</dt>
              <dd className="text-xl font-semibold tabular-nums">{inventory.totalParts}</dd>
            </div>
            <div>
              <dt className="txt-compact-xsmall text-ui-fg-subtle">At or below reorder</dt>
              <dd className="text-xl font-semibold tabular-nums">{inventory.lowStockCount}</dd>
            </div>
          </dl>
          <Text size="small" weight="plus" className="mt-5">
            Valuation (standard cost)
          </Text>
          {inventory.valuation.length === 0 ? (
            <Text size="small" className="mt-1 text-ui-fg-subtle">
              No costed stock on hand.
            </Text>
          ) : (
            <ul className="mt-2 space-y-1">
              {inventory.valuation.map((total) => (
                <li key={total.currencyCode} className="flex justify-between txt-compact-small">
                  <span className="text-ui-fg-subtle">{total.currencyCode}</span>
                  <span className="tabular-nums">
                    {formatMoney(total.amount, total.currencyCode)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {inventory.unvaluedParts > 0 ? (
            <Text size="xsmall" className="mt-2 text-ui-fg-subtle">
              {inventory.unvaluedParts} part(s) have no unit cost and are not valued.
            </Text>
          ) : null}
          <Text size="xsmall" className="mt-5 text-ui-fg-subtle">
            Average cycle time (90 days):{' '}
            {overview.averageCycleHours === null
              ? 'no completed work yet'
              : `${overview.averageCycleHours} h`}{' '}
            · Read at {formatDate(overview.generatedAt)}
          </Text>
        </Container>
      </div>
    </div>
  );
}
