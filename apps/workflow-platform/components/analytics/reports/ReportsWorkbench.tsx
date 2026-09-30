'use client';

/**
 * WI-OI-103e (ADR-0016 F11): Analytics-owned reports. A report is a saved chart or a dashboard exported as CSV; each
 * run re-asks the stored questions with the member's rights. Creating and running need analytics:reports:write;
 * downloading needs analytics:export. WI-OI-104c: a report can run on a schedule, held by the kernel and run as its
 * owner; email delivery comes later.
 */

import { Fragment, useCallback, useEffect, useState } from 'react';
import { Alert, Badge, Button, Container, Heading, Input, Label, Table, Text } from '@medusajs/ui';
import type { ChartViewV1, CreateReportV1, DashboardSummaryV1, ReportRunV1, ReportV1 } from '@gigalibs/contracts';
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

export function ReportsWorkbench({ canWrite, canExport }: { canWrite: boolean; canExport: boolean }) {
  const [reports, setReports] = useState<ReportV1[] | null>(null);
  const [views, setViews] = useState<ChartViewV1[]>([]);
  const [dashboards, setDashboards] = useState<DashboardSummaryV1[]>([]);
  const [name, setName] = useState('');
  const [source, setSource] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState<string | null>(null);

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

  const create = async () => {
    const [kind, id] = source.split(':');
    const body: CreateReportV1 = { name: name.trim(), source: kind === 'dashboard' ? { dashboardId: id! } : { chartViewId: id! } };
    setBusy('create');
    setError(null);
    try {
      await analyticsApi('v1/reports/definitions', { method: 'POST', body: JSON.stringify(body) });
      setName('');
      setSource('');
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
      if (result.status === 'FAILED') setError(`${report.name}: ${result.errorMessage ?? 'the run failed.'}`);
      refresh();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {canWrite ? (
        <Container className="flex flex-col gap-3 p-5">
          <Heading level="h2">New report</Heading>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
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
            <Button type="button" isLoading={busy === 'create'} disabled={busy !== null || !name.trim() || !source} onClick={() => void create()}>
              Create report
            </Button>
          </div>
          <Text size="xsmall" className="text-ui-fg-subtle">
            A report stores which chart or dashboard to export, never the data: each run asks again and produces a fresh
            CSV. Open Schedule on a report to run it every day, week or month; email delivery is not available yet.
          </Text>
        </Container>
      ) : null}

      {error ? <Alert variant="error">{error}</Alert> : null}

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
                  <Table.HeaderCell>Last run</Table.HeaderCell>
                  <Table.HeaderCell />
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {reports.map((report) => (
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
                      {report.lastRun ? (
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <Badge size="2xsmall" color={STATUS_COLOR[report.lastRun.status]}>{report.lastRun.status.toLowerCase()}</Badge>
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
                          aria-expanded={scheduling === report.id}
                          onClick={() => setScheduling(scheduling === report.id ? null : report.id)}
                        >
                          Schedule
                        </Button>
                        {canWrite ? (
                          <Button type="button" size="small" variant="secondary" isLoading={busy === report.id} disabled={busy !== null} onClick={() => void run(report)}>
                            Run now
                          </Button>
                        ) : null}
                        {canExport && report.lastRun?.download ? (
                          <Button size="small" variant="secondary" asChild>
                            <a href={`/api/analytics/v1/reports/download/${report.lastRun.download.token}`} download={report.lastRun.download.filename}>
                              Download CSV
                            </a>
                          </Button>
                        ) : null}
                      </div>
                    </Table.Cell>
                  </Table.Row>
                  {scheduling === report.id ? (
                    <Table.Row>
                      <td colSpan={4} className="bg-ui-bg-subtle px-6 py-3">
                        <SchedulePanel operation="analytics.report-run" targetId={report.id} targetName={report.name} />
                      </td>
                    </Table.Row>
                  ) : null}
                  </Fragment>
                ))}
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
