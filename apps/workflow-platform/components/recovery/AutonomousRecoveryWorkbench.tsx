'use client';

import {
  ArrowPath,
  BuildingTax,
  CheckCircleSolid,
  DocumentText,
  ExclamationCircleSolid,
  ShieldCheck,
  Sparkles,
} from '@medusajs/icons';
import {
  Alert,
  Badge,
  Button,
  Container,
  Heading,
  Input,
  StatusBadge,
  Table,
  Text,
} from '@medusajs/ui';
import { useCallback, useEffect, useMemo, useState } from 'react';

interface RecoveryMetrics {
  totalPreservedUsd: number;
  totalDetectedUsd: number;
  totalHeldUsd: number;
  totalUnderReviewUsd: number;
  totalRecoveredUsd: number;
  duplicateBlockedUsd: number;
  unclaimedCreditsUsd: number;
  taxRecoveredUsd: number;
  contractCreepUsd: number;
  activeLeaksCount: number;
  totalIncidents: number;
}

interface DetectedLeak {
  id: string;
  leak_type: 'DUPLICATE_INVOICE' | 'UNCLAIMED_CREDIT' | 'MISSED_TAX_EXEMPTION' | 'CONTRACT_CREEP';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  title: string;
  vendor_name: string;
  vendor_id: string;
  amount_minor: string;
  currency: string;
  amount_usd: string;
  confidence_score: string;
  accuracy_protocol: string;
  primary_doc_id: string;
  primary_doc_date: string;
  comparison_doc_id: string | null;
  comparison_doc_date: string | null;
  evidence: Record<string, any>;
  status: 'DETECTED' | 'HELD' | 'UNDER_REVIEW' | 'RECOVERED' | 'DISMISSED';
  action_taken: string | null;
  action_notes: string | null;
  clawback_run_id: string | null;
  created_at: string;
  updated_at: string;
}

interface HistoricalScan {
  id: string;
  scan_name: string;
  records_scanned: number;
  leaks_found: number;
  potential_recovery_usd: string;
  status: string;
  duration_ms: number;
  scanned_by: string;
  created_at: string;
}

interface RecoveryClaim {
  id: string;
  leak_id: string;
  claim_number: string;
  vendor_name: string;
  vendor_contact_email: string;
  claim_amount_usd: string;
  settlement_type: string;
  status: 'ISSUED' | 'ACKNOWLEDGED' | 'SETTLED' | 'DISPUTED';
  evidence_hash: string;
  workflow_run_id: string | null;
  issued_at: string;
  settled_at: string | null;
  leak_title?: string;
  leak_type?: string;
}

interface SetupStatus {
  configured: boolean;
  tenantId: string;
  initializedAt?: string;
}

export function AutonomousRecoveryWorkbench() {
  const [activeTab, setActiveTab] = useState<'detective' | 'shadow' | 'claims' | 'sla'>(
    'detective',
  );
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  const [metrics, setMetrics] = useState<RecoveryMetrics | null>(null);
  const [leaks, setLeaks] = useState<DetectedLeak[]>([]);
  const [scans, setScans] = useState<HistoricalScan[]>([]);
  const [claims, setClaims] = useState<RecoveryClaim[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  // Filters
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Inspection Modal
  const [inspectedLeak, setInspectedLeak] = useState<DetectedLeak | null>(null);

  // Fetch all live data
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [setupRes, metricsRes, leaksRes, scansRes, claimsRes] = await Promise.all([
        fetch('/api/recovery/setup'),
        fetch('/api/recovery/metrics'),
        fetch('/api/recovery/leaks'),
        fetch('/api/recovery/scans'),
        fetch('/api/recovery/claims'),
      ]);

      if (setupRes.ok) setSetupStatus(await setupRes.json());
      if (metricsRes.ok) setMetrics(await metricsRes.json());
      if (leaksRes.ok) setLeaks(await leaksRes.json());
      if (scansRes.ok) setScans(await scansRes.json());
      if (claimsRes.ok) setClaims(await claimsRes.json());
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: `Failed to load Recovery Studio data: ${err.message}`,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle Setup
  const handleSetupTenant = async () => {
    setActionInProgress('SETUP');
    setStatusMessage(null);
    try {
      const res = await fetch('/api/recovery/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error(`Setup failed with status ${res.status}`);
      const data = await res.json();
      setStatusMessage({
        type: 'success',
        text: `Tenant ${data.tenantId} is bound to PostgreSQL. No detection cases were created; connect an authoritative source before scanning.`,
      });
      await fetchData();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: `Setup failed: ${err.message}` });
    } finally {
      setActionInProgress(null);
    }
  };

  // Filtered leaks
  const filteredLeaks = useMemo(() => {
    return leaks.filter((leak) => {
      if (typeFilter !== 'ALL' && leak.leak_type !== typeFilter) return false;
      if (severityFilter !== 'ALL' && leak.severity !== severityFilter) return false;
      if (statusFilter !== 'ALL' && leak.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchTitle = leak.title.toLowerCase().includes(query);
        const matchVendor = leak.vendor_name.toLowerCase().includes(query);
        const matchDoc = leak.primary_doc_id.toLowerCase().includes(query);
        if (!matchTitle && !matchVendor && !matchDoc) return false;
      }
      return true;
    });
  }, [leaks, typeFilter, severityFilter, statusFilter, searchQuery]);

  const formatCurrency = (val: number | string) => {
    const num = Number(val) || 0;
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
  };

  const getSeverityBadge = (sev: string) => {
    if (sev === 'CRITICAL') return <Badge color="red">CRITICAL</Badge>;
    if (sev === 'HIGH') return <Badge color="orange">HIGH</Badge>;
    return <Badge color="blue">MEDIUM</Badge>;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'HELD':
        return <StatusBadge color="green">PAYMENT HELD</StatusBadge>;
      case 'RECOVERED':
        return <StatusBadge color="purple">RECOVERED</StatusBadge>;
      case 'UNDER_REVIEW':
        return <StatusBadge color="blue">UNDER REVIEW</StatusBadge>;
      case 'DISMISSED':
        return <StatusBadge color="grey">DISMISSED</StatusBadge>;
      default:
        return <StatusBadge color="orange">DETECTED</StatusBadge>;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'DUPLICATE_INVOICE':
        return 'Duplicate Invoice';
      case 'MISSED_TAX_EXEMPTION':
        return 'Missed Tax Exemption';
      case 'UNCLAIMED_CREDIT':
        return 'Unclaimed Credit Memo';
      case 'CONTRACT_CREEP':
        return 'Contract Price Creep';
      default:
        return type;
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-ui-bg-subtle text-ui-fg-base font-sans pb-16">
      {/* Action Toolbar */}
      <div className="border-b border-ui-border-base bg-ui-bg-base px-8 py-3.5 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge color="green" size="small">
              REAL RECORDS ONLY
            </Badge>
            <Badge color="blue" size="small">
              SOURCE REQUIRED
            </Badge>
            <Badge color="purple" size="small">
              WI-OI-027 REVIEW
            </Badge>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              size="base"
              onClick={fetchData}
              disabled={loading}
              className="flex items-center gap-2"
            >
              <ArrowPath className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button
              variant="primary"
              size="base"
              disabled
              title="Connect an authoritative source contract before scanning."
              className="flex items-center gap-2 shadow-xs bg-ui-button-inverted text-ui-fg-on-inverted"
            >
              <Sparkles className="h-4 w-4" />
              Connect source before scanning
            </Button>
          </div>
        </div>

        {/* Setup Banner if Not Configured */}
        {setupStatus && !setupStatus.configured && (
          <div className="mt-6 p-4 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ExclamationCircleSolid className="h-5 w-5 text-amber-500" />
              <div>
                <p className="font-semibold text-sm text-ui-fg-base">
                  Tenant Recovery Configuration Required
                </p>
                <p className="text-xs text-ui-fg-muted">
                  Tenant {setupStatus.tenantId} is not bound to PostgreSQL schema gigalibs_recovery
                  yet.
                </p>
              </div>
            </div>
            <Button
              variant="primary"
              size="small"
              onClick={handleSetupTenant}
              disabled={actionInProgress === 'SETUP'}
            >
              {actionInProgress === 'SETUP'
                ? 'Initializing...'
                : 'Bind Tenant & Initialize Recovery Engine'}
            </Button>
          </div>
        )}

        {/* Global Alert Notification */}
        {statusMessage && (
          <div className="mt-4">
            <Alert variant={statusMessage.type === 'error' ? 'error' : 'info'} dismissible>
              {statusMessage.text}
            </Alert>
          </div>
        )}

        {/* Top Financial Value & Loss Metric Cards (Truthful Separation) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
          <Container className="p-4 bg-ui-bg-base border border-ui-border-base rounded-lg shadow-2xs">
            <div className="flex items-center justify-between">
              <Text className="text-xs font-medium text-ui-fg-muted uppercase tracking-wider">
                Total Detected Leakage
              </Text>
              <Badge color="red" size="small">
                EXPOSURE
              </Badge>
            </div>
            <Heading level="h2" className="text-2xl font-mono font-bold text-ui-fg-base mt-2">
              {formatCurrency(metrics?.totalDetectedUsd || 0)}
            </Heading>
            <Text className="text-xs text-ui-fg-subtle mt-1">
              {metrics?.activeLeaksCount || 0} active incidents identified
            </Text>
          </Container>

          <Container className="p-4 bg-ui-bg-base border border-ui-border-base rounded-lg shadow-2xs">
            <div className="flex items-center justify-between">
              <Text className="text-xs font-medium text-ui-fg-muted uppercase tracking-wider">
                Active Payment Holds
              </Text>
              <Badge color="green" size="small">
                HELD
              </Badge>
            </div>
            <Heading level="h2" className="text-2xl font-mono font-bold text-emerald-600 mt-2">
              {formatCurrency(metrics?.totalHeldUsd || 0)}
            </Heading>
            <Text className="text-xs text-ui-fg-subtle mt-1 flex items-center gap-1">
              <CheckCircleSolid className="h-3.5 w-3.5 text-emerald-500 inline" />
              {(metrics?.totalHeldUsd || 0) > 0
                ? 'Verified provider holds recorded'
                : 'No verified payment holds recorded'}
            </Text>
          </Container>

          <Container className="p-4 bg-ui-bg-base border border-ui-border-base rounded-lg shadow-2xs">
            <div className="flex items-center justify-between">
              <Text className="text-xs font-medium text-ui-fg-muted uppercase tracking-wider">
                Dispatched Claims In Review
              </Text>
              <Badge color="blue" size="small">
                PENDING
              </Badge>
            </div>
            <Heading level="h2" className="text-2xl font-mono font-bold text-ui-fg-base mt-2">
              {formatCurrency(metrics?.totalUnderReviewUsd || 0)}
            </Heading>
            <Text className="text-xs text-ui-fg-subtle mt-1">
              {(metrics?.totalUnderReviewUsd || 0) > 0
                ? 'Verified claims remain under review'
                : 'No dispatched claims under review'}
            </Text>
          </Container>

          <Container className="p-4 bg-ui-bg-base border border-ui-border-base rounded-lg shadow-2xs">
            <div className="flex items-center justify-between">
              <Text className="text-xs font-medium text-ui-fg-muted uppercase tracking-wider">
                Reconciled Cash Recovery
              </Text>
              <Badge color="purple" size="small">
                AUDITED
              </Badge>
            </div>
            <Heading level="h2" className="text-2xl font-mono font-bold text-indigo-600 mt-2">
              {formatCurrency(metrics?.totalRecoveredUsd || 0)}
            </Heading>
            <Text className="text-xs text-ui-fg-subtle mt-1">
              {(metrics?.totalRecoveredUsd || 0) > 0
                ? 'Backed by verified settlement receipts'
                : 'No verified settlements recorded'}
            </Text>
          </Container>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-8 border-b border-ui-border-base mt-8 -mb-6 text-sm font-medium">
          <button
            onClick={() => setActiveTab('detective')}
            className={`pb-3 transition-colors border-b-2 font-medium flex items-center gap-2 ${
              activeTab === 'detective'
                ? 'border-ui-fg-base text-ui-fg-base'
                : 'border-transparent text-ui-fg-muted hover:text-ui-fg-base'
            }`}
          >
            <DocumentText className="h-4 w-4" />
            Cash Leak Detective Desk
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-ui-bg-subtle border border-ui-border-base">
              {leaks.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('shadow')}
            className={`pb-3 transition-colors border-b-2 font-medium flex items-center gap-2 ${
              activeTab === 'shadow'
                ? 'border-ui-fg-base text-ui-fg-base'
                : 'border-transparent text-ui-fg-muted hover:text-ui-fg-base'
            }`}
          >
            <Sparkles className="h-4 w-4" />
            Historical Shadow Scanner
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-ui-bg-subtle border border-ui-border-base">
              {scans.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('claims')}
            className={`pb-3 transition-colors border-b-2 font-medium flex items-center gap-2 ${
              activeTab === 'claims'
                ? 'border-ui-fg-base text-ui-fg-base'
                : 'border-transparent text-ui-fg-muted hover:text-ui-fg-base'
            }`}
          >
            <BuildingTax className="h-4 w-4" />
            Vendor Recovery Claims & Settlements
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-ui-bg-subtle border border-ui-border-base">
              {claims.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('sla')}
            className={`pb-3 transition-colors border-b-2 font-medium flex items-center gap-2 ${
              activeTab === 'sla'
                ? 'border-ui-fg-base text-ui-fg-base'
                : 'border-transparent text-ui-fg-muted hover:text-ui-fg-base'
            }`}
          >
            <ShieldCheck className="h-4 w-4" />
            Dual-Gate Lineage & Governance Protocol
          </button>
        </div>
      </div>

      {/* Main Content Body */}
      <div className="px-8 pt-8 max-w-7xl mx-auto w-full">
        {/* TAB 1: CASH LEAK DETECTIVE DESK */}
        {activeTab === 'detective' && (
          <div className="space-y-6">
            {/* Filters Bar */}
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-ui-bg-base p-4 rounded-lg border border-ui-border-base shadow-2xs">
              <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                <Input
                  placeholder="Search vendor, invoice ID, title..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-72 text-sm"
                />

                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="text-xs bg-ui-bg-base border border-ui-border-base rounded-md px-3 py-2 text-ui-fg-base"
                >
                  <option value="ALL">All Leak Types</option>
                  <option value="DUPLICATE_INVOICE">Duplicate Invoices</option>
                  <option value="UNCLAIMED_CREDIT">Unclaimed Credits</option>
                  <option value="CONTRACT_CREEP">Contract Price Creep</option>
                </select>

                <select
                  value={severityFilter}
                  onChange={(e) => setSeverityFilter(e.target.value)}
                  className="text-xs bg-ui-bg-base border border-ui-border-base rounded-md px-3 py-2 text-ui-fg-base"
                >
                  <option value="ALL">All Severities</option>
                  <option value="CRITICAL">Critical</option>
                  <option value="HIGH">High</option>
                  <option value="MEDIUM">Medium</option>
                </select>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="text-xs bg-ui-bg-base border border-ui-border-base rounded-md px-3 py-2 text-ui-fg-base"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="DETECTED">Detected</option>
                  <option value="HELD">Payment Held</option>
                  <option value="UNDER_REVIEW">Under Review</option>
                  <option value="RECOVERED">Recovered</option>
                  <option value="DISMISSED">Dismissed</option>
                </select>
              </div>

              <Text className="text-xs text-ui-fg-subtle">
                Showing {filteredLeaks.length} of {leaks.length} incidents
              </Text>
            </div>

            {/* Incidents Table */}
            <Container className="p-0 bg-ui-bg-base border border-ui-border-base rounded-lg overflow-hidden shadow-2xs">
              <Table>
                <Table.Header>
                  <Table.Row>
                    <Table.HeaderCell>Severity & Type</Table.HeaderCell>
                    <Table.HeaderCell>Incident & Vendor</Table.HeaderCell>
                    <Table.HeaderCell>Leak Value</Table.HeaderCell>
                    <Table.HeaderCell>Confidence Score</Table.HeaderCell>
                    <Table.HeaderCell>Status</Table.HeaderCell>
                    <Table.HeaderCell className="text-right">Supervised Action</Table.HeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {filteredLeaks.map((leak) => {
                    const confNum = Number(leak.confidence_score);
                    const isAutonomousEligible = confNum >= 95.0;

                    return (
                      <Table.Row
                        key={leak.id}
                        className="hover:bg-ui-bg-subtle/50 transition-colors"
                      >
                        <Table.Cell>
                          <div className="flex flex-col gap-1 items-start">
                            {getSeverityBadge(leak.severity)}
                            <span className="text-[11px] font-mono text-ui-fg-subtle">
                              {getTypeLabel(leak.leak_type)}
                            </span>
                          </div>
                        </Table.Cell>

                        <Table.Cell>
                          <div>
                            <div
                              className="font-semibold text-sm text-ui-fg-base hover:underline cursor-pointer"
                              onClick={() => setInspectedLeak(leak)}
                            >
                              {leak.title}
                            </div>
                            <div className="text-xs text-ui-fg-muted mt-0.5 flex items-center gap-2 font-mono">
                              <span>{leak.vendor_name}</span>
                              <span>•</span>
                              <span>Doc: {leak.primary_doc_id}</span>
                            </div>
                          </div>
                        </Table.Cell>

                        <Table.Cell>
                          <div className="font-mono font-bold text-sm text-ui-fg-base">
                            {formatCurrency(leak.amount_usd)}
                          </div>
                          <span className="text-[10px] text-ui-fg-subtle uppercase">
                            {leak.currency}
                          </span>
                        </Table.Cell>

                        <Table.Cell>
                          <div className="flex items-center gap-2">
                            <div className="w-16 bg-ui-bg-subtle rounded-full h-2 overflow-hidden border border-ui-border-base">
                              <div
                                className={`h-full ${
                                  confNum >= 98
                                    ? 'bg-emerald-500'
                                    : confNum >= 95
                                      ? 'bg-blue-500'
                                      : 'bg-amber-500'
                                }`}
                                style={{ width: `${confNum}%` }}
                              />
                            </div>
                            <span className="text-xs font-mono font-semibold">
                              {leak.confidence_score}%
                            </span>
                          </div>
                          <span className="text-[10px] text-ui-fg-subtle block mt-0.5">
                            {isAutonomousEligible ? 'Dual-Gate Auto Eligible' : 'Human Supervised'}
                          </span>
                        </Table.Cell>

                        <Table.Cell>
                          {getStatusBadge(leak.status)}
                          {leak.clawback_run_id && (
                            <span className="text-[10px] font-mono text-ui-fg-subtle block mt-0.5">
                              Run: {leak.clawback_run_id}
                            </span>
                          )}
                        </Table.Cell>

                        <Table.Cell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="secondary"
                              size="small"
                              onClick={() => setInspectedLeak(leak)}
                              className="text-xs"
                            >
                              Inspect Evidence
                            </Button>

                            {leak.status === 'DETECTED' && (
                              <Button
                                variant="danger"
                                size="small"
                                disabled
                                title="A payment-provider adapter and receipt are required."
                                className="text-xs"
                              >
                                Hold Payment
                              </Button>
                            )}

                            {(leak.status === 'DETECTED' || leak.status === 'HELD') && (
                              <Button
                                variant="primary"
                                size="small"
                                disabled
                                title="A claim-delivery adapter and receipt are required."
                                className="text-xs bg-ui-button-inverted text-ui-fg-on-inverted"
                              >
                                Dispatch Claim
                              </Button>
                            )}

                            {leak.status === 'RECOVERED' && (
                              <Badge color="purple" size="small">
                                Offset Settled
                              </Badge>
                            )}
                          </div>
                        </Table.Cell>
                      </Table.Row>
                    );
                  })}
                  {filteredLeaks.length === 0 && (
                    <Table.Row>
                      <Table.Cell
                        className="text-center py-8 text-ui-fg-muted"
                        {...({ colSpan: 6 } as any)}
                      >
                        No leak records match the active criteria.
                      </Table.Cell>
                    </Table.Row>
                  )}
                </Table.Body>
              </Table>
            </Container>

            {/* Inspection Drawer / Modal */}
            {inspectedLeak && (
              <Container className="p-6 bg-ui-bg-base border-2 border-ui-border-interactive rounded-xl shadow-lg mt-6">
                <div className="flex items-center justify-between border-b border-ui-border-base pb-4 mb-4">
                  <div className="flex items-center gap-3">
                    <Heading level="h2" className="text-lg font-bold">
                      Forensic Discrepancy File: {inspectedLeak.id}
                    </Heading>
                    {getSeverityBadge(inspectedLeak.severity)}
                    {getStatusBadge(inspectedLeak.status)}
                  </div>
                  <Button variant="secondary" size="small" onClick={() => setInspectedLeak(null)}>
                    Close Inspector
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-xs font-semibold text-ui-fg-muted uppercase tracking-wider mb-2">
                      Primary Target Document
                    </h3>
                    <div className="p-4 rounded-lg bg-ui-bg-subtle border border-ui-border-base space-y-2 text-sm font-mono">
                      <div>
                        <span className="text-ui-fg-muted">Document ID:</span>{' '}
                        {inspectedLeak.primary_doc_id}
                      </div>
                      <div>
                        <span className="text-ui-fg-muted">Issue Date:</span>{' '}
                        {new Date(inspectedLeak.primary_doc_date).toLocaleString()}
                      </div>
                      <div>
                        <span className="text-ui-fg-muted">Vendor:</span>{' '}
                        {inspectedLeak.vendor_name} ({inspectedLeak.vendor_id})
                      </div>
                      <div>
                        <span className="text-ui-fg-muted">Monetary Value:</span>{' '}
                        {formatCurrency(inspectedLeak.amount_usd)}
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-xs font-semibold text-ui-fg-muted uppercase tracking-wider mb-2">
                      Comparison Proof / Forensic Baseline
                    </h3>
                    <div className="p-4 rounded-lg bg-ui-bg-subtle border border-ui-border-base space-y-2 text-sm font-mono">
                      <div>
                        <span className="text-ui-fg-muted">Reference Doc:</span>{' '}
                        {inspectedLeak.comparison_doc_id || 'N/A'}
                      </div>
                      <div>
                        <span className="text-ui-fg-muted">Reference Date:</span>{' '}
                        {inspectedLeak.comparison_doc_date
                          ? new Date(inspectedLeak.comparison_doc_date).toLocaleString()
                          : 'N/A'}
                      </div>
                      <div>
                        <span className="text-ui-fg-muted">Protocol:</span>{' '}
                        {inspectedLeak.accuracy_protocol}
                      </div>
                      <div>
                        <span className="text-ui-fg-muted">Confidence:</span>{' '}
                        {inspectedLeak.confidence_score}%
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4">
                  <h3 className="text-xs font-semibold text-ui-fg-muted uppercase tracking-wider mb-2">
                    Cryptographic Evidence Metadata
                  </h3>
                  <pre className="p-4 rounded-lg bg-ui-bg-subtle border border-ui-border-base text-xs font-mono text-ui-fg-base overflow-x-auto">
                    {JSON.stringify(inspectedLeak.evidence, null, 2)}
                  </pre>
                </div>

                <div className="mt-6 flex items-center justify-between pt-4 border-t border-ui-border-base">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="danger"
                      size="small"
                      disabled
                      title="A payment-provider adapter and receipt are required."
                    >
                      Hold Payment
                    </Button>
                    <Button
                      variant="primary"
                      size="small"
                      disabled
                      title="An accounting adapter and reconciliation receipt are required."
                    >
                      Apply Offset Credit
                    </Button>
                    <Button
                      variant="secondary"
                      size="small"
                      disabled
                      title="A reason-entry and optimistic-concurrency workflow must be completed."
                    >
                      Dismiss Case
                    </Button>
                  </div>
                  <Text className="text-xs text-ui-fg-muted">
                    Last updated: {new Date(inspectedLeak.updated_at).toLocaleString()}
                  </Text>
                </div>
              </Container>
            )}
          </div>
        )}

        {/* TAB 2: HISTORICAL SHADOW SCANNER */}
        {activeTab === 'shadow' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between bg-ui-bg-base p-4 rounded-lg border border-ui-border-base shadow-2xs">
              <div>
                <Heading level="h2" className="text-base font-bold">
                  Durable Historical Ingestion Scans
                </Heading>
                <Text className="text-xs text-ui-fg-muted">
                  Scan history remains empty until a versioned source contract supplies tenant
                  records.
                </Text>
              </div>
              <Button
                variant="primary"
                size="small"
                disabled
                title="Connect an authoritative source contract before scanning."
              >
                Source connection required
              </Button>
            </div>

            <Container className="p-0 bg-ui-bg-base border border-ui-border-base rounded-lg overflow-hidden shadow-2xs">
              <Table>
                <Table.Header>
                  <Table.Row>
                    <Table.HeaderCell>Scan ID & Name</Table.HeaderCell>
                    <Table.HeaderCell>Records Evaluated</Table.HeaderCell>
                    <Table.HeaderCell>Discrepancies Found</Table.HeaderCell>
                    <Table.HeaderCell>Potential Recovery</Table.HeaderCell>
                    <Table.HeaderCell>Duration</Table.HeaderCell>
                    <Table.HeaderCell>Timestamp</Table.HeaderCell>
                    <Table.HeaderCell>Status</Table.HeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {scans.map((scan) => (
                    <Table.Row key={scan.id}>
                      <Table.Cell>
                        <div className="font-mono font-semibold text-sm">{scan.id}</div>
                        <div className="text-xs text-ui-fg-muted">{scan.scan_name}</div>
                      </Table.Cell>
                      <Table.Cell className="font-mono text-sm">{scan.records_scanned}</Table.Cell>
                      <Table.Cell className="font-mono text-sm">{scan.leaks_found}</Table.Cell>
                      <Table.Cell className="font-mono font-semibold text-sm text-emerald-600">
                        {formatCurrency(scan.potential_recovery_usd)}
                      </Table.Cell>
                      <Table.Cell className="font-mono text-xs text-ui-fg-muted">
                        {scan.duration_ms}ms
                      </Table.Cell>
                      <Table.Cell className="text-xs text-ui-fg-muted">
                        {new Date(scan.created_at).toLocaleString()}
                      </Table.Cell>
                      <Table.Cell>
                        <Badge color="green" size="small">
                          {scan.status}
                        </Badge>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                  {scans.length === 0 && (
                    <Table.Row>
                      <Table.Cell
                        className="text-center py-8 text-ui-fg-muted"
                        {...({ colSpan: 7 } as any)}
                      >
                        No historical scan sessions recorded for this tenant.
                      </Table.Cell>
                    </Table.Row>
                  )}
                </Table.Body>
              </Table>
            </Container>
          </div>
        )}

        {/* TAB 3: VENDOR RECOVERY CLAIMS */}
        {activeTab === 'claims' && (
          <div className="space-y-6">
            <div className="bg-ui-bg-base p-4 rounded-lg border border-ui-border-base shadow-2xs">
              <Heading level="h2" className="text-base font-bold">
                Vendor Recovery Claims & Proof-of-Settlement Ledger
              </Heading>
              <Text className="text-xs text-ui-fg-muted">
                Claims appear only after verified delivery and settlement evidence is stored.
              </Text>
            </div>

            <Container className="p-0 bg-ui-bg-base border border-ui-border-base rounded-lg overflow-hidden shadow-2xs">
              <Table>
                <Table.Header>
                  <Table.Row>
                    <Table.HeaderCell>Claim # & Vendor</Table.HeaderCell>
                    <Table.HeaderCell>Claim Amount</Table.HeaderCell>
                    <Table.HeaderCell>Settlement Method</Table.HeaderCell>
                    <Table.HeaderCell>Evidence Hash (SHA-256)</Table.HeaderCell>
                    <Table.HeaderCell>Status</Table.HeaderCell>
                    <Table.HeaderCell className="text-right">Actions</Table.HeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {claims.map((claim) => (
                    <Table.Row key={claim.id}>
                      <Table.Cell>
                        <div className="font-mono font-bold text-sm">{claim.claim_number}</div>
                        <div className="text-xs text-ui-fg-muted">
                          {claim.vendor_name} ({claim.vendor_contact_email})
                        </div>
                      </Table.Cell>
                      <Table.Cell className="font-mono font-bold text-sm">
                        {formatCurrency(claim.claim_amount_usd)}
                      </Table.Cell>
                      <Table.Cell>
                        <Badge color="blue" size="small">
                          {claim.settlement_type}
                        </Badge>
                      </Table.Cell>
                      <Table.Cell>
                        <span
                          className="font-mono text-[11px] text-ui-fg-subtle block max-w-[200px] truncate"
                          title={claim.evidence_hash}
                        >
                          {claim.evidence_hash}
                        </span>
                      </Table.Cell>
                      <Table.Cell>
                        <StatusBadge color={claim.status === 'SETTLED' ? 'purple' : 'blue'}>
                          {claim.status}
                        </StatusBadge>
                      </Table.Cell>
                      <Table.Cell className="text-right">
                        {claim.status !== 'SETTLED' ? (
                          <Button
                            variant="primary"
                            size="small"
                            disabled
                            title="Verified settlement evidence and reconciliation are required."
                            className="text-xs"
                          >
                            Settlement evidence required
                          </Button>
                        ) : (
                          <Badge color="green" size="small">
                            Reconciled
                          </Badge>
                        )}
                      </Table.Cell>
                    </Table.Row>
                  ))}
                  {claims.length === 0 && (
                    <Table.Row>
                      <Table.Cell
                        className="text-center py-8 text-ui-fg-muted"
                        {...({ colSpan: 6 } as any)}
                      >
                        No recovery claims dispatched yet.
                      </Table.Cell>
                    </Table.Row>
                  )}
                </Table.Body>
              </Table>
            </Container>
          </div>
        )}

        {/* TAB 4: ACCURACY PROTOCOL & GOVERNANCE */}
        {activeTab === 'sla' && (
          <Container className="p-6 bg-ui-bg-base border border-ui-border-base rounded-lg shadow-2xs space-y-4">
            <Heading level="h2" className="text-lg font-bold">
              Recovery source and action requirements
            </Heading>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              <div className="p-4 rounded-lg bg-ui-bg-subtle border border-ui-border-base space-y-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-500" />
                  <span className="font-semibold text-sm">Detection contract required</span>
                </div>
                <p className="text-xs text-ui-fg-muted">
                  A detector may create a finding only from versioned tenant source records with a
                  reproducible rule result and evidence references.
                </p>
              </div>

              <div className="p-4 rounded-lg bg-ui-bg-subtle border border-ui-border-base space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircleSolid className="h-4 w-4 text-indigo-500" />
                  <span className="font-semibold text-sm">Value approval required</span>
                </div>
                <p className="text-xs text-ui-fg-muted">
                  Potential exposure, avoided loss and realized recovery remain separate. Realized
                  value requires settlement evidence and finance approval.
                </p>
              </div>

              <div className="p-4 rounded-lg bg-ui-bg-subtle border border-ui-border-base space-y-2">
                <div className="flex items-center gap-2">
                  <BuildingTax className="h-4 w-4 text-blue-500" />
                  <span className="font-semibold text-sm">Provider receipt required</span>
                </div>
                <p className="text-xs text-ui-fg-muted">
                  Payment holds, credits, claims and settlements stay unavailable until an external
                  adapter returns a verifiable receipt and supports reconciliation.
                </p>
              </div>
            </div>
          </Container>
        )}
      </div>
    </div>
  );
}
