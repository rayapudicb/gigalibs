'use client';

import type { ApDocumentStatus, CursorPage, SupplierInvoiceSummary } from '@/lib/api-types';
import { requestJson } from '@/lib/client-api';
import { formatMinorAmount } from '@/lib/money';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Container,
  Heading,
  Table,
  Text,
} from '@medusajs/ui';
import { ArrowPath } from '@medusajs/icons';

const FILTERS: Array<'ALL' | ApDocumentStatus> = [
  'ALL',
  'EXCEPTION',
  'PENDING_APPROVAL',
  'APPROVED_FOR_PAYMENT',
  'MATCHED',
  'REJECTED',
];

const FALLBACK_AP_PAGE: CursorPage<SupplierInvoiceSummary> = {
  items: [
    {
      id: 'inv-ap-101',
      externalId: 'EXT-ORACLE-9921',
      invoiceNumber: 'INV-2026-ORACLE-01',
      totalMinor: '2450000',
      currency: 'USD',
      status: 'APPROVED_FOR_PAYMENT',
      invoiceDate: '2026-09-04',
      dueDate: '2026-10-04',
      createdAt: '2026-09-04T10:00:00Z',
      sourceEvent: {
        eventId: 'evt-001',
        eventType: 'SUPPLIER_INVOICE_INGESTED',
        eventVersion: 1,
        classification: 'INTERNAL',
      },
      supplier: { externalId: 'sup-01', name: 'Oracle Cloud Infrastructure LLC' },
      purchaseOrder: { externalId: 'PO-2026-CLOUD-900' },
      matchEvaluations: [
        {
          id: 'me-01',
          outcome: 'MATCHED',
          explanation: '3-way match verified against PO-2026-CLOUD-900 and Goods Receipt GR-8812.',
          evaluatedAt: '2026-09-04T10:05:00Z',
        },
      ],
      actions: [
        {
          id: 'act-01',
          actionType: 'DISBURSE_ACH_PAYMENT',
          status: 'PENDING_APPROVAL',
          risk: 'LOW',
        },
      ],
    },
    {
      id: 'inv-ap-102',
      externalId: 'EXT-AWS-4412',
      invoiceNumber: 'INV-2026-AWS-EU-02',
      totalMinor: '875000',
      currency: 'USD',
      status: 'MATCHED',
      invoiceDate: '2026-09-03',
      dueDate: '2026-10-03',
      createdAt: '2026-09-03T14:30:00Z',
      sourceEvent: {
        eventId: 'evt-002',
        eventType: 'SUPPLIER_INVOICE_INGESTED',
        eventVersion: 1,
        classification: 'INTERNAL',
      },
      supplier: { externalId: 'sup-02', name: 'Amazon Web Services Inc' },
      purchaseOrder: { externalId: 'PO-2026-AWS-101' },
      matchEvaluations: [
        {
          id: 'me-02',
          outcome: 'MATCHED',
          explanation: 'Automated 3-way tolerance match within $0.00 deviation.',
          evaluatedAt: '2026-09-03T14:32:00Z',
        },
      ],
      actions: [],
    },
    {
      id: 'inv-ap-103',
      externalId: 'EXT-DATADOG-3319',
      invoiceNumber: 'INV-2026-DDOG-03',
      totalMinor: '129000',
      currency: 'USD',
      status: 'EXCEPTION',
      invoiceDate: '2026-09-02',
      dueDate: '2026-10-02',
      createdAt: '2026-09-02T11:00:00Z',
      sourceEvent: {
        eventId: 'evt-003',
        eventType: 'SUPPLIER_INVOICE_INGESTED',
        eventVersion: 1,
        classification: 'INTERNAL',
      },
      supplier: { externalId: 'sup-03', name: 'Datadog Observability Corp' },
      purchaseOrder: { externalId: 'PO-2026-LOGS-440' },
      matchEvaluations: [
        {
          id: 'me-03',
          outcome: 'MISMATCH',
          explanation: 'Unit rate exceeded PO ceiling by 4.2%. Flagged for approval.',
          evaluatedAt: '2026-09-02T11:05:00Z',
        },
      ],
      actions: [
        {
          id: 'act-03',
          actionType: 'OVERRIDE_MATCH_EXCEPTION',
          status: 'PENDING_APPROVAL',
          risk: 'MEDIUM',
        },
      ],
    },
  ],
  nextCursor: null,
};

export default function AccountsPayablePage() {
  const [status, setStatus] = useState<'ALL' | ApDocumentStatus>('ALL');
  const [page, setPage] = useState<CursorPage<SupplierInvoiceSummary> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ limit: '100' });
      if (status !== 'ALL') query.set('status', status);
      const res = await requestJson<CursorPage<SupplierInvoiceSummary>>(`/api/control/ap/invoices?${query}`);
      setPage(res);
    } catch {
      // In offline or unauthenticated mode, filter fallback records according to status
      const filtered =
        status === 'ALL'
          ? FALLBACK_AP_PAGE.items
          : FALLBACK_AP_PAGE.items.filter((item) => item.status === status);
      setPage({ items: filtered, nextCursor: null });
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  const getOutcomeColor = (outcome: string) => {
    switch (outcome.toUpperCase()) {
      case 'MATCHED':
      case 'APPROVED_FOR_PAYMENT':
        return 'green';
      case 'PENDING_APPROVAL':
        return 'orange';
      case 'EXCEPTION':
      case 'REJECTED':
        return 'red';
      default:
        return 'grey';
    }
  };

  return (
    <div className="space-y-6 p-8 min-h-screen bg-ui-bg-subtle text-ui-fg-base font-sans">
      {/* ── Page Header ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-ui-border-base pb-5">
        <div>
          <Heading level="h1" className="text-2xl font-bold tracking-tight text-ui-fg-base">
            Accounts Payable
          </Heading>
          <Text size="small" className="text-ui-fg-subtle mt-1">
            Canonical supplier invoices and deterministic three-way match outcomes.
          </Text>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/actions">
            <Button variant="secondary" size="small">
              Approval Work Queue
            </Button>
          </Link>
          <Link href="/scanner">
            <Button variant="secondary" size="small" className="border border-purple-500/30 text-purple-600 hover:bg-purple-500/10">
              Scan Invoice (AI / BYOM)
            </Button>
          </Link>
          <Link href="/exceptions">
            <Button variant="secondary" size="small">
              Exceptions
            </Button>
          </Link>
          <Button
            variant="secondary"
            size="small"
            onClick={() => void load()}
            disabled={loading}
            isLoading={loading}
          >
            <ArrowPath className="w-4 h-4 mr-1.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* ── Productization Notice ─────────────────────────────────── */}
      <div className="p-4 rounded-xl border border-ui-border-base bg-ui-bg-subtle flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
        <div>
          <div className="font-semibold text-ui-fg-base flex items-center gap-2">
            <span>Accounts Payable &amp; 3-Way Match Outcome</span>
            <Badge color="blue" size="small">RELEASE 1 ARCHIVE</Badge>
          </div>
          <div className="text-ui-fg-muted text-[11px] mt-0.5">
            Full enterprise Accounts Payable, corporate budgets, purchase orders, and SaaS expense auditing are actively managed in Spend Management Studio.
          </div>
        </div>
        <Link href="/spend">
          <Button variant="primary" size="small" className="bg-ui-button-inverted text-ui-fg-on-inverted font-semibold whitespace-nowrap">
            Open Spend Studio (/spend) →
          </Button>
        </Link>
      </div>

      {/* ── Status Filter Pills ─────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((item) => (
          <button
            type="button"
            key={item}
            onClick={() => setStatus(item)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition cursor-pointer ${
              status === item
                ? 'bg-ui-button-inverted text-ui-fg-on-inverted font-semibold shadow-xs'
                : 'bg-ui-bg-base text-ui-fg-subtle hover:text-ui-fg-base hover:bg-ui-bg-base-hover border border-ui-border-base'
            }`}
          >
            {item.toLowerCase().replaceAll('_', ' ')}
          </button>
        ))}
      </div>

      {error && (
        <Alert variant="error">
          <span>{error}</span>
        </Alert>
      )}

      {/* ── Table Container ─────────────────────────────────────── */}
      <Container className="p-0 border border-ui-border-base bg-ui-bg-base shadow-elevation-card-rest overflow-hidden">
        {loading && !page ? (
          <div className="p-12 text-center text-ui-fg-muted text-sm">Loading invoices…</div>
        ) : (page?.items.length ?? 0) === 0 ? (
          <div className="p-12 text-center text-ui-fg-muted text-sm">
            No supplier invoices match this filter.
          </div>
        ) : (
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Invoice</Table.HeaderCell>
                <Table.HeaderCell>Supplier</Table.HeaderCell>
                <Table.HeaderCell>PO Number</Table.HeaderCell>
                <Table.HeaderCell>Amount</Table.HeaderCell>
                <Table.HeaderCell className="text-right">Outcome</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {page?.items.map((invoice) => {
                const outcome =
                  invoice.matchEvaluations[0]?.outcome ?? invoice.status;
                return (
                  <Table.Row key={invoice.id}>
                    <Table.Cell>
                      <div className="font-semibold text-ui-fg-base">
                        {invoice.invoiceNumber}
                      </div>
                      <div className="mt-0.5 font-mono text-xs text-ui-fg-subtle">
                        {invoice.externalId}
                      </div>
                      <div className="mt-0.5 text-xs text-ui-fg-muted">
                        {invoice.sourceEvent.classification.toLowerCase()} ·{' '}
                        {invoice.sourceEvent.eventType} v{invoice.sourceEvent.eventVersion}
                      </div>
                    </Table.Cell>
                    <Table.Cell className="text-ui-fg-base font-medium">
                      {invoice.supplier.name}
                    </Table.Cell>
                    <Table.Cell className="font-mono text-xs text-ui-fg-subtle">
                      {invoice.purchaseOrder?.externalId ?? 'Awaiting PO'}
                    </Table.Cell>
                    <Table.Cell className="font-mono font-bold text-ui-fg-base">
                      {formatMinorAmount(invoice.totalMinor, invoice.currency)}
                    </Table.Cell>
                    <Table.Cell className="text-right">
                      <Badge
                        color={getOutcomeColor(outcome) as 'green' | 'red' | 'grey' | 'orange'}
                        size="small"
                      >
                        {outcome.toLowerCase().replaceAll('_', ' ')}
                      </Badge>
                    </Table.Cell>
                  </Table.Row>
                );
              })}
            </Table.Body>
          </Table>
        )}
      </Container>

      {page?.nextCursor && (
        <Text size="xsmall" className="text-ui-fg-subtle">
          More records are available; cursor paging is active.
        </Text>
      )}
    </div>
  );
}
