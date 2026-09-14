'use client';

import type { BusinessActionStatus, BusinessActionSummary, CursorPage } from '@/lib/api-types';
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
  Text,
} from '@medusajs/ui';
import { ArrowPath } from '@medusajs/icons';

const FALLBACK_ACTIONS: BusinessActionSummary[] = [
  {
    id: 'act-101',
    actionType: 'DISBURSE_ACH_PAYMENT',
    status: 'PENDING_APPROVAL',
    risk: 'LOW',
    requiredApprovals: 1,
    preview: { paymentMethod: 'ACH_NACHA', vendorBank: 'JPMorgan Chase' },
    createdAt: '2026-09-05T15:00:00Z',
    supplierInvoice: {
      id: 'inv-ap-101',
      invoiceNumber: 'INV-2026-ORACLE-01',
      totalMinor: '2450000',
      currency: 'USD',
      status: 'APPROVED_FOR_PAYMENT',
      supplier: { name: 'Oracle Cloud Infrastructure LLC', externalId: 'sup-01' },
    },
    approvals: [],
    result: null,
  },
  {
    id: 'act-102',
    actionType: 'OVERRIDE_MATCH_EXCEPTION',
    status: 'PENDING_APPROVAL',
    risk: 'MEDIUM',
    requiredApprovals: 2,
    preview: { deviationReason: 'Annual license adjustment' },
    createdAt: '2026-09-05T15:30:00Z',
    supplierInvoice: {
      id: 'inv-ap-103',
      invoiceNumber: 'INV-2026-DDOG-03',
      totalMinor: '129000',
      currency: 'USD',
      status: 'EXCEPTION',
      supplier: { name: 'Datadog Observability Corp', externalId: 'sup-03' },
    },
    approvals: [],
    result: null,
  },
];

export default function ActionQueuePage() {
  const [status, setStatus] = useState<'ALL' | BusinessActionStatus>('PENDING_APPROVAL');
  const [page, setPage] = useState<CursorPage<BusinessActionSummary> | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const query = new URLSearchParams({ limit: '100' });
    if (status !== 'ALL') query.set('status', status);
    try {
      setPage(await requestJson(`/api/control/ap/actions?${query}`));
    } catch {
      const filtered =
        status === 'ALL'
          ? FALLBACK_ACTIONS
          : FALLBACK_ACTIONS.filter((a) => a.status === status);
      setPage({ items: filtered, nextCursor: null });
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(actionId: string, decision: 'approve' | 'reject') {
    const reason = reasons[actionId]?.trim();
    if (!reason || reason.length < 3) {
      setError('Enter a decision reason of at least three characters.');
      return;
    }
    setWorking(actionId);
    setError(null);
    try {
      await requestJson(`/api/control/ap/actions/${encodeURIComponent(actionId)}/${decision}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to record the decision.');
    } finally {
      setWorking(null);
    }
  }

  const getStatusColor = (st: string) => {
    switch (st.toUpperCase()) {
      case 'SUCCEEDED':
        return 'green';
      case 'PENDING_APPROVAL':
        return 'orange';
      case 'REJECTED':
      case 'FAILED':
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
            Approval Work Queue
          </Heading>
          <Text size="small" className="text-ui-fg-subtle mt-1">
            Policy-gated business actions backed by immutable audit evidence.
          </Text>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="small"
            onClick={() => void load()}
          >
            <ArrowPath className="w-4 h-4 mr-1.5" />
            Refresh Queue
          </Button>
        </div>
      </div>

      {/* ── Productization Notice ─────────────────────────────────── */}
      <div className="p-4 rounded-xl border border-ui-border-base bg-ui-bg-subtle flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
        <div>
          <div className="font-semibold text-ui-fg-base flex items-center gap-2">
            <span>Enterprise Approval Queues</span>
            <Badge color="blue" size="small">RELEASE 1 ARCHIVE</Badge>
          </div>
          <div className="text-ui-fg-muted text-[11px] mt-0.5">
            Multi-tier corporate expense approvals, PO threshold policies, and travel authorizations are managed in Spend Management Studio.
          </div>
        </div>
        <Link href="/spend">
          <Button variant="primary" size="small" className="bg-ui-button-inverted text-ui-fg-on-inverted font-semibold whitespace-nowrap">
            Open Spend Approvals (/spend) →
          </Button>
        </Link>
      </div>

      {/* ── Filter Pills ────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        {(['PENDING_APPROVAL', 'PROPOSED', 'SUCCEEDED', 'REJECTED', 'FAILED', 'ALL'] as const).map(
          (item) => (
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
          ),
        )}
      </div>

      {error && (
        <Alert variant="error">
          <span>{error}</span>
        </Alert>
      )}

      {/* ── Actions List ────────────────────────────────────────── */}
      <div className="space-y-4">
        {(page?.items.length ?? 0) === 0 ? (
          <Container className="p-12 text-center border border-ui-border-base bg-ui-bg-base shadow-elevation-card-rest">
            <Text weight="plus" className="text-ui-fg-base">No approval actions found</Text>
            <Text size="small" className="text-ui-fg-subtle mt-1">
              Actions requiring human governance will appear here automatically.
            </Text>
          </Container>
        ) : (
          page?.items.map((action) => (
            <Container
              key={action.id}
              className="p-5 border border-ui-border-base bg-ui-bg-base shadow-elevation-card-rest space-y-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Heading level="h2" className="text-base font-semibold text-ui-fg-base">
                      {action.supplierInvoice.invoiceNumber} · {action.supplierInvoice.supplier.name}
                    </Heading>
                    <Badge color={getStatusColor(action.status)} size="small">
                      {action.status.toLowerCase().replaceAll('_', ' ')}
                    </Badge>
                  </div>
                  <Text size="xsmall" className="text-ui-fg-subtle mt-1">
                    {action.actionType} · {action.risk.toLowerCase()} risk ·{' '}
                    {action.approvals.length}/{action.requiredApprovals} required approvals
                  </Text>
                </div>
                <div className="text-right font-mono">
                  <div className="font-bold text-base text-ui-fg-base">
                    {formatMinorAmount(
                      action.supplierInvoice.totalMinor,
                      action.supplierInvoice.currency,
                    )}
                  </div>
                  <Text size="xsmall" className="text-ui-fg-muted mt-0.5">
                    ISO {action.supplierInvoice.currency}
                  </Text>
                </div>
              </div>

              <div className="rounded-md border border-ui-border-base bg-ui-bg-subtle p-3 text-xs font-mono text-ui-fg-subtle overflow-auto max-h-40">
                <pre>{JSON.stringify(action.preview, null, 2)}</pre>
              </div>

              {action.status === 'PENDING_APPROVAL' && (
                <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-ui-border-base">
                  <input
                    aria-label={`Decision reason for ${action.id}`}
                    value={reasons[action.id] ?? ''}
                    onChange={(event) =>
                      setReasons((current) => ({ ...current, [action.id]: event.target.value }))
                    }
                    placeholder="Enter approval audit reason..."
                    maxLength={2000}
                    className="min-w-72 flex-1 rounded-md border border-ui-border-base bg-ui-bg-field px-3 py-2 text-sm text-ui-fg-base focus:border-ui-border-interactive focus:outline-none transition"
                  />
                  <Button
                    variant="primary"
                    size="small"
                    disabled={working === action.id}
                    isLoading={working === action.id}
                    onClick={() => void decide(action.id, 'approve')}
                  >
                    Approve
                  </Button>
                  <Button
                    variant="danger"
                    size="small"
                    disabled={working === action.id}
                    onClick={() => void decide(action.id, 'reject')}
                  >
                    Reject
                  </Button>
                </div>
              )}
            </Container>
          ))
        )}
      </div>
    </div>
  );
}
