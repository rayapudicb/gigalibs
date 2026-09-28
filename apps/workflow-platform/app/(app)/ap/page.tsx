'use client';

import type {
  ApDocumentStatus,
  CursorPage,
  MatchFindingSummary,
  SupplierInvoiceDetail,
  SupplierInvoiceSummary,
} from '@/lib/api-types';
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
import { ArrowPath, CheckCircle, ExclamationCircle, InformationCircleSolid } from '@medusajs/icons';

const FILTERS: Array<'ALL' | ApDocumentStatus> = [
  'ALL',
  'EXCEPTION',
  'PENDING_APPROVAL',
  'APPROVED_FOR_PAYMENT',
  'MATCHED',
  'REJECTED',
];

export default function AccountsPayablePage() {
  const [status, setStatus] = useState<'ALL' | ApDocumentStatus>('ALL');
  const [page, setPage] = useState<CursorPage<SupplierInvoiceSummary>>({ items: [], nextCursor: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Inspector state
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [invoiceDetail, setInvoiceDetail] = useState<SupplierInvoiceDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [evalMessage, setEvalMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ limit: '100' });
      if (status !== 'ALL') query.set('status', status);
      const res = await requestJson<CursorPage<SupplierInvoiceSummary>>(`/api/control/ap/invoices?${query}`);
      setPage(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load supplier invoices from Accounts Payable API.');
      setPage({ items: [], nextCursor: null });
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadInvoiceDetail = useCallback(async (invoiceId: string) => {
    setSelectedInvoiceId(invoiceId);
    setLoadingDetail(true);
    setDetailError(null);
    setEvalMessage(null);
    try {
      const res = await requestJson<SupplierInvoiceDetail>(`/api/control/ap/invoices/${invoiceId}`);
      setInvoiceDetail(res);
    } catch (err: unknown) {
      setDetailError(err instanceof Error ? err.message : 'Failed to load invoice details.');
      setInvoiceDetail(null);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  const runEvaluation = async (invoiceId: string) => {
    setEvaluating(true);
    setEvalMessage(null);
    setDetailError(null);
    try {
      const evalResult = await requestJson<{
        id: string;
        outcome: 'MATCHED' | 'MISMATCH' | 'INCOMPLETE';
        explanation: string;
      }>(`/api/control/ap/invoices/${invoiceId}/evaluate`, {
        method: 'POST',
      });
      setEvalMessage(`Evaluation completed: ${evalResult.outcome}. ${evalResult.explanation}`);
      // Refresh both detail and list
      await loadInvoiceDetail(invoiceId);
      await load();
    } catch (err: unknown) {
      setDetailError(err instanceof Error ? err.message : 'Failed to execute 3-way match evaluation.');
    } finally {
      setEvaluating(false);
    }
  };

  const getOutcomeColor = (outcome: string) => {
    switch (outcome.toUpperCase()) {
      case 'MATCHED':
      case 'APPROVED_FOR_PAYMENT':
        return 'green';
      case 'PENDING_APPROVAL':
        return 'orange';
      case 'EXCEPTION':
      case 'REJECTED':
      case 'MISMATCH':
        return 'red';
      default:
        return 'grey';
    }
  };

  const latestEvaluation = invoiceDetail?.matchEvaluations?.[0];

  return (
    <div className="space-y-6 p-8 min-h-screen bg-ui-bg-subtle text-ui-fg-base font-sans">
      {/* ── Action Toolbar ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-ui-border-base pb-3">
        <div className="flex items-center gap-2">
          <Badge color="blue" size="small">Supplier Invoices</Badge>
          <Text size="small" className="text-ui-fg-subtle">
            {page.items.length} Invoices Listed
          </Text>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/spend">
            <Button variant="primary" size="small" className="bg-ui-button-inverted text-ui-fg-on-inverted font-semibold whitespace-nowrap">
              Spend Studio →
            </Button>
          </Link>
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
                <Table.HeaderCell>Outcome</Table.HeaderCell>
                <Table.HeaderCell className="text-right">Action</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {page?.items.map((invoice) => {
                const outcome =
                  invoice.matchEvaluations[0]?.outcome ?? invoice.status;
                const isSelected = selectedInvoiceId === invoice.id;
                return (
                  <Table.Row
                    key={invoice.id}
                    className={`cursor-pointer transition-colors ${isSelected ? 'bg-ui-bg-base-hover' : 'hover:bg-ui-bg-subtle'}`}
                    onClick={() => void loadInvoiceDetail(invoice.id)}
                  >
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
                    <Table.Cell>
                      <Badge
                        color={getOutcomeColor(outcome) as 'green' | 'red' | 'grey' | 'orange'}
                        size="small"
                      >
                        {outcome.toLowerCase().replaceAll('_', ' ')}
                      </Badge>
                    </Table.Cell>
                    <Table.Cell className="text-right">
                      <Button
                        variant="secondary"
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          void loadInvoiceDetail(invoice.id);
                        }}
                      >
                        {isSelected ? 'Inspecting' : 'Inspect'}
                      </Button>
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

      {/* ── Detailed 3-Way Match Inspector Panel ─────────────────── */}
      {selectedInvoiceId && (
        <Container className="p-6 border-2 border-ui-border-interactive bg-ui-bg-base shadow-elevation-card-rest rounded-xl space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-ui-border-base pb-4">
            <div>
              <div className="flex items-center gap-3">
                <Heading level="h2" className="text-xl font-bold text-ui-fg-base">
                  {invoiceDetail ? invoiceDetail.invoiceNumber : 'Loading Invoice…'}
                </Heading>
                {invoiceDetail && (
                  <Badge
                    color={getOutcomeColor(latestEvaluation?.outcome ?? invoiceDetail.status) as 'green' | 'red' | 'grey' | 'orange'}
                    size="small"
                  >
                    {(latestEvaluation?.outcome ?? invoiceDetail.status).toLowerCase().replaceAll('_', ' ')}
                  </Badge>
                )}
                <Badge size="xsmall" color="blue">Deterministic 3-Way Match</Badge>
              </div>
              {invoiceDetail && (
                <Text size="small" className="text-ui-fg-subtle mt-1">
                  Supplier: <span className="font-semibold text-ui-fg-base">{invoiceDetail.supplier.name}</span> ({invoiceDetail.supplier.externalId}) · PO: <span className="font-mono text-ui-fg-base">{invoiceDetail.purchaseOrder?.externalId ?? 'None'}</span>
                </Text>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                size="small"
                onClick={() => void runEvaluation(selectedInvoiceId)}
                disabled={evaluating || loadingDetail}
                isLoading={evaluating}
                className="bg-ui-button-inverted text-ui-fg-on-inverted font-semibold"
              >
                Run 3-Way Match Evaluation
              </Button>
              <Button
                variant="secondary"
                size="small"
                onClick={() => {
                  setSelectedInvoiceId(null);
                  setInvoiceDetail(null);
                  setDetailError(null);
                  setEvalMessage(null);
                }}
              >
                Close Inspector
              </Button>
            </div>
          </div>

          {detailError && (
            <Alert variant="error">
              <span>{detailError}</span>
            </Alert>
          )}

          {evalMessage && (
            <Alert variant="info">
              <span>{evalMessage}</span>
            </Alert>
          )}

          {loadingDetail && !invoiceDetail ? (
            <div className="p-8 text-center text-ui-fg-muted text-sm">Loading invoice verification details…</div>
          ) : invoiceDetail ? (
            <div className="space-y-6">
              {/* Financial & Match Evaluation Summary Card */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-ui-bg-subtle p-4 rounded-lg border border-ui-border-base">
                <div>
                  <Text size="xsmall" className="text-ui-fg-muted uppercase font-semibold">Subtotal</Text>
                  <Text size="base" className="font-mono font-bold text-ui-fg-base mt-0.5">
                    {formatMinorAmount(invoiceDetail.subtotalMinor, invoiceDetail.currency)}
                  </Text>
                </div>
                <div>
                  <Text size="xsmall" className="text-ui-fg-muted uppercase font-semibold">Tax</Text>
                  <Text size="base" className="font-mono font-bold text-ui-fg-base mt-0.5">
                    {formatMinorAmount(invoiceDetail.taxMinor, invoiceDetail.currency)}
                  </Text>
                </div>
                <div>
                  <Text size="xsmall" className="text-ui-fg-muted uppercase font-semibold">Total Invoiced</Text>
                  <Text size="base" className="font-mono font-bold text-ui-fg-base mt-0.5">
                    {formatMinorAmount(invoiceDetail.totalMinor, invoiceDetail.currency)}
                  </Text>
                </div>
                <div>
                  <Text size="xsmall" className="text-ui-fg-muted uppercase font-semibold">Match Status</Text>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    {latestEvaluation?.outcome === 'MATCHED' ? (
                      <CheckCircle className="w-4 h-4 text-ui-fg-interactive" />
                    ) : latestEvaluation?.outcome === 'MISMATCH' ? (
                      <ExclamationCircle className="w-4 h-4 text-ui-fg-error" />
                    ) : (
                      <InformationCircleSolid className="w-4 h-4 text-ui-fg-warning" />
                    )}
                    <span className="font-semibold text-sm">
                      {latestEvaluation?.outcome ?? invoiceDetail.status}
                    </span>
                  </div>
                </div>
              </div>

              {/* Evaluation Findings */}
              {latestEvaluation && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Heading level="h3" className="text-sm font-bold text-ui-fg-base uppercase tracking-wider">
                      Evaluation Findings & Discrepancies
                    </Heading>
                    <Text size="xsmall" className="text-ui-fg-muted">
                      Evaluated at {new Date(latestEvaluation.evaluatedAt).toLocaleString()}
                    </Text>
                  </div>

                  {latestEvaluation.outcome === 'MATCHED' ? (
                    <div className="p-4 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-500/30 rounded-lg text-emerald-800 dark:text-emerald-300 text-sm">
                      ✓ Deterministic 3-Way Match Succeeded. Quantities, prices, and totals strictly align with Purchase Order and Goods Receipts within policy tolerance.
                    </div>
                  ) : (!latestEvaluation.findings || latestEvaluation.findings.length === 0) ? (
                    <div className="p-3 bg-ui-bg-subtle border border-ui-border-base rounded-md text-sm text-ui-fg-subtle">
                      {latestEvaluation.explanation || 'No granular findings reported.'}
                    </div>
                  ) : (
                    <div className="border border-ui-border-base rounded-lg overflow-hidden">
                      <Table>
                        <Table.Header>
                          <Table.Row>
                            <Table.HeaderCell>Code</Table.HeaderCell>
                            <Table.HeaderCell>Severity</Table.HeaderCell>
                            <Table.HeaderCell>Field</Table.HeaderCell>
                            <Table.HeaderCell>Expected</Table.HeaderCell>
                            <Table.HeaderCell>Actual</Table.HeaderCell>
                            <Table.HeaderCell>Delta</Table.HeaderCell>
                            <Table.HeaderCell>Explanation</Table.HeaderCell>
                          </Table.Row>
                        </Table.Header>
                        <Table.Body>
                          {latestEvaluation.findings.map((f: MatchFindingSummary) => (
                            <Table.Row key={f.id || f.code}>
                              <Table.Cell className="font-mono text-xs font-semibold text-ui-fg-base">
                                {f.code}
                              </Table.Cell>
                              <Table.Cell>
                                <Badge
                                  size="xsmall"
                                  color={f.severity === 'BLOCKING' ? 'red' : f.severity === 'WARNING' ? 'orange' : 'grey'}
                                >
                                  {f.severity}
                                </Badge>
                              </Table.Cell>
                              <Table.Cell className="text-xs text-ui-fg-subtle">{f.field}</Table.Cell>
                              <Table.Cell className="font-mono text-xs text-ui-fg-base">{f.expected ?? '—'}</Table.Cell>
                              <Table.Cell className="font-mono text-xs text-ui-fg-base">{f.actual ?? '—'}</Table.Cell>
                              <Table.Cell className="font-mono text-xs text-ui-fg-base">{f.delta ?? '—'}</Table.Cell>
                              <Table.Cell className="text-xs text-ui-fg-subtle">{f.explanation}</Table.Cell>
                            </Table.Row>
                          ))}
                        </Table.Body>
                      </Table>
                    </div>
                  )}
                </div>
              )}

              {/* Line Items Breakdown */}
              <div className="space-y-3">
                <Heading level="h3" className="text-sm font-bold text-ui-fg-base uppercase tracking-wider">
                  Invoice Line Items ({invoiceDetail.lines?.length ?? 0})
                </Heading>
                <div className="border border-ui-border-base rounded-lg overflow-hidden">
                  <Table>
                    <Table.Header>
                      <Table.Row>
                        <Table.HeaderCell>#</Table.HeaderCell>
                        <Table.HeaderCell>PO Line #</Table.HeaderCell>
                        <Table.HeaderCell>Description</Table.HeaderCell>
                        <Table.HeaderCell>Quantity</Table.HeaderCell>
                        <Table.HeaderCell>Unit Price</Table.HeaderCell>
                        <Table.HeaderCell className="text-right">Line Total</Table.HeaderCell>
                      </Table.Row>
                    </Table.Header>
                    <Table.Body>
                      {invoiceDetail.lines?.map((line) => (
                        <Table.Row key={line.id}>
                          <Table.Cell className="text-xs font-mono text-ui-fg-subtle">{line.lineNumber}</Table.Cell>
                          <Table.Cell className="text-xs font-mono text-ui-fg-subtle">
                            {line.purchaseOrderLineNumber ?? '—'}
                          </Table.Cell>
                          <Table.Cell className="text-xs font-medium text-ui-fg-base">{line.description}</Table.Cell>
                          <Table.Cell className="font-mono text-xs text-ui-fg-base">{line.quantity}</Table.Cell>
                          <Table.Cell className="font-mono text-xs text-ui-fg-base">
                            {formatMinorAmount(line.unitPriceMinor, invoiceDetail.currency)}
                          </Table.Cell>
                          <Table.Cell className="font-mono text-xs font-bold text-ui-fg-base text-right">
                            {formatMinorAmount(line.totalMinor, invoiceDetail.currency)}
                          </Table.Cell>
                        </Table.Row>
                      ))}
                    </Table.Body>
                  </Table>
                </div>
              </div>

              {/* Purchase Order & Goods Receipt Traceability */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-ui-bg-subtle border border-ui-border-base rounded-lg space-y-2">
                  <Text size="xsmall" className="text-ui-fg-muted uppercase font-semibold">Purchase Order Verification</Text>
                  {invoiceDetail.purchaseOrder ? (
                    <div className="space-y-1 text-xs">
                      <div><span className="text-ui-fg-subtle">PO Reference:</span> <span className="font-mono font-bold text-ui-fg-base">{invoiceDetail.purchaseOrder.externalId}</span></div>
                      <div><span className="text-ui-fg-subtle">PO Currency:</span> <span className="font-mono text-ui-fg-base">{invoiceDetail.purchaseOrder.currency}</span></div>
                      <div><span className="text-ui-fg-subtle">PO Line Count:</span> <span className="text-ui-fg-base">{invoiceDetail.purchaseOrder.lines?.length ?? 0}</span></div>
                    </div>
                  ) : (
                    <Text size="small" className="text-ui-fg-muted">No associated purchase order recorded.</Text>
                  )}
                </div>

                <div className="p-4 bg-ui-bg-subtle border border-ui-border-base rounded-lg space-y-2">
                  <Text size="xsmall" className="text-ui-fg-muted uppercase font-semibold">Source Event Audit & Provenance</Text>
                  <div className="space-y-1 text-xs font-mono">
                    <div><span className="text-ui-fg-subtle font-sans">Event ID:</span> <span className="text-ui-fg-base">{invoiceDetail.sourceEvent.eventId}</span></div>
                    <div><span className="text-ui-fg-subtle font-sans">Type:</span> <span className="text-ui-fg-base">{invoiceDetail.sourceEvent.eventType} v{invoiceDetail.sourceEvent.eventVersion}</span></div>
                    <div><span className="text-ui-fg-subtle font-sans">Classification:</span> <span className="text-ui-fg-base">{invoiceDetail.sourceEvent.classification}</span></div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </Container>
      )}
    </div>
  );
}
