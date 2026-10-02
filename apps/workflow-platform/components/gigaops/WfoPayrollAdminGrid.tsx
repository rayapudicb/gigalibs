'use client';

import { workforceApi } from '@/lib/workforce-api';
import { ArrowPath, CurrencyDollar, DocumentText } from '@medusajs/icons';
import {
  Alert,
  Button,
  Container,
  Heading,
  Input,
  StatusBadge,
  Table,
  Text,
} from '@medusajs/ui';
import { useEffect, useState } from 'react';

export function WfoPayrollAdminGrid() {
  const [period, setPeriod] = useState(new Date().toISOString().split('T')[0]);
  const [data, setData] = useState<{
    totalWorkers: number;
    totalGrossPay: number;
    totalExpenses: number;
    items: any[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [glBatch, setGlBatch] = useState<any | null>(null);
  const [generatingGl, setGeneratingGl] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadGrid() {
    setLoading(true);
    setError(null);
    try {
      const res = await workforceApi.wfoGetPayrollGrid(period);
      setData(res);
    } catch (err: any) {
      setError(err.message || 'Failed to load payroll grid');
    } finally {
      setLoading(false);
    }
  }

  async function triggerErpGl() {
    setGeneratingGl(true);
    setError(null);
    try {
      const res = await workforceApi.wfoGenerateErpGlBatch(period);
      setGlBatch(res);
    } catch (err: any) {
      setError(err.message || 'GL journal batch creation failed');
    } finally {
      setGeneratingGl(false);
    }
  }

  useEffect(() => {
    void loadGrid();
  }, [period]);

  return (
    <div className="space-y-5">
      <Container className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <Heading level="h2">Universal Payroll Administration</Heading>
            <Text size="small" className="mt-1 text-ui-fg-subtle">
              Payroll period reconciliations, frontline expense rollups, and ERP / iDempiere GL journal push.
            </Text>
          </div>
          <div className="flex items-center gap-3">
            <Input
              type="date"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="w-auto"
            />
            <Button size="small" variant="secondary" isLoading={loading} onClick={loadGrid}>
              <ArrowPath /> Refresh
            </Button>
            <Button size="small" isLoading={generatingGl} onClick={triggerErpGl}>
              <CurrencyDollar /> Push GL to ERP
            </Button>
          </div>
        </div>

        {error && <Alert variant="error" className="mt-4">{error}</Alert>}

        {data && (
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4">
              <Text size="small" className="text-ui-fg-subtle">Active Crew / Workers</Text>
              <Text size="xlarge" weight="plus" className="mt-1 tabular-nums">{data.totalWorkers}</Text>
            </div>
            <div className="rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4">
              <Text size="small" className="text-ui-fg-subtle">Total Gross Labor Pay</Text>
              <Text size="xlarge" weight="plus" className="mt-1 tabular-nums">
                ${data.totalGrossPay.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </Text>
            </div>
            <div className="rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4">
              <Text size="small" className="text-ui-fg-subtle">Approved Frontline Expenses</Text>
              <Text size="xlarge" weight="plus" className="mt-1 tabular-nums">
                ${data.totalExpenses.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </Text>
            </div>
          </div>
        )}

        {data && data.items.length > 0 && (
          <div className="mt-6 overflow-x-auto">
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Worker</Table.HeaderCell>
                  <Table.HeaderCell>Type</Table.HeaderCell>
                  <Table.HeaderCell>Gross Pay</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {data.items.map((item) => (
                  <Table.Row key={item.workerId}>
                    <Table.Cell className="py-2">
                      <span className="block txt-compact-small-plus">{item.name}</span>
                      <span className="text-xs text-ui-fg-subtle">{item.email}</span>
                    </Table.Cell>
                    <Table.Cell>{item.workerType}</Table.Cell>
                    <Table.Cell className="tabular-nums font-mono">
                      ${item.grossPay.toFixed(2)}
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </div>
        )}
      </Container>

      {glBatch && (
        <Container className="p-5 border-ui-border-interactive">
          <div className="flex items-center justify-between">
            <div>
              <Heading level="h2">Generated ERP GL Journal Batch ({glBatch.batchNo})</Heading>
              <Text size="small" className="mt-1 text-ui-fg-subtle">
                Balanced double-entry journal lines ready for Universal Connector Hub delivery to iDempiere / SAP.
              </Text>
            </div>
            <StatusBadge color="green">BALANCED</StatusBadge>
          </div>

          <div className="mt-4 overflow-x-auto border border-ui-border-base rounded-md">
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Line</Table.HeaderCell>
                  <Table.HeaderCell>Account</Table.HeaderCell>
                  <Table.HeaderCell>Debit ($)</Table.HeaderCell>
                  <Table.HeaderCell>Credit ($)</Table.HeaderCell>
                  <Table.HeaderCell>Description</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {glBatch.lines.map((l: any) => (
                  <Table.Row key={l.lineNo}>
                    <Table.Cell>{l.lineNo}</Table.Cell>
                    <Table.Cell className="font-mono text-xs">{l.accountCode} - {l.accountName}</Table.Cell>
                    <Table.Cell className="tabular-nums font-mono">{l.debitAmount > 0 ? `$${l.debitAmount.toFixed(2)}` : '—'}</Table.Cell>
                    <Table.Cell className="tabular-nums font-mono">{l.creditAmount > 0 ? `$${l.creditAmount.toFixed(2)}` : '—'}</Table.Cell>
                    <Table.Cell className="text-xs text-ui-fg-subtle">{l.description}</Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </div>
        </Container>
      )}
    </div>
  );
}
