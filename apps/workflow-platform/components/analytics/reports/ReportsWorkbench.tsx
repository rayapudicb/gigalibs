'use client';

/**
 * WI-OI-103e (ADR-0016 F11) & WI-OI-106 (ADR-0016 F17): Analytics-owned reports. A report is a saved chart or a dashboard exported
 * as CSV, typed Excel (XLSX) or server-rendered PDF; each run re-asks the stored questions with the member's rights. Creating
 * and running need analytics:reports:write; downloading needs analytics:export. WI-OI-104c: a report can run on a schedule, held
 * by the kernel and run as its owner; email delivery comes later.
 * Reports v2 provides multi-format support (CSV, Excel/XLSX, PDF), durable run history, safe token renewal,
 * accessible format controls, and live status announcements.
 */

import React, { Fragment, useCallback, useEffect, useState } from 'react';
import { Alert, Badge, Button, Container, Heading, Input, Label, Table, Text } from '@medusajs/ui';
import type {
  ChartViewV1,
  CreateReportV1,
  DashboardSummaryV1,
  ReportDownloadTokenV1,
  ReportFormatV1,
  ReportRunV1,
  ReportV1,
} from '@gigalibs/contracts';
import { SchedulePanel } from '@/components/schedules/SchedulePanel';
import { analyticsApi } from '../explore/analytics-api';

const selectClass =
  'w-full rounded-md border border-ui-border-base bg-ui-bg-field px-2 py-1.5 text-sm text-ui-fg-base focus:outline-none focus:ring-2 focus:ring-ui-border-interactive';

const STATUS_COLOR: Record<ReportRunV1['status'], 'green' | 'red' | 'orange' | 'grey'> = {
  SUCCEEDED: 'green',
  FAILED: 'red',
  RUNNING: 'orange',
  QUEUED: 'grey',
};

const ALL_FORMATS: ReadonlyArray<ReportFormatV1> = ['CSV', 'XLSX', 'PDF'];

export function ReportsWorkbench({ canWrite, canExport }: { canWrite: boolean; canExport: boolean }) {
  const [reports, setReports] = useState<ReportV1[] | null>(null);
  const [views, setViews] = useState<ChartViewV1[]>([]);
  const [dashboards, setDashboards] = useState<DashboardSummaryV1[]>([]);
  const [name, setName] = useState('');
  const [source, setSource] = useState('');
  const [formats, setFormats] = useState<ReportFormatV1[]>(['CSV']);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<string>('');

  // Expandable run history state
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null);
  const [historyRuns, setHistoryRuns] = useState<Record<string, ReportRunV1[]>>({});
  const [historyLoading, setHistoryLoading] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<Record<string, string>>({});

  // Editing formats state
  const [editingFormatsId, setEditingFormatsId] = useState<string | null>(null);
  const [editFormatsSelected, setEditFormatsSelected] = useState<ReportFormatV1[]>(['CSV']);
  const [editFormatsBusy, setEditFormatsBusy] = useState(false);

  // Downloading state
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const toggleFormat = (fmt: ReportFormatV1) => {
    setFormats((current) => {
      if (current.includes(fmt)) {
        if (current.length === 1) return current; // Keep at least one
        return current.filter((f) => f !== fmt);
      }
      return [...current, fmt];
    });
  };

  const toggleEditFormat = (fmt: ReportFormatV1) => {
    setEditFormatsSelected((current) => {
      if (current.includes(fmt)) {
        if (current.length === 1) return current;
        return current.filter((f) => f !== fmt);
      }
      return [...current, fmt];
    });
  };

  const refresh = useCallback(() => {
    analyticsApi<ReportV1[]>('v1/reports/definitions')
      .then(setReports)
      .catch((cause: Error) => {
        setReports([]);
        setError(cause.message);
      });
  }, []);

  useEffect(() => {
    refresh();
    if (!canWrite) return;
    analyticsApi<ChartViewV1[]>('v1/chart-views').then(setViews).catch(() => setViews([]));
    analyticsApi<DashboardSummaryV1[]>('v1/dashboards').then(setDashboards).catch(() => setDashboards([]));
  }, [refresh, canWrite]);

  const loadHistory = useCallback(async (reportId: string) => {
    setHistoryLoading(reportId);
    setHistoryError((prev) => ({ ...prev, [reportId]: '' }));
    try {
      const runs = await analyticsApi<ReportRunV1[]>(`v1/reports/definitions/${reportId}/runs`);
      setHistoryRuns((prev) => ({ ...prev, [reportId]: runs }));
    } catch (cause) {
      setHistoryError((prev) => ({ ...prev, [reportId]: (cause as Error).message || 'Failed to load run history' }));
    } finally {
      setHistoryLoading(null);
    }
  }, []);

  const toggleHistory = (reportId: string) => {
    if (expandedHistory === reportId) {
      setExpandedHistory(null);
    } else {
      setExpandedHistory(reportId);
      if (!historyRuns[reportId]) {
        void loadHistory(reportId);
      }
    }
  };

  const create = async () => {
    const [kind, id] = source.split(':');
    const body: CreateReportV1 = {
      name: name.trim(),
      source: kind === 'dashboard' ? { dashboardId: id! } : { chartViewId: id! },
      formats,
    };
    setBusy('create');
    setError(null);
    try {
      await analyticsApi('v1/reports/definitions', { method: 'POST', body: JSON.stringify(body) });
      const createdName = name.trim();
      setName('');
      setSource('');
      setFormats(['CSV']);
      setAnnouncement(`Report "${createdName}" created with formats ${formats.join(', ')}.`);
      refresh();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const run = async (report: ReportV1) => {
    setBusy(report.id);
    setError(null);
    try {
      const result = await analyticsApi<ReportRunV1>('v1/reports/runs', {
        method: 'POST',
        body: JSON.stringify({ reportDefinitionId: report.id }),
      });
      if (result.status === 'FAILED') {
        setError(`${report.name}: ${result.errorMessage ?? 'the run failed.'}`);
      }
      setAnnouncement(`Report run triggered for "${report.name}".`);
      refresh();
      // If history is open for this report, refresh history too
      if (expandedHistory === report.id) {
        void loadHistory(report.id);
      }
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const startEditFormats = (report: ReportV1) => {
    setEditingFormatsId(report.id);
    setEditFormatsSelected(report.formats && report.formats.length > 0 ? [...report.formats] : ['CSV']);
  };

  const saveEditFormats = async (report: ReportV1) => {
    setEditFormatsBusy(true);
    setError(null);
    try {
      await analyticsApi(`v1/reports/definitions/${report.id}/formats`, {
        method: 'PATCH',
        body: JSON.stringify({ formats: editFormatsSelected }),
      });
      setAnnouncement(`Formats updated for "${report.name}".`);
      setEditingFormatsId(null);
      refresh();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setEditFormatsBusy(false);
    }
  };

  const downloadFile = async (runId: string, format: ReportFormatV1, reportName: string) => {
    const key = `${runId}:${format}`;
    setDownloadingKey(key);
    setDownloadError(null);
    setAnnouncement(`Requesting download token for ${format} of "${reportName}"...`);
    try {
      const tokenGrant = await analyticsApi<ReportDownloadTokenV1>(
        `v1/reports/runs/${runId}/files/${format}/download-token`,
        { method: 'POST' },
      );
      setAnnouncement(`Downloading ${format} file for "${reportName}"...`);
      const downloadUrl = `/api/analytics/v1/reports/download/${tokenGrant.token}`;
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = tokenGrant.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (cause) {
      setDownloadError((cause as Error).message || 'Failed to generate download token. Please retry.');
    } finally {
      setDownloadingKey(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Live announcement region for accessibility */}
      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>

      {canWrite ? (
        <Container className="flex flex-col gap-3 p-5">
          <Heading level="h2">New report</Heading>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="report-name">Name</Label>
              <Input id="report-name" value={name} maxLength={200} onChange={(event) => setName(event.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="report-source">From</Label>
              <select id="report-source" className={selectClass} value={source} onChange={(event) => setSource(event.target.value)}>
                <option value="">Choose a saved chart or dashboard</option>
                {views.length > 0 ? (
                  <optgroup label="Saved charts">
                    {views.map((view) => (
                      <option key={view.id} value={`chart:${view.id}`}>{view.name}</option>
                    ))}
                  </optgroup>
                ) : null}
                {dashboards.length > 0 ? (
                  <optgroup label="Dashboards">
                    {dashboards.map((dashboard) => (
                      <option key={dashboard.id} value={`dashboard:${dashboard.id}`}>{dashboard.name}</option>
                    ))}
                  </optgroup>
                ) : null}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label id="formats-label">Formats</Label>
              <div className="flex items-center gap-3 py-1.5" role="group" aria-labelledby="formats-label" aria-label="Report formats">
                {ALL_FORMATS.map((fmt) => (
                  <label key={fmt} className="flex items-center gap-1.5 text-sm cursor-pointer text-ui-fg-base">
                    <input
                      type="checkbox"
                      checked={formats.includes(fmt)}
                      onChange={() => toggleFormat(fmt)}
                      className="rounded border-ui-border-base text-ui-fg-interactive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-border-interactive focus:ring-ui-border-interactive"
                    />
                    <span>{fmt === 'XLSX' ? 'Excel' : fmt}</span>
                  </label>
                ))}
              </div>
            </div>
            <Button
              type="button"
              isLoading={busy === 'create'}
              disabled={busy !== null || !name.trim() || !source || formats.length === 0}
              onClick={() => void create()}
            >
              Create report
            </Button>
          </div>
          <Text size="xsmall" className="text-ui-fg-subtle">
            A report stores which chart or dashboard to export, never the data: each run asks again and produces fresh
            CSV, Excel or PDF files. Open Schedule on a report to run it every day, week or month; email delivery is not available yet.
          </Text>
        </Container>
      ) : null}

      {error ? <Alert variant="error">{error}</Alert> : null}
      {downloadError ? <Alert variant="error">{downloadError}</Alert> : null}

      <Container className="flex flex-col gap-3 p-5">
        <Heading level="h2">Reports</Heading>
        {reports === null ? (
          <Text size="small" className="text-ui-fg-subtle">Loading…</Text>
        ) : reports.length === 0 ? (
          <Text size="small" className="text-ui-fg-subtle">
            No reports yet.{canWrite ? ' Create one from a saved chart or a dashboard above.' : ''}
          </Text>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Name</Table.HeaderCell>
                  <Table.HeaderCell>From</Table.HeaderCell>
                  <Table.HeaderCell>Formats</Table.HeaderCell>
                  <Table.HeaderCell>Last run</Table.HeaderCell>
                  <Table.HeaderCell />
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {reports.map((report) => {
                  const isEditingFormats = editingFormatsId === report.id;
                  const isHistoryExpanded = expandedHistory === report.id;
                  const isScheduling = scheduling === report.id;

                  return (
                    <Fragment key={report.id}>
                      <Table.Row>
                        <Table.Cell>{report.name}</Table.Cell>
                        <Table.Cell>
                          <Text size="small">{report.source.name}</Text>
                          <Text size="xsmall" className="text-ui-fg-subtle">
                            {report.source.kind === 'dashboard' ? 'Dashboard' : report.source.kind === 'chart_view' ? 'Saved chart' : 'Retired chart'}
                          </Text>
                        </Table.Cell>
                        <Table.Cell>
                          {isEditingFormats ? (
                            <div className="flex flex-col gap-2">
                              <div className="flex items-center gap-2" role="group" aria-label={`Edit formats for ${report.name}`}>
                                {ALL_FORMATS.map((fmt) => (
                                  <label key={fmt} className="flex items-center gap-1 text-xs cursor-pointer text-ui-fg-base">
                                    <input
                                      type="checkbox"
                                      checked={editFormatsSelected.includes(fmt)}
                                      onChange={() => toggleEditFormat(fmt)}
                                      className="rounded border-ui-border-base text-ui-fg-interactive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-border-interactive focus:ring-ui-border-interactive"
                                    />
                                    <span>{fmt === 'XLSX' ? 'Excel' : fmt}</span>
                                  </label>
                                ))}
                              </div>
                              <div className="flex items-center gap-1.5">
                                <Button
                                  type="button"
                                  size="small"
                                  variant="secondary"
                                  isLoading={editFormatsBusy}
                                  disabled={editFormatsBusy || editFormatsSelected.length === 0}
                                  onClick={() => void saveEditFormats(report)}
                                >
                                  Save
                                </Button>
                                <Button
                                  type="button"
                                  size="small"
                                  variant="transparent"
                                  disabled={editFormatsBusy}
                                  onClick={() => setEditingFormatsId(null)}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-wrap items-center gap-1.5">
                              {(report.formats ?? ['CSV']).map((fmt) => (
                                <Badge key={fmt} size="2xsmall">{fmt === 'XLSX' ? 'Excel' : fmt}</Badge>
                              ))}
                              {canWrite ? (
                                <button
                                  type="button"
                                  onClick={() => startEditFormats(report)}
                                  className="text-xs text-ui-fg-interactive hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ui-border-interactive ml-1"
                                  aria-label={`Edit formats for ${report.name}`}
                                >
                                  Edit
                                </button>
                              ) : null}
                            </div>
                          )}
                        </Table.Cell>
                        <Table.Cell>
                          {report.lastRun ? (
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-2">
                                <Badge size="2xsmall" color={STATUS_COLOR[report.lastRun.status]}>
                                  {report.lastRun.status.toLowerCase()}
                                </Badge>
                                <Text size="xsmall" className="tabular-nums text-ui-fg-subtle">
                                  {new Date(report.lastRun.queuedAt).toLocaleString()}
                                  {report.lastRun.rowCount !== null ? ` · ${report.lastRun.rowCount.toLocaleString()} rows` : ''}
                                </Text>
                              </div>
                              {report.lastRun.errorMessage ? (
                                <Text size="xsmall" className="text-ui-fg-error">{report.lastRun.errorMessage}</Text>
                              ) : null}
                            </div>
                          ) : (
                            <Text size="xsmall" className="text-ui-fg-subtle">Not run yet</Text>
                          )}
                        </Table.Cell>
                        <Table.Cell>
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              size="small"
                              variant="transparent"
                              aria-expanded={isHistoryExpanded}
                              onClick={() => toggleHistory(report.id)}
                            >
                              Run history
                            </Button>
                            <Button
                              type="button"
                              size="small"
                              variant="transparent"
                              aria-expanded={isScheduling}
                              onClick={() => setScheduling(isScheduling ? null : report.id)}
                            >
                              Schedule
                            </Button>
                            {canWrite ? (
                              <Button
                                type="button"
                                size="small"
                                variant="secondary"
                                isLoading={busy === report.id}
                                disabled={busy !== null}
                                onClick={() => void run(report)}
                              >
                                Run now
                              </Button>
                            ) : null}
                            {canExport && report.lastRun?.files && report.lastRun.files.length > 0 ? (
                              report.lastRun.files.map((file) => {
                                const dlKey = `${report.lastRun!.id}:${file.format}`;
                                return (
                                  <Button
                                    key={file.format}
                                    type="button"
                                    size="small"
                                    variant="secondary"
                                    isLoading={downloadingKey === dlKey}
                                    disabled={downloadingKey !== null}
                                    onClick={() => void downloadFile(report.lastRun!.id, file.format, report.name)}
                                  >
                                    Download {file.format === 'XLSX' ? 'Excel' : file.format}
                                  </Button>
                                );
                              })
                            ) : canExport && report.lastRun?.download ? (
                              <Button
                                type="button"
                                size="small"
                                variant="secondary"
                                isLoading={downloadingKey === `${report.lastRun.id}:CSV`}
                                disabled={downloadingKey !== null}
                                onClick={() => void downloadFile(report.lastRun!.id, 'CSV', report.name)}
                              >
                                Download CSV
                              </Button>
                            ) : null}
                          </div>
                        </Table.Cell>
                      </Table.Row>

                      {/* Expandable Run History Drawer */}
                      {isHistoryExpanded ? (
                        <Table.Row>
                          <td colSpan={5} className="bg-ui-bg-subtle px-6 py-4 border-t border-b border-ui-border-base">
                            <div className="flex flex-col gap-3">
                              <div className="flex items-center justify-between">
                                <Heading level="h3">Run history for {report.name}</Heading>
                                <Button
                                  type="button"
                                  size="small"
                                  variant="transparent"
                                  onClick={() => void loadHistory(report.id)}
                                  disabled={historyLoading === report.id}
                                >
                                  Refresh runs
                                </Button>
                              </div>

                              {historyLoading === report.id ? (
                                <Text size="small" className="text-ui-fg-subtle">Loading run history…</Text>
                              ) : historyError[report.id] ? (
                                <div className="flex items-center gap-3">
                                  <Text size="small" className="text-ui-fg-error">{historyError[report.id]}</Text>
                                  <Button
                                    type="button"
                                    size="small"
                                    variant="secondary"
                                    onClick={() => void loadHistory(report.id)}
                                  >
                                    Retry
                                  </Button>
                                </div>
                              ) : !historyRuns[report.id] || historyRuns[report.id]!.length === 0 ? (
                                <Text size="small" className="text-ui-fg-subtle">No runs recorded for this report yet.</Text>
                              ) : (
                                <div className="flex flex-col gap-2 max-h-96 overflow-y-auto">
                                  {historyRuns[report.id]!.map((runItem) => (
                                    <div
                                      key={runItem.id}
                                      className="flex items-center justify-between rounded-md border border-ui-border-base bg-ui-bg-base p-3 text-sm"
                                    >
                                      <div className="flex items-center gap-3">
                                        <Badge size="2xsmall" color={STATUS_COLOR[runItem.status]}>
                                          {runItem.status.toLowerCase()}
                                        </Badge>
                                        <Text size="small" className="tabular-nums">
                                          {new Date(runItem.queuedAt).toLocaleString()}
                                        </Text>
                                        {runItem.rowCount !== null ? (
                                          <Text size="small" className="text-ui-fg-subtle tabular-nums">
                                            {runItem.rowCount.toLocaleString()} rows
                                          </Text>
                                        ) : null}
                                        {runItem.errorMessage ? (
                                          <Text size="small" className="text-ui-fg-error">
                                            {runItem.errorMessage}
                                          </Text>
                                        ) : null}
                                      </div>

                                      <div className="flex items-center gap-2">
                                        {canExport && runItem.files && runItem.files.length > 0 ? (
                                          runItem.files.map((file) => {
                                            const dlKey = `${runItem.id}:${file.format}`;
                                            return (
                                              <Button
                                                key={file.format}
                                                type="button"
                                                size="small"
                                                variant="secondary"
                                                isLoading={downloadingKey === dlKey}
                                                disabled={downloadingKey !== null}
                                                onClick={() => void downloadFile(runItem.id, file.format, report.name)}
                                              >
                                                Download {file.format === 'XLSX' ? 'Excel' : file.format}
                                              </Button>
                                            );
                                          })
                                        ) : canExport && runItem.download ? (
                                          <Button
                                            type="button"
                                            size="small"
                                            variant="secondary"
                                            isLoading={downloadingKey === `${runItem.id}:CSV`}
                                            disabled={downloadingKey !== null}
                                            onClick={() => void downloadFile(runItem.id, 'CSV', report.name)}
                                          >
                                            Download CSV
                                          </Button>
                                        ) : null}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>
                        </Table.Row>
                      ) : null}

                      {/* Expandable Schedule Drawer */}
                      {isScheduling ? (
                        <Table.Row>
                          <td colSpan={5} className="bg-ui-bg-subtle px-6 py-3">
                            <SchedulePanel operation="analytics.report-run" targetId={report.id} targetName={report.name} />
                          </td>
                        </Table.Row>
                      ) : null}
                    </Fragment>
                  );
                })}
              </Table.Body>
            </Table>
          </div>
        )}
        {!canExport ? (
          <Text size="xsmall" className="text-ui-fg-subtle">Downloading a report needs the Analytics export permission.</Text>
        ) : null}
      </Container>
    </div>
  );
}
