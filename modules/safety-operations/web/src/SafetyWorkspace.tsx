'use client';

import {
  type HazardCategoryV1,
  type HazardInsightsV1,
  type HazardReportV1,
  type HazardRouteV1,
  type HazardSeverityV1,
  type StopWorkAlertV1,
  hazardRisk,
  holdsPermission,
} from '@gigalibs/contracts';
import { Alert, Button, Container, Heading, Input, Label, StatusBadge, Table, Text, Textarea } from '@medusajs/ui';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { type SafetyApiError, safetyApi } from './safety-api';

// WI-OI-141 M-INC (ADR-0036). Safety Operations decides: triage is by someone other than the reporter, a stop-work
// alert is lifted by someone other than the person who stopped the work, and a report closes only when its alert is
// lifted and, when routed to investigation, the investigation is complete.

export interface SafetyWorkspaceProps {
  readonly permissions?: readonly string[];
}
type Tab = 'stop-work' | 'triage' | 'reports' | 'insights' | 'report';

const SEVERITY: Readonly<Record<HazardSeverityV1, { label: string; color: 'green' | 'orange' | 'red' }>> = {
  GOOD_CATCH: { label: 'Good catch', color: 'green' },
  UNSAFE_CONDITION: { label: 'Unsafe condition', color: 'orange' },
  STOP_WORK: { label: 'Stop work', color: 'red' },
};
const CATEGORY: Readonly<Record<HazardCategoryV1, string>> = {
  SLIP_TRIP_FALL: 'Slip, trip or fall', LEAK_SPILL: 'Leak or spill', ELECTRICAL: 'Electrical', MACHINE_GUARDING: 'Machine guarding',
  PINCH_POINT: 'Pinch point', CHEMICAL: 'Chemical', FIRE: 'Fire', ERGONOMIC: 'Ergonomic', VEHICLE: 'Vehicle',
  WORKING_AT_HEIGHT: 'Working at height', OTHER: 'Other',
};
const ROUTE: Readonly<Record<HazardRouteV1, string>> = {
  MAINTENANCE: 'Actionable maintenance', TRAINING: 'Training needed', INVESTIGATION: 'Root-cause investigation', RESOLVED: 'Resolved',
};
const BAND_COLOR = { LOW: 'green', MEDIUM: 'orange', HIGH: 'red', EXTREME: 'red' } as const;
const when = (value: string | null) => (value ? new Date(value).toLocaleString() : '—');

function Problem({ error }: { error: SafetyApiError | null }) {
  return error ? <Alert variant="error" role="alert" className="mt-2">{error.message}</Alert> : null;
}

export function SafetyWorkspace({ permissions = [] }: SafetyWorkspaceProps) {
  const can = useCallback((permission: string) => holdsPermission(permissions, permission), [permissions]);
  const [tab, setTab] = useState<Tab>(can('safety-operations.hazards.read') ? 'triage' : 'report');
  const [open, setOpen] = useState<string | null>(null);
  const tabs: readonly (readonly [Tab, string, boolean])[] = [
    ['stop-work', 'Stop work', can('safety-operations.hazards.report')],
    ['triage', 'Triage', can('safety-operations.hazards.triage')],
    ['reports', 'Reports', can('safety-operations.hazards.read')],
    ['insights', 'Insights', can('safety-operations.hazards.read')],
    ['report', 'Report a hazard', can('safety-operations.hazards.report')],
  ];
  if (open) return <ReportView reportId={open} can={can} onBack={() => setOpen(null)} />;
  return (
    <div className="flex flex-col gap-4">
      <StopWorkBanner can={can} />
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Safety views">
        {tabs.filter(([, , shown]) => shown).map(([key, label]) => (
          <Button key={key} type="button" size="small" role="tab" aria-selected={tab === key}
            variant={tab === key ? 'primary' : 'secondary'} onClick={() => setTab(key)}>{label}</Button>
        ))}
      </div>
      {tab === 'stop-work' ? <StopWork can={can} /> : null}
      {tab === 'triage' ? <ReportList status="REPORTED" title="Waiting for triage" onOpen={setOpen} /> : null}
      {tab === 'reports' ? <ReportList title="Reports (180 days)" onOpen={setOpen} exportable /> : null}
      {tab === 'insights' ? <Insights /> : null}
      {tab === 'report' ? <ReportForm onDone={setOpen} /> : null}
    </div>
  );
}

function StopWorkBanner({ can }: { can: (permission: string) => boolean }) {
  const [alerts, setAlerts] = useState<readonly StopWorkAlertV1[]>([]);
  useEffect(() => {
    if (!can('safety-operations.hazards.report')) return;
    const load = () => safetyApi.openAlerts().then((page) => setAlerts(page.items), () => setAlerts([]));
    load();
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, [can]);
  if (alerts.length === 0) return null;
  return (
    <Alert variant="error" role="alert">
      <Text weight="plus">Stop work in force: {alerts.map((alert) => alert.area).join(', ')}</Text>
    </Alert>
  );
}

function StopWork({ can }: { can: (permission: string) => boolean }) {
  const [alerts, setAlerts] = useState<readonly StopWorkAlertV1[] | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [error, setError] = useState<SafetyApiError | null>(null);
  const load = useCallback(() => {
    safetyApi.openAlerts().then((page) => setAlerts(page.items), (failure: SafetyApiError) => setError(failure));
  }, []);
  useEffect(load, [load]);
  const act = async (work: () => Promise<unknown>) => {
    setError(null);
    try {
      await work();
      load();
    } catch (failure) {
      setError(failure as SafetyApiError);
    }
  };
  return (
    <Container className="flex flex-col gap-3 p-6">
      <Heading level="h2">Stop-work alerts</Heading>
      {alerts && alerts.length === 0 ? <Text size="small">No stop-work alert is in force.</Text> : null}
      {alerts?.map((alert) => (
        <div key={alert.id} className="flex flex-col gap-2 rounded-lg border border-ui-tag-red-border bg-ui-tag-red-bg p-4">
          <Text weight="plus">{alert.area}</Text>
          <Text size="small">Raised {when(alert.raisedAt)} · {alert.acknowledgements} acknowledged</Text>
          <div className="flex flex-wrap items-end gap-2">
            {can('safety-operations.stop-work.acknowledge') && !alert.acknowledgedByMe ? (
              <Button type="button" size="small" onClick={() => act(() => safetyApi.acknowledge(alert.id))}>Acknowledge</Button>
            ) : null}
            {alert.acknowledgedByMe ? <StatusBadge color="green">You acknowledged</StatusBadge> : null}
            {can('safety-operations.stop-work.lift') ? (
              <>
                <Input aria-label="Why work may restart" size="small" placeholder="Why work may restart" value={reasons[alert.id] ?? ''}
                  onChange={(event) => setReasons({ ...reasons, [alert.id]: event.target.value })} />
                <Button type="button" size="small" variant="secondary" disabled={!(reasons[alert.id] ?? '').trim()}
                  onClick={() => act(() => safetyApi.lift(alert.id, { expectedVersion: alert.version, reason: (reasons[alert.id] ?? '').trim() }))}>
                  Lift
                </Button>
              </>
            ) : null}
          </div>
        </div>
      ))}
      <Problem error={error} />
    </Container>
  );
}

function toCsv(items: readonly HazardReportV1[]): string {
  const cell = (value: unknown) => {
    const text = value === null || value === undefined ? '' : String(value);
    return `"${(/^[=+\-@]/.test(text) ? `'${text}` : text).replaceAll('"', '""')}"`;
  };
  const header = ['Reference', 'Received', 'Severity', 'Category', 'Area', 'Status', 'Risk', 'Route', 'Description'];
  const rows = items.map((item) => [item.reference, item.receivedAt, item.severity, item.category, item.area, item.status, item.riskScore,
    item.route, item.description]);
  return [header, ...rows].map((row) => row.map(cell).join(',')).join('\r\n');
}

function ReportList({ status, title, onOpen, exportable = false }: {
  status?: string; title: string; onOpen: (id: string) => void; exportable?: boolean;
}) {
  const [items, setItems] = useState<readonly HazardReportV1[] | null>(null);
  const [error, setError] = useState<SafetyApiError | null>(null);
  useEffect(() => {
    safetyApi.list(status ? { status } : {}).then((page) => setItems(page.items), (failure: SafetyApiError) => setError(failure));
  }, [status]);
  const download = () => {
    if (!items) return;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([toCsv(items)], { type: 'text/csv;charset=utf-8' }));
    link.download = `hazard-reports-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };
  return (
    <Container className="p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 p-6">
        <Heading level="h2">{title}</Heading>
        {exportable ? <Button type="button" size="small" variant="secondary" disabled={!items?.length} onClick={download}>Export CSV</Button> : null}
      </div>
      {error ? <div className="px-6 pb-6"><Problem error={error} /></div> : null}
      {!error && !items ? <Text className="px-6 pb-6">Loading…</Text> : null}
      {items && items.length === 0 ? <Text className="px-6 pb-6">Nothing here.</Text> : null}
      {items && items.length > 0 ? (
        <Table>
          <Table.Body>
            {items.map((item) => (
              <Table.Row key={item.id} className="cursor-pointer" onClick={() => onOpen(item.id)}>
                <Table.Cell>{item.reference}</Table.Cell>
                <Table.Cell><StatusBadge color={SEVERITY[item.severity].color}>{SEVERITY[item.severity].label}</StatusBadge></Table.Cell>
                <Table.Cell>{CATEGORY[item.category]} · {item.area}</Table.Cell>
                <Table.Cell>{item.status === 'REPORTED' ? `Due ${when(item.triageDueAt)}` : item.status}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      ) : null}
    </Container>
  );
}

function ReportView({ reportId, can, onBack }: { reportId: string; can: (permission: string) => boolean; onBack: () => void }) {
  const [report, setReport] = useState<HazardReportV1 | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [likelihood, setLikelihood] = useState(3);
  const [consequence, setConsequence] = useState(3);
  const [route, setRoute] = useState<HazardRouteV1>('MAINTENANCE');
  const [note, setNote] = useState('');
  const [resolution, setResolution] = useState('');
  const [whys, setWhys] = useState<string[]>(['']);
  const [rootCause, setRootCause] = useState('');
  const [factors, setFactors] = useState('');
  const [error, setError] = useState<SafetyApiError | null>(null);
  const load = useCallback(() => {
    safetyApi.get(reportId).then((value) => {
      setReport(value);
      if (value.investigation) {
        setWhys([...value.investigation.whys]);
        setRootCause(value.investigation.rootCause);
        setFactors(value.investigation.contributingFactors.join('\n'));
      }
      if (value.hasPhoto) safetyApi.photo(value.id).then((image) => setPhoto(`data:${image.contentType};base64,${image.base64}`), () => setPhoto(null));
    }, (failure: SafetyApiError) => setError(failure));
  }, [reportId]);
  useEffect(load, [load]);
  if (!report) return <Container className="p-6"><Problem error={error} />{error ? null : <Text>Loading…</Text>}</Container>;
  const act = async (work: () => Promise<unknown>) => {
    setError(null);
    try {
      await work();
      load();
    } catch (failure) {
      setError(failure as SafetyApiError);
    }
  };
  const risk = hazardRisk(likelihood, consequence);
  const investigating = report.status === 'TRIAGED' && report.route === 'INVESTIGATION';
  return (
    <Container className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <Heading level="h2">{report.reference} · {CATEGORY[report.category]}</Heading>
          <Text size="small" className="text-ui-fg-subtle">{report.area} · seen {when(report.observedAt)} · by {report.reportedBy}</Text>
        </div>
        <div className="flex items-start gap-2">
          <StatusBadge color={SEVERITY[report.severity].color}>{SEVERITY[report.severity].label}</StatusBadge>
          <Button type="button" size="small" variant="secondary" onClick={onBack}>Back</Button>
        </div>
      </div>
      <Text className="whitespace-pre-wrap">{report.description}</Text>
      {photo ? <img src={photo} alt={`Photo with ${report.reference}`} className="max-h-80 self-start rounded-md border border-ui-border-base object-contain" /> : null}
      {report.stopWork ? (
        <Text size="small">Stop work: {report.stopWork.status === 'OPEN' ? `in force, ${report.stopWork.acknowledgements} acknowledged` : `lifted by ${report.stopWork.liftedBy}: ${report.stopWork.liftReason}`}</Text>
      ) : null}
      {report.status !== 'REPORTED' ? (
        <Text size="small">Triaged by {report.triagedBy}: risk {report.riskScore} ({report.likelihood}×{report.consequence}) → {report.route ? ROUTE[report.route] : ''}{report.triageNote ? ` · ${report.triageNote}` : ''}</Text>
      ) : null}
      {report.status === 'REPORTED' && can('safety-operations.hazards.triage') ? (
        <div className="grid grid-cols-1 gap-3 rounded-lg border border-ui-border-base p-4 md:grid-cols-4">
          <div className="flex flex-col gap-1"><Label htmlFor="likelihood">Likelihood (1–5)</Label>
            <Input id="likelihood" type="number" min={1} max={5} size="small" value={likelihood} onChange={(event) => setLikelihood(Number(event.target.value))} /></div>
          <div className="flex flex-col gap-1"><Label htmlFor="consequence">Consequence (1–5)</Label>
            <Input id="consequence" type="number" min={1} max={5} size="small" value={consequence} onChange={(event) => setConsequence(Number(event.target.value))} /></div>
          <div className="flex flex-col gap-1"><Label htmlFor="route">Route</Label>
            <select id="route" className="h-8 rounded-md bg-ui-bg-field px-2 txt-compact-small shadow-borders-base" value={route}
              onChange={(event) => setRoute(event.target.value as HazardRouteV1)}>
              {(Object.keys(ROUTE) as HazardRouteV1[]).map((value) => <option key={value} value={value}>{ROUTE[value]}</option>)}
            </select></div>
          <div className="flex items-end"><StatusBadge color={BAND_COLOR[risk.band]}>Risk {risk.score} · {risk.band}</StatusBadge></div>
          <div className="flex flex-col gap-1 md:col-span-4"><Label htmlFor="triage-note">Note (optional)</Label>
            <Textarea id="triage-note" value={note} onChange={(event) => setNote(event.target.value)} /></div>
          <Button type="button" size="small" className="self-start"
            onClick={() => act(() => safetyApi.triage(report.id, { expectedVersion: report.version, likelihood, consequence, route, ...(note.trim() ? { note: note.trim() } : {}) }))}>
            Save triage
          </Button>
        </div>
      ) : null}
      {investigating && can('safety-operations.investigations.manage') && !report.investigation?.completedAt ? (
        <div className="flex flex-col gap-2 rounded-lg border border-ui-border-base p-4">
          <Heading level="h3">5-Why investigation</Heading>
          {whys.map((why, index) => (
            <Input key={index} aria-label={`Why ${index + 1}`} size="small" placeholder={`Why ${index + 1}`} value={why}
              onChange={(event) => setWhys(whys.map((item, at) => (at === index ? event.target.value : item)))} />
          ))}
          {whys.length < 5 ? <Button type="button" size="small" variant="transparent" className="self-start" onClick={() => setWhys([...whys, ''])}>Add a why</Button> : null}
          <Label htmlFor="root-cause">Root cause</Label>
          <Textarea id="root-cause" value={rootCause} onChange={(event) => setRootCause(event.target.value)} />
          <Label htmlFor="factors">Contributing factors (one per line)</Label>
          <Textarea id="factors" value={factors} onChange={(event) => setFactors(event.target.value)} />
          <div className="flex gap-2">
            {[false, true].map((complete) => (
              <Button key={String(complete)} type="button" size="small" variant={complete ? 'primary' : 'secondary'}
                disabled={!rootCause.trim() || !whys.some((why) => why.trim())}
                onClick={() => act(() => safetyApi.investigate(report.id, {
                  expectedVersion: report.investigation?.version ?? 0, whys: whys.map((why) => why.trim()).filter(Boolean), rootCause: rootCause.trim(),
                  contributingFactors: factors.split('\n').map((line) => line.trim()).filter(Boolean), complete,
                }))}>{complete ? 'Complete investigation' : 'Save'}</Button>
            ))}
          </div>
        </div>
      ) : null}
      {report.investigation?.completedAt ? <Text size="small">Investigation complete: {report.investigation.rootCause}</Text> : null}
      {report.status === 'TRIAGED' && can('safety-operations.hazards.triage') ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex min-w-72 flex-1 flex-col gap-1"><Label htmlFor="resolution">Resolution</Label>
            <Input id="resolution" size="small" value={resolution} onChange={(event) => setResolution(event.target.value)} /></div>
          <Button type="button" size="small" disabled={!resolution.trim()}
            onClick={() => act(() => safetyApi.close(report.id, { expectedVersion: report.version, resolution: resolution.trim() }))}>Close report</Button>
        </div>
      ) : null}
      {report.status === 'CLOSED' ? <Text size="small">Closed by {report.closedBy}: {report.resolution}</Text> : null}
      <Problem error={error} />
    </Container>
  );
}

function Insights() {
  const [days, setDays] = useState(90);
  const [data, setData] = useState<HazardInsightsV1 | null>(null);
  const [error, setError] = useState<SafetyApiError | null>(null);
  useEffect(() => {
    safetyApi.insights(days).then(setData, (failure: SafetyApiError) => setError(failure));
  }, [days]);
  return (
    <Container className="flex flex-col gap-3 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Heading level="h2">Where hazards cluster</Heading>
        <select aria-label="Days" className="h-8 rounded-md bg-ui-bg-field px-2 txt-compact-small shadow-borders-base" value={days}
          onChange={(event) => setDays(Number(event.target.value))}>
          {[30, 90, 365].map((value) => <option key={value} value={value}>{value} days</option>)}
        </select>
      </div>
      <Problem error={error} />
      {data ? (
        <>
          <Text size="small">{data.total} reports · {data.overdueTriage} waiting past their triage time</Text>
          <Table>
            <Table.Body>
              {data.byArea.map((row) => (
                <Table.Row key={row.area}>
                  <Table.Cell>{row.area}</Table.Cell>
                  <Table.Cell>{row.count} report{row.count === 1 ? '' : 's'}</Table.Cell>
                  <Table.Cell>{row.stopWork ? <StatusBadge color="red">{row.stopWork} stop work</StatusBadge> : null}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
          <Text size="small">{data.byCategory.map((row) => `${CATEGORY[row.category]} ${row.count}`).join(' · ')}</Text>
        </>
      ) : null}
    </Container>
  );
}

function ReportForm({ onDone }: { onDone: (reportId: string) => void }) {
  const [severity, setSeverity] = useState<HazardSeverityV1>('UNSAFE_CONDITION');
  const [category, setCategory] = useState<HazardCategoryV1>('SLIP_TRIP_FALL');
  const [operation] = useState(() => crypto.randomUUID());
  const [observedAt] = useState(() => new Date().toISOString());
  const [error, setError] = useState<SafetyApiError | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const created = await safetyApi.report({
        clientOperationId: operation, severity, category, description: String(form.get('description')).trim(),
        area: String(form.get('area')).trim(), observedAt,
      });
      onDone(created.report.id);
    } catch (failure) {
      setError(failure as SafetyApiError);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Container className="p-6">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Heading level="h2">Report a hazard</Heading>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(SEVERITY) as HazardSeverityV1[]).map((value) => (
            <Button key={value} type="button" size="small" variant={severity === value ? 'primary' : 'secondary'} aria-pressed={severity === value}
              onClick={() => setSeverity(value)}>{SEVERITY[value].label}</Button>
          ))}
        </div>
        <Label htmlFor="category">Category</Label>
        <select id="category" className="h-8 rounded-md bg-ui-bg-field px-2 txt-compact-small shadow-borders-base" value={category}
          onChange={(event) => setCategory(event.target.value as HazardCategoryV1)}>
          {(Object.keys(CATEGORY) as HazardCategoryV1[]).map((value) => <option key={value} value={value}>{CATEGORY[value]}</option>)}
        </select>
        <Label htmlFor="area">Where (building, bay, line)</Label>
        <Input id="area" name="area" size="small" required maxLength={200} />
        <Label htmlFor="description">What is the hazard?</Label>
        <Textarea id="description" name="description" required maxLength={2000} />
        {severity === 'STOP_WORK' ? <Alert variant="warning">This stops work in the area until a supervisor lifts it.</Alert> : null}
        <Button type="submit" size="small" className="self-start" isLoading={busy} disabled={busy}>Send report</Button>
        <Problem error={error} />
      </form>
    </Container>
  );
}
