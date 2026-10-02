'use client';

import { workforceApi } from '@/lib/workforce-api';
import type { WfoComplianceAuditReportItemV1, WfoComplianceDashboardSummaryV1 } from '@gigalibs/contracts';
import {
  Alert,
  Badge,
  Button,
  Container,
  Heading,
  StatusBadge,
  Table,
  Text,
} from '@medusajs/ui';
import { useCallback, useEffect, useState } from 'react';

export function WfoComplianceDashboard() {
  const [summary, setSummary] = useState<WfoComplianceDashboardSummaryV1 | null>(null);
  const [verifyQueue, setVerifyQueue] = useState<any[]>([]);
  const [auditReport, setAuditReport] = useState<WfoComplianceAuditReportItemV1[]>([]);
  const [activeTab, setActiveTab] = useState<'queue' | 'audit'>('queue');
  const [loading, setLoading] = useState(true);
  const [actionAlert, setActionAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [sum, queue, audit] = await Promise.all([
        workforceApi.wfoGetComplianceDashboard(),
        workforceApi.wfoGetComplianceVerifyQueue().catch(() => []),
        workforceApi.wfoGetComplianceAuditReport().catch(() => []),
      ]);
      setSummary(sum || null);
      setVerifyQueue(queue || []);
      setAuditReport(audit || []);
    } catch (err: any) {
      console.error('Failed to load compliance data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleVerify = async (workerId: string, docId: string, decision: 'APPROVE' | 'REJECT') => {
    try {
      await workforceApi.wfoVerifyComplianceDoc(workerId, docId, { decision });
      setActionAlert({
        type: 'success',
        message: `Document successfully ${decision === 'APPROVE' ? 'verified & approved' : 'rejected'}.`,
      });
      await loadData();
    } catch (err: any) {
      setActionAlert({
        type: 'error',
        message: err.message || 'Error updating document verification status.',
      });
    }
  };

  const handleExportCsv = () => {
    if (auditReport.length === 0) return;
    const headers = ['Worker Name', 'Email', 'Document Type', 'Document Number', 'Status', 'Expires At', 'Verified At', 'Verified By'];
    const rows = auditReport.map((r) => [
      `"${r.workerName}"`,
      `"${r.email}"`,
      `"${r.documentType}"`,
      `"${r.documentNumber || ''}"`,
      `"${r.status}"`,
      `"${r.expiresAt || ''}"`,
      `"${r.verifiedAt || ''}"`,
      `"${r.verifiedBy || ''}"`,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `compliance_audit_report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Heading level="h2" className="text-xl font-bold">Universal Compliance & Assurance</Heading>
          <Text className="text-ui-fg-subtle text-sm">
            Regulatory credentials, licences, certifications, and verification governance.
          </Text>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-ui-bg-subtle p-1 rounded-md border border-ui-border-base gap-1">
            <Button
              size="small"
              variant={activeTab === 'queue' ? 'primary' : 'transparent'}
              onClick={() => setActiveTab('queue')}
            >
              Verification Queue ({verifyQueue.length})
            </Button>
            <Button
              size="small"
              variant={activeTab === 'audit' ? 'primary' : 'transparent'}
              onClick={() => setActiveTab('audit')}
            >
              Audit Report ({auditReport.length})
            </Button>
          </div>
          {activeTab === 'audit' && (
            <Button size="small" variant="secondary" onClick={handleExportCsv}>
              Export Audit CSV
            </Button>
          )}
        </div>
      </div>

      {actionAlert && (
        <Alert variant={actionAlert.type === 'success' ? 'success' : 'error'}>
          {actionAlert.message}
        </Alert>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Container className="p-4 bg-ui-bg-base border border-ui-border-base rounded-lg">
          <Text className="text-xs font-semibold text-ui-fg-subtle uppercase">Total Workers</Text>
          <div className="text-2xl font-bold mt-1 text-ui-fg-base">{summary?.totalWorkers ?? 0}</div>
          <Text className="text-xs text-ui-fg-muted mt-1">{summary?.compliantWorkers ?? 0} fully compliant</Text>
        </Container>

        <Container className="p-4 bg-ui-bg-base border border-ui-border-base rounded-lg">
          <Text className="text-xs font-semibold text-ui-fg-subtle uppercase">Compliance Rate</Text>
          <div className="text-2xl font-bold mt-1 text-ui-fg-base">{summary?.complianceRatePct ?? 0}%</div>
          <div className="flex items-center gap-2 mt-1">
            <Badge color={(summary?.complianceRatePct ?? 0) >= 90 ? 'green' : 'orange'}>
              {(summary?.complianceRatePct ?? 0) >= 90 ? 'Optimal' : 'Action Required'}
            </Badge>
          </div>
        </Container>

        <Container className="p-4 bg-ui-bg-base border border-ui-border-base rounded-lg">
          <Text className="text-xs font-semibold text-ui-fg-subtle uppercase">Pending Verification</Text>
          <div className="text-2xl font-bold mt-1 text-ui-tag-orange-text">
            {summary?.pendingDocumentsCount ?? 0} docs
          </div>
          <Text className="text-xs text-ui-fg-muted mt-1">Awaiting reviewer sign-off</Text>
        </Container>

        <Container className="p-4 bg-ui-bg-base border border-ui-border-base rounded-lg">
          <Text className="text-xs font-semibold text-ui-fg-subtle uppercase">Expiring in 30 Days</Text>
          <div className={`text-2xl font-bold mt-1 ${(summary?.expiring30DaysCount ?? 0) > 0 ? 'text-ui-tag-red-text' : 'text-ui-fg-base'}`}>
            {summary?.expiring30DaysCount ?? 0} docs
          </div>
          <Text className="text-xs text-ui-fg-muted mt-1">Renewal notices queued</Text>
        </Container>
      </div>

      {/* Tab 1: Verification Queue */}
      {activeTab === 'queue' && (
        <Container className="p-0 overflow-hidden border border-ui-border-base rounded-lg bg-ui-bg-base">
          <div className="p-4 border-b border-ui-border-base flex justify-between items-center">
            <div>
              <Heading level="h3" className="text-base font-semibold">Document Verification Queue</Heading>
              <Text className="text-xs text-ui-fg-subtle">Review uploaded certificates, IDs, and licenses</Text>
            </div>
            <Badge color="orange">{verifyQueue.length} Pending</Badge>
          </div>

          {loading ? (
            <div className="p-8 text-center text-ui-fg-muted text-sm">Loading verification items...</div>
          ) : verifyQueue.length === 0 ? (
            <div className="p-8 text-center text-ui-fg-muted text-sm">Verification queue is clear! All documents verified.</div>
          ) : (
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Worker</Table.HeaderCell>
                  <Table.HeaderCell>Document Type</Table.HeaderCell>
                  <Table.HeaderCell>Document ID / Number</Table.HeaderCell>
                  <Table.HeaderCell>Expiry Date</Table.HeaderCell>
                  <Table.HeaderCell>Uploaded</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">Action</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {verifyQueue.map((doc) => (
                  <Table.Row key={doc.id} className="hover:bg-ui-bg-subtle-hover">
                    <Table.Cell className="font-medium text-ui-fg-base">{doc.workerName}</Table.Cell>
                    <Table.Cell><Badge color="purple">{doc.documentType}</Badge></Table.Cell>
                    <Table.Cell className="font-mono text-xs">{doc.documentNumber || '—'}</Table.Cell>
                    <Table.Cell className="text-xs">{doc.expiresAt ? new Date(doc.expiresAt).toLocaleDateString() : 'No expiry'}</Table.Cell>
                    <Table.Cell className="text-xs text-ui-fg-muted">{new Date(doc.createdAt).toLocaleDateString()}</Table.Cell>
                    <Table.Cell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="small" variant="primary" onClick={() => handleVerify(doc.workerId, doc.id, 'APPROVE')}>
                          Verify
                        </Button>
                        <Button size="small" variant="danger" onClick={() => handleVerify(doc.workerId, doc.id, 'REJECT')}>
                          Reject
                        </Button>
                      </div>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          )}
        </Container>
      )}

      {/* Tab 2: Audit Report */}
      {activeTab === 'audit' && (
        <Container className="p-0 overflow-hidden border border-ui-border-base rounded-lg bg-ui-bg-base">
          <div className="p-4 border-b border-ui-border-base flex justify-between items-center">
            <div>
              <Heading level="h3" className="text-base font-semibold">Compliance Audit Ledger</Heading>
              <Text className="text-xs text-ui-fg-subtle">Complete verifiable history with timestamps and approvers</Text>
            </div>
            <Badge color="grey">{auditReport.length} Records</Badge>
          </div>

          {loading ? (
            <div className="p-8 text-center text-ui-fg-muted text-sm">Generating compliance audit ledger...</div>
          ) : auditReport.length === 0 ? (
            <div className="p-8 text-center text-ui-fg-muted text-sm">No compliance audit records found.</div>
          ) : (
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Worker</Table.HeaderCell>
                  <Table.HeaderCell>Email</Table.HeaderCell>
                  <Table.HeaderCell>Document Type</Table.HeaderCell>
                  <Table.HeaderCell>Document Number</Table.HeaderCell>
                  <Table.HeaderCell>Status</Table.HeaderCell>
                  <Table.HeaderCell>Expiry Date</Table.HeaderCell>
                  <Table.HeaderCell>Verified By</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {auditReport.map((row, idx) => (
                  <Table.Row key={`${row.workerId}-${idx}`} className="hover:bg-ui-bg-subtle-hover">
                    <Table.Cell className="font-medium text-ui-fg-base">{row.workerName}</Table.Cell>
                    <Table.Cell className="text-ui-fg-subtle text-xs">{row.email}</Table.Cell>
                    <Table.Cell><Badge color="grey">{row.documentType}</Badge></Table.Cell>
                    <Table.Cell className="font-mono text-xs">{row.documentNumber || '—'}</Table.Cell>
                    <Table.Cell>
                      <StatusBadge color={row.status === 'VERIFIED' ? 'green' : row.status === 'PENDING' ? 'orange' : 'red'}>
                        {row.status}
                      </StatusBadge>
                    </Table.Cell>
                    <Table.Cell className="text-xs">{row.expiresAt ? new Date(row.expiresAt).toLocaleDateString() : 'N/A'}</Table.Cell>
                    <Table.Cell className="text-xs text-ui-fg-muted">{row.verifiedBy || 'Pending'}</Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          )}
        </Container>
      )}
    </div>
  );
}
