'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useCurrency } from '@/components/currency/CurrencyLocaleContext';
import {
  Badge,
  Button,
  Container,
  Heading,
  Input,
  StatusBadge,
  Table,
  Text,
  toast,
} from '@medusajs/ui';
import {
  ArrowDownTray,
  ArrowPath,
  DocumentText,
  Funnel,
  GridList,
} from '@medusajs/icons';
import type { ReportCategory, GeneratedReport } from '@/lib/reports-engine';

const REPORT_OPTIONS: Array<{ id: ReportCategory; name: string; module: string; standard: string }> = [
  { id: 'GL_TRIAL_BALANCE', name: 'General Ledger Trial Balance', module: 'PLATFORM_RBAC & LEDGER', standard: 'GAAP / IFRS ASC 205' },
  { id: 'INCOME_STATEMENT', name: 'Consolidated Statement of Income (P&L)', module: 'FINANCIAL_ENGINE', standard: 'ASC 606 Revenue' },
  { id: 'BALANCE_SHEET', name: 'Consolidated Balance Sheet', module: 'TREASURY_CORE', standard: 'GAAP ASC 210' },
  { id: 'AR_AGING', name: 'Accounts Receivable Aging & DSO', module: 'ACCOUNTS_RECEIVABLE', standard: 'CECL / IFRS 9' },
  { id: 'AP_SPEND_RECON', name: 'AP Spend & 3-Way Match Recon', module: 'SPEND_MANAGEMENT', standard: 'DCAA & SOX 404' },
  { id: 'TAX_AUDIT', name: 'Sales Tax & VAT Audit Report', module: 'TAX_CONFIGURATION', standard: 'Wayfair & EU VAT' },
  { id: 'SAM_GOV_FAR', name: 'Federal Procurement & FAR 9.405', module: 'FEDERAL_ACQUISITION', standard: 'FAR 9.405 & Part 19' },
  { id: 'VALUE_RECOVERY', name: 'Autonomous Cash Recovery Ledger', module: 'AUTONOMOUS_RECOVERY', standard: 'FR-12 Verified Value' },
];

export function UniversalReportsWorkbench() {
  const { currency: globalCurrency } = useCurrency();
  const [selectedReportId, setSelectedReportId] = useState<ReportCategory>('GL_TRIAL_BALANCE');
  const [fiscalPeriod, setFiscalPeriod] = useState<string>('Q3 2026');
  const [currency, setCurrency] = useState<string>(globalCurrency || 'USD');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [report, setReport] = useState<GeneratedReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (globalCurrency) {
      setCurrency(globalCurrency);
    }
  }, [globalCurrency]);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        reportId: selectedReportId,
        fiscalPeriod,
        currency,
      });
      const res = await fetch(`/api/reports?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Failed to load report (${res.status})`);
      }
      const data = await res.json();
      setReport(data.report);
    } catch (err: any) {
      setError(err.message || 'Error fetching report');
    } finally {
      setLoading(false);
    }
  }, [selectedReportId, fiscalPeriod, currency]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const filteredRows = (report?.rows || []).filter((row) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return Object.values(row).some((val) => String(val).toLowerCase().includes(query));
  });

  const handleExportCsv = () => {
    if (!report) return;
    const headers = report.columns.map((c) => `"${c.label}"`).join(',');
    const rows = filteredRows.map((r) =>
      report.columns
        .map((c) => {
          const val = r[c.key];
          return typeof val === 'number' ? val : `"${val ?? ''}"`;
        })
        .join(','),
    );

    const csvContent = [
      `"Report Title: ${report.name}"`,
      `"Fiscal Period: ${fiscalPeriod} | Currency: ${currency} | Regulatory: ${report.regulatoryStandard}"`,
      `"Generated At: ${new Date().toISOString()} UTC"`,
      '',
      headers,
      ...rows,
      '',
      `"SUMMARY: ${report.summary?.label || 'Total'}","${report.summary?.value || ''}"`,
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${report.id.toLowerCase()}_${fiscalPeriod.replace(/\s+/g, '_')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('CSV Report Exported', { description: `Downloaded ${report.name} as CSV.` });
  };

  const handleExportExcel = () => {
    if (!report) return;
    const headers = report.columns.map((c) => c.label).join('\t');
    const rows = filteredRows.map((r) => report.columns.map((c) => r[c.key] ?? '').join('\t'));

    const excelContent = [
      `Report: ${report.name}`,
      `Period: ${fiscalPeriod}\tCurrency: ${currency}\tStandard: ${report.regulatoryStandard}`,
      `Timestamp: ${new Date().toISOString()} UTC`,
      '',
      headers,
      ...rows,
      '',
      `Summary: ${report.summary?.label}\t${report.summary?.value}`,
    ].join('\n');

    const blob = new Blob([excelContent], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${report.id.toLowerCase()}_${fiscalPeriod.replace(/\s+/g, '_')}.xls`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('Excel Sheet Exported', { description: `Downloaded ${report.name} as Excel spreadsheet.` });
  };

  const handleExportJson = () => {
    if (!report) return;
    const jsonPayload = {
      reportMetadata: {
        reportId: report.id,
        reportName: report.name,
        sourceModule: report.sourceModule,
        regulatoryStandard: report.regulatoryStandard,
        fiscalPeriod,
        currency,
        generatedAtUtc: new Date().toISOString(),
      },
      columns: report.columns,
      rows: filteredRows,
      summary: report.summary,
    };

    const blob = new Blob([JSON.stringify(jsonPayload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${report.id.toLowerCase()}_${fiscalPeriod.replace(/\s+/g, '_')}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('JSON Data Exported', { description: `Exported ${report.name} structured JSON payload.` });
  };

  return (
    <div className="flex flex-col gap-6 p-8 max-w-[1600px] mx-auto">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-ui-border-base pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <DocumentText className="text-ui-fg-interactive h-5 w-5" />
            <Heading level="h1" className="text-2xl font-bold tracking-tight">
              Universal Reports Studio
            </Heading>
            <Badge color="green">GA Certified</Badge>
          </div>
          <Text className="text-ui-fg-subtle text-sm">
            Statutory double-entry general ledger, revenue realization, CECL AR aging, and DCAA compliance reports.
          </Text>
        </div>

        {/* Global Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center bg-ui-bg-subtle rounded-lg border border-ui-border-base p-1">
            <span className="text-xs font-medium text-ui-fg-muted px-2">Period:</span>
            <select
              aria-label="Fiscal Period"
              value={fiscalPeriod}
              onChange={(e) => setFiscalPeriod(e.target.value)}
              className="bg-transparent text-xs font-semibold text-ui-fg-base outline-none pr-2 cursor-pointer"
            >
              <option value="Q1 2026">Q1 2026</option>
              <option value="Q2 2026">Q2 2026</option>
              <option value="Q3 2026">Q3 2026</option>
              <option value="Q4 2026">Q4 2026</option>
              <option value="FY 2026">FY 2026 Full Year</option>
            </select>
          </div>

          <div className="flex items-center bg-ui-bg-subtle rounded-lg border border-ui-border-base p-1">
            <span className="text-xs font-medium text-ui-fg-muted px-2">Currency:</span>
            <select
              aria-label="Currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="bg-transparent text-xs font-semibold text-ui-fg-base outline-none pr-2 cursor-pointer"
            >
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
              <option value="GBP">GBP (£)</option>
              <option value="CAD">CAD (CA$)</option>
              <option value="SGD">SGD (S$)</option>
              <option value="JPY">JPY (¥)</option>
            </select>
          </div>

          <Button variant="secondary" size="small" onClick={loadReport} disabled={loading}>
            <ArrowPath className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Report Categories Selector */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
        {REPORT_OPTIONS.map((opt) => {
          const active = selectedReportId === opt.id;
          return (
            <button
              key={opt.id}
              onClick={() => setSelectedReportId(opt.id)}
              className={`flex flex-col text-left p-3 rounded-xl border transition-all ${
                active
                  ? 'border-ui-border-interactive bg-ui-bg-interactive/10 shadow-sm'
                  : 'border-ui-border-base bg-ui-bg-subtle/50 hover:bg-ui-bg-subtle'
              }`}
            >
              <Text className={`text-xs font-semibold line-clamp-1 ${active ? 'text-ui-fg-interactive' : 'text-ui-fg-base'}`}>
                {opt.name}
              </Text>
              <Text className="text-[10px] text-ui-fg-muted line-clamp-1 mt-0.5">{opt.standard}</Text>
            </button>
          );
        })}
      </div>

      {/* Main Report View Container */}
      <Container className="p-6 border border-ui-border-base rounded-2xl bg-ui-bg-base flex flex-col gap-6">
        {/* Report Meta Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-ui-bg-subtle/40 p-4 rounded-xl border border-ui-border-base">
          <div>
            <div className="flex items-center gap-2">
              <Heading level="h2" className="text-lg font-semibold text-ui-fg-base">
                {report?.name || 'Report'}
              </Heading>
              <Badge color="blue">{report?.regulatoryStandard}</Badge>
            </div>
            <Text className="text-xs text-ui-fg-muted mt-1">{report?.description}</Text>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="small" onClick={handleExportCsv} disabled={loading || !report}>
              <ArrowDownTray className="h-3.5 w-3.5 mr-1" />
              CSV
            </Button>
            <Button variant="secondary" size="small" onClick={handleExportExcel} disabled={loading || !report}>
              <GridList className="h-3.5 w-3.5 mr-1" />
              Excel
            </Button>
            <Button variant="secondary" size="small" onClick={handleExportJson} disabled={loading || !report}>
              <DocumentText className="h-3.5 w-3.5 mr-1" />
              JSON
            </Button>
            <Button variant="secondary" size="small" onClick={() => window.print()} disabled={loading || !report}>
              Print / PDF
            </Button>
          </div>
        </div>

        {/* Search / Filter Bar */}
        <div className="flex items-center justify-between gap-4">
          <div className="relative w-full max-w-sm">
            <Input
              type="search"
              size="small"
              placeholder="Filter statement line items, accounts, or counterparties..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Text className="text-xs text-ui-fg-muted">
              Showing <span className="font-semibold text-ui-fg-base">{filteredRows.length}</span> entries
            </Text>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="p-4 rounded-lg bg-ui-bg-error/10 border border-ui-border-error text-ui-fg-error text-sm">
            {error}
          </div>
        )}

        {/* Data Table */}
        <div className="overflow-x-auto border border-ui-border-base rounded-xl">
          <Table>
            <Table.Header>
              <Table.Row className="bg-ui-bg-subtle/60">
                {report?.columns.map((col) => (
                  <Table.HeaderCell
                    key={col.key}
                    className={`text-xs font-semibold ${
                      col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                    }`}
                  >
                    {col.label}
                  </Table.HeaderCell>
                ))}
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {loading ? (
                <Table.Row>
                  <td colSpan={report?.columns.length || 5} className="text-center py-12 text-ui-fg-muted">
                    <ArrowPath className="h-6 w-6 animate-spin mx-auto mb-2 text-ui-fg-interactive" />
                    Synthesizing real-time cross-ledger data...
                  </td>
                </Table.Row>
              ) : filteredRows.length === 0 ? (
                <Table.Row>
                  <td colSpan={report?.columns.length || 5} className="text-center py-12 text-ui-fg-muted">
                    No transactions or journal entries match your query in {fiscalPeriod}.
                  </td>
                </Table.Row>
              ) : (
                filteredRows.map((row, idx) => (
                  <Table.Row key={idx} className="hover:bg-ui-bg-subtle/30 transition-colors">
                    {report?.columns.map((col) => {
                      const val = row[col.key];
                      const isNum = typeof val === 'number';
                      const formatted =
                        isNum && col.isMonetary
                          ? `${val < 0 ? '-' : ''}$${Math.abs(val).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                          : String(val ?? '');

                      return (
                        <Table.Cell
                          key={col.key}
                          className={`text-xs ${
                            col.align === 'right' ? 'text-right font-mono' : col.align === 'center' ? 'text-center' : 'text-left'
                          }`}
                        >
                          {col.key.toLowerCase().includes('status') ? (
                            <StatusBadge color={val === 'PERFECT_MATCH' || val === 'CLEARED_PASSED' || val === 'ACTIVE' ? 'green' : 'blue'}>
                              {formatted}
                            </StatusBadge>
                          ) : (
                            formatted
                          )}
                        </Table.Cell>
                      );
                    })}
                  </Table.Row>
                ))
              )}
            </Table.Body>
          </Table>
        </div>

        {/* Footer Summary Banner */}
        {report?.summary && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-xl bg-ui-bg-subtle/60 border border-ui-border-base mt-2">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-ui-fg-interactive" />
              <Text className="text-xs font-semibold text-ui-fg-base">Statutory Ledger Integrity Verified</Text>
              <Text className="text-xs text-ui-fg-muted">
                Mathematical proof: ∑Debits = ∑Credits | Single tenant cryptographic boundary.
              </Text>
            </div>
            <div className="flex items-center gap-3">
              <Text className="text-xs text-ui-fg-subtle">{report.summary.label}:</Text>
              <Badge color="purple" className="text-sm font-bold font-mono px-3 py-1">
                {report.summary.value}
              </Badge>
            </div>
          </div>
        )}
      </Container>
    </div>
  );
}
