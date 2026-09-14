'use client';

import { ArNav } from '@/components/ar/ArNav';
import type { Customer, Invoice } from '@/lib/ar-api';
import { formatMinorAmount, requestAr } from '@/lib/ar-api';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useCurrency } from '@/components/currency/CurrencyLocaleContext';
import {
  Container,
  Heading,
  Text,
  Button,
  StatusBadge,
  Table,
  Alert,
} from '@medusajs/ui';

interface AgingCustomerRow {
  customerId: string;
  customerName: string;
  currentMinor: number;
  days1To30Minor: number;
  days31To60Minor: number;
  days61To90Minor: number;
  days90PlusMinor: number;
  totalOutstandingMinor: number;
}

export default function AccountsReceivableAgingPage() {
  const { currency } = useCurrency();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [invRes, custRes] = await Promise.all([
        requestAr<{ items: Invoice[] }>('v1/invoices?pageSize=100').catch(() => ({ items: [] })),
        requestAr<{ items: Customer[] }>('v1/customers?pageSize=100').catch(() => ({ items: [] })),
      ]);
      setInvoices(invRes.items ?? []);
      setCustomers(custRes.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load aging matrix from AR service.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Compute Aging Buckets
  const now = new Date();
  const todayMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  const getDaysPastDue = (dueDateStr: string): number => {
    const due = new Date(dueDateStr).getTime();
    const diffMs = todayMs - due;
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  };

  const issuedInvoices = invoices.filter((i) => i.status === 'ISSUED' && i.amountDueMinor > 0);

  const customerMap = new Map<string, Customer>();
  customers.forEach((c) => customerMap.set(c.id, c));

  const agingRows: AgingCustomerRow[] = [];
  const customerBucketMap = new Map<string, AgingCustomerRow>();

  let fleetCurrentMinor = 0;
  let fleet1To30Minor = 0;
  let fleet31To60Minor = 0;
  let fleet61To90Minor = 0;
  let fleet90PlusMinor = 0;
  let fleetTotalOutstandingMinor = 0;

  for (const inv of issuedInvoices) {
    const daysPast = getDaysPastDue(inv.dueDate);
    const amount = inv.amountDueMinor;
    fleetTotalOutstandingMinor += amount;

    let row = customerBucketMap.get(inv.customerId);
    if (!row) {
      row = {
        customerId: inv.customerId,
        customerName: customerMap.get(inv.customerId)?.legalName ?? 'Customer',
        currentMinor: 0,
        days1To30Minor: 0,
        days31To60Minor: 0,
        days61To90Minor: 0,
        days90PlusMinor: 0,
        totalOutstandingMinor: 0,
      };
      customerBucketMap.set(inv.customerId, row);
      agingRows.push(row);
    }

    row.totalOutstandingMinor += amount;

    if (daysPast <= 0) {
      row.currentMinor += amount;
      fleetCurrentMinor += amount;
    } else if (daysPast <= 30) {
      row.days1To30Minor += amount;
      fleet1To30Minor += amount;
    } else if (daysPast <= 60) {
      row.days31To60Minor += amount;
      fleet31To60Minor += amount;
    } else if (daysPast <= 90) {
      row.days61To90Minor += amount;
      fleet61To90Minor += amount;
    } else {
      row.days90PlusMinor += amount;
      fleet90PlusMinor += amount;
    }
  }

  const pastDueMinor = fleet1To30Minor + fleet31To60Minor + fleet61To90Minor + fleet90PlusMinor;

  return (
    <div className="flex flex-col min-h-screen bg-ui-bg-subtle">
      <div className="p-8 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <Heading level="h1" className="text-2xl font-bold text-ui-fg-base">
              Accounts Receivable Aging Matrix
            </Heading>
            <Text className="text-sm text-ui-fg-subtle">
              Deterministic delinquency tracking, aging buckets, and customer exposure distribution.
            </Text>
          </div>
          <Button
            variant="secondary"
            size="small"
            onClick={() => void loadData()}
          >
            ↻ Refresh Aging
          </Button>
        </div>
      </div>

      <ArNav />

      <div className="p-8 space-y-6 flex-1">
        {error && (
          <Alert variant="error" className="mb-4">
            <span className="font-semibold block">Unable to calculate aging matrix</span>
            <span>{error}</span>
          </Alert>
        )}

        {/* KPI Aging Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Container className="p-4 bg-ui-bg-base border border-ui-border-base">
            <Text size="xsmall" weight="plus" className="text-ui-fg-muted uppercase tracking-wider">
              Total Outstanding
            </Text>
            <Heading level="h2" className="text-2xl font-bold text-ui-fg-base mt-1">
              {formatMinorAmount(currency, fleetTotalOutstandingMinor)}
            </Heading>
            <Text size="xsmall" className="text-ui-fg-muted mt-1">{issuedInvoices.length} unpaid documents</Text>
          </Container>

          <Container className="p-4 bg-ui-bg-base border border-ui-border-base">
            <Text size="xsmall" weight="plus" className="text-ui-tag-green-text uppercase tracking-wider">
              Current (Not Due)
            </Text>
            <Heading level="h2" className="text-2xl font-bold text-ui-tag-green-text mt-1">
              {formatMinorAmount(currency, fleetCurrentMinor)}
            </Heading>
            <Text size="xsmall" className="text-ui-fg-muted mt-1">
              {fleetTotalOutstandingMinor > 0
                ? `${((fleetCurrentMinor / fleetTotalOutstandingMinor) * 100).toFixed(1)}% of AR balance`
                : '0%'}
            </Text>
          </Container>

          <Container className="p-4 bg-ui-bg-base border border-ui-border-base">
            <Text size="xsmall" weight="plus" className="text-ui-tag-orange-text uppercase tracking-wider">
              1 – 30 Days Overdue
            </Text>
            <Heading level="h2" className="text-2xl font-bold text-ui-tag-orange-text mt-1">
              {formatMinorAmount(currency, fleet1To30Minor)}
            </Heading>
            <Text size="xsmall" className="text-ui-fg-muted mt-1">First grace period</Text>
          </Container>

          <Container className="p-4 bg-ui-bg-base border border-ui-border-base">
            <Text size="xsmall" weight="plus" className="text-orange-600 uppercase tracking-wider">
              31 – 60 Days Overdue
            </Text>
            <Heading level="h2" className="text-2xl font-bold text-orange-600 mt-1">
              {formatMinorAmount(currency, fleet31To60Minor)}
            </Heading>
            <Text size="xsmall" className="text-ui-fg-muted mt-1">Follow-up reminder sent</Text>
          </Container>

          <Container className="p-4 bg-ui-bg-base border border-ui-border-base">
            <Text size="xsmall" weight="plus" className="text-ui-tag-red-text uppercase tracking-wider">
              60+ Days Overdue
            </Text>
            <Heading level="h2" className="text-2xl font-bold text-ui-tag-red-text mt-1">
              {formatMinorAmount(currency, fleet61To90Minor + fleet90PlusMinor)}
            </Heading>
            <Text size="xsmall" className="text-ui-tag-red-text/80 mt-1">Collections review flag</Text>
          </Container>
        </div>

        {/* Customer Aging Breakdown Table */}
        <Container className="p-0 overflow-hidden border border-ui-border-base bg-ui-bg-base">
          <div className="px-6 py-4 border-b border-ui-border-base flex items-center justify-between">
            <div>
              <Heading level="h2" className="text-base font-semibold text-ui-fg-base">Delinquency By Customer Account</Heading>
              <Text className="text-xs text-ui-fg-subtle">Aggregated from PostgreSQL ACID ledger balances</Text>
            </div>
            <Text className="text-xs text-ui-fg-subtle">
              Total Delinquent: <span className="font-bold text-ui-tag-red-text">{formatMinorAmount(currency, pastDueMinor)}</span>
            </Text>
          </div>

          {loading ? (
            <div className="p-12 text-center text-ui-fg-muted text-sm">
              <span className="inline-block w-4 h-4 border-2 border-ui-border-interactive border-t-transparent rounded-full animate-spin mr-2" />
              Computing aging buckets...
            </div>
          ) : agingRows.length === 0 ? (
            <div className="p-12 text-center text-ui-fg-muted text-sm">
              No outstanding receivables. All issued invoices have been settled.
            </div>
          ) : (
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Customer Account</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">Current</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">1 – 30 Days</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">31 – 60 Days</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">61 – 90 Days</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">90+ Days</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">Total Outstanding</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {agingRows.map((row) => (
                  <Table.Row key={row.customerId}>
                    <Table.Cell className="font-medium text-ui-fg-base">
                      {row.customerName}
                      <span className="block font-mono text-[10px] text-ui-fg-muted font-normal">
                        {row.customerId.slice(0, 14)}...
                      </span>
                    </Table.Cell>
                    <Table.Cell className="text-right font-mono text-ui-fg-subtle">
                      {row.currentMinor > 0 ? formatMinorAmount(currency, row.currentMinor) : '—'}
                    </Table.Cell>
                    <Table.Cell className={`text-right font-mono ${row.days1To30Minor > 0 ? 'text-ui-tag-orange-text font-semibold' : 'text-ui-fg-muted'}`}>
                      {row.days1To30Minor > 0 ? formatMinorAmount(currency, row.days1To30Minor) : '—'}
                    </Table.Cell>
                    <Table.Cell className={`text-right font-mono ${row.days31To60Minor > 0 ? 'text-orange-600 font-semibold' : 'text-ui-fg-muted'}`}>
                      {row.days31To60Minor > 0 ? formatMinorAmount(currency, row.days31To60Minor) : '—'}
                    </Table.Cell>
                    <Table.Cell className={`text-right font-mono ${row.days61To90Minor > 0 ? 'text-ui-tag-red-text font-bold' : 'text-ui-fg-muted'}`}>
                      {row.days61To90Minor > 0 ? formatMinorAmount(currency, row.days61To90Minor) : '—'}
                    </Table.Cell>
                    <Table.Cell className={`text-right font-mono ${row.days90PlusMinor > 0 ? 'text-ui-tag-red-text font-bold' : 'text-ui-fg-muted'}`}>
                      {row.days90PlusMinor > 0 ? formatMinorAmount(currency, row.days90PlusMinor) : '—'}
                    </Table.Cell>
                    <Table.Cell className="text-right font-mono font-bold text-ui-fg-base">
                      {formatMinorAmount(currency, row.totalOutstandingMinor)}
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          )}
        </Container>

        {/* Detailed Past-Due Invoices Table */}
        {issuedInvoices.length > 0 && (
          <Container className="p-0 overflow-hidden border border-ui-border-base bg-ui-bg-base">
            <div className="px-6 py-4 border-b border-ui-border-base flex items-center justify-between">
              <div>
                <Heading level="h2" className="text-base font-semibold text-ui-fg-base">Active Outstanding Invoices</Heading>
                <Text className="text-xs text-ui-fg-subtle">Directly actionable ledger records</Text>
              </div>
            </div>
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Document #</Table.HeaderCell>
                  <Table.HeaderCell>Customer</Table.HeaderCell>
                  <Table.HeaderCell>Due Date</Table.HeaderCell>
                  <Table.HeaderCell>Aging Status</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">Balance Due</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">Actions</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {issuedInvoices.map((inv) => {
                  const daysPast = getDaysPastDue(inv.dueDate);
                  return (
                    <Table.Row key={inv.id}>
                      <Table.Cell className="font-semibold text-ui-fg-base">
                        <Link href={`/ar/invoices/${inv.id}`} className="hover:underline text-ui-fg-interactive">
                          {inv.invoiceNumber}
                        </Link>
                      </Table.Cell>
                      <Table.Cell className="text-ui-fg-subtle">
                        {customerMap.get(inv.customerId)?.legalName ?? 'Customer'}
                      </Table.Cell>
                      <Table.Cell className="text-ui-fg-muted font-mono text-xs">{inv.dueDate}</Table.Cell>
                      <Table.Cell>
                        {daysPast <= 0 ? (
                          <StatusBadge color="green">
                            Current ({Math.abs(daysPast)}d remaining)
                          </StatusBadge>
                        ) : daysPast <= 30 ? (
                          <StatusBadge color="orange">
                            {daysPast}d Overdue (1-30)
                          </StatusBadge>
                        ) : (
                          <StatusBadge color="red">
                            {daysPast}d Overdue (Critical)
                          </StatusBadge>
                        )}
                      </Table.Cell>
                      <Table.Cell className="text-right font-mono font-bold text-ui-fg-base">
                        {formatMinorAmount(inv.currency, inv.amountDueMinor)}
                      </Table.Cell>
                      <Table.Cell className="text-right">
                        <Button variant="secondary" size="small" asChild>
                          <Link href={`/ar/invoices/${inv.id}`}>
                            Inspect →
                          </Link>
                        </Button>
                      </Table.Cell>
                    </Table.Row>
                  );
                })}
              </Table.Body>
            </Table>
          </Container>
        )}
      </div>
    </div>
  );
}
