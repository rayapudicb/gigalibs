'use client';

import { workforceApi } from '@/lib/workforce-api';
import { ArrowDownTray, ArrowUpTray } from '@medusajs/icons';
import {
  Alert,
  Button,
  Container,
  Heading,
  StatusBadge,
  Table,
  Text,
  Textarea,
} from '@medusajs/ui';
import { type FormEvent, useState } from 'react';

export function BulkInviteModal({
  engagementId,
  onClose,
  onSuccess,
}: {
  engagementId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [csvContent, setCsvContent] = useState('');
  const [preview, setPreview] = useState<{
    validCount: number;
    errorCount: number;
    details: any[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  async function downloadTemplate() {
    setDownloading(true);
    try {
      const res = await fetch(
        `/api/workforce/wfo/engagements/${encodeURIComponent(engagementId)}/invitations/template`,
      );
      const csv = await res.text();
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `invitations_template_${engagementId.slice(0, 8)}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      setError('Failed to download CSV template');
    } finally {
      setDownloading(false);
    }
  }

  function parseCsvRows(text: string) {
    const lines = text.trim().split('\n').filter(Boolean);
    if (lines.length <= 1) return [];
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',').map((p) => p.trim());
      if (parts[0]) {
        rows.push({
          email: parts[0],
          firstName: parts[1] || 'Crew',
          lastName: parts[2] || 'Member',
          phone: parts[3] || undefined,
          positionCode: parts[4] || 'General',
          rateOverride: parts[5] ? Number(parts[5]) : undefined,
          notes: parts[6] || undefined,
        });
      }
    }
    return rows;
  }

  async function handlePreview() {
    const rows = parseCsvRows(csvContent);
    if (rows.length === 0) {
      setError('Please paste or enter CSV data with at least one crew member.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await workforceApi.wfoPreviewBulkInvitations(engagementId, rows);
      setPreview(res);
    } catch (err: any) {
      setError(err.message || 'Validation failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit() {
    const rows = parseCsvRows(csvContent);
    setSubmitting(true);
    setError(null);
    try {
      await workforceApi.wfoSubmitBulkInvitations(engagementId, rows);
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Container className="w-full max-w-3xl space-y-4 p-6 bg-ui-bg-base">
        <div className="flex items-center justify-between">
          <Heading level="h2">Bulk Crew Invitation Upload</Heading>
          <Button size="small" variant="secondary" onClick={onClose}>Close</Button>
        </div>

        <Text size="small" className="text-ui-fg-subtle">
          1. Download the formatted CSV template containing this engagement's roles.<br />
          2. Fill in or copy-paste your crew details.<br />
          3. Preview and validate before sending out invitations.
        </Text>

        <div className="flex gap-3">
          <Button size="small" variant="secondary" isLoading={downloading} onClick={downloadTemplate}>
            <ArrowDownTray /> Download CSV template
          </Button>
        </div>

        <div>
          <Textarea
            rows={6}
            placeholder="Paste CSV rows here (e.g. Email*,FirstName*,LastName*,Phone,PositionCode*,RateOverride,Notes)"
            value={csvContent}
            onChange={(e) => setCsvContent(e.target.value)}
            className="font-mono text-xs"
          />
        </div>

        <div className="flex gap-2">
          <Button size="small" isLoading={loading} onClick={handlePreview}>
            <ArrowUpTray /> Preview & Validate
          </Button>
          {preview && preview.validCount > 0 && (
            <Button size="small" variant="primary" isLoading={submitting} onClick={handleSubmit}>
              Confirm and send {preview.validCount} invitations
            </Button>
          )}
        </div>

        {error && <Alert variant="error">{error}</Alert>}

        {preview && (
          <div className="space-y-3">
            <div className="flex gap-4 txt-compact-small">
              <span className="text-ui-fg-interactive font-medium">Valid: {preview.validCount}</span>
              <span className="text-ui-fg-error font-medium">Errors: {preview.errorCount}</span>
            </div>

            <div className="max-h-48 overflow-y-auto border border-ui-border-base rounded-md">
              <Table>
                <Table.Header>
                  <Table.Row>
                    <Table.HeaderCell>Row</Table.HeaderCell>
                    <Table.HeaderCell>Email</Table.HeaderCell>
                    <Table.HeaderCell>Status</Table.HeaderCell>
                    <Table.HeaderCell>Notes</Table.HeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {preview.details.map((d) => (
                    <Table.Row key={d.row}>
                      <Table.Cell>{d.row}</Table.Cell>
                      <Table.Cell className="font-mono text-xs">{d.email}</Table.Cell>
                      <Table.Cell>
                        <StatusBadge color={d.valid ? 'green' : 'red'}>
                          {d.valid ? 'Ready' : 'Invalid'}
                        </StatusBadge>
                      </Table.Cell>
                      <Table.Cell className="text-xs text-ui-fg-subtle">{d.reason || '—'}</Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table>
            </div>
          </div>
        )}
      </Container>
    </div>
  );
}
