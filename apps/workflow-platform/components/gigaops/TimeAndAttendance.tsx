'use client';

import { useAuthContext } from '@/components/auth/use-auth-context';
import { SiteSelect, type useSites, useSitesFor } from '@/components/geospatial/SitePicker';
import { hasPermission } from '@/lib/module-access';
import { discardLegacyPunchQueue, punchQueueKey } from '@/lib/offline-punch-queue';
import { type WorkforceApiError, workforceApi } from '@/lib/workforce-api';
import type {
  GeofenceResultV1,
  PunchKindV1,
  PunchV1,
  RecordPunchV1,
  TimeExceptionV1,
  TimesheetPreviewV1,
  TimesheetStatusV1,
  TimesheetV1,
  WorkforceResourcePageV1,
} from '@gigalibs/contracts';
import { Alert, Button, Checkbox, Container, Heading, Input, Label, StatusBadge, Table, Text } from '@medusajs/ui';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';

type Person = WorkforceResourcePageV1['items'][number];

const selectClass =
  'h-8 w-full rounded-md bg-ui-bg-field px-2 txt-compact-small text-ui-fg-base shadow-borders-base outline-none transition-fg hover:bg-ui-bg-field-hover focus-visible:shadow-borders-interactive-with-active';
const DEVICE_KEY = 'gigaops.time.device';
const fenceColor: Record<GeofenceResultV1, 'green' | 'red' | 'grey' | 'orange'> = {
  INSIDE: 'green',
  OUTSIDE: 'red',
  UNKNOWN: 'grey',
  NOT_CHECKED: 'orange',
  NO_LOCATION: 'orange',
};
const sheetColor: Record<TimesheetStatusV1, 'orange' | 'green' | 'red'> = { SUBMITTED: 'orange', APPROVED: 'green', REJECTED: 'red' };
const KIND_LABEL: Record<PunchKindV1, string> = { CLOCK_IN: 'Clock in', BREAK_START: 'Start break', BREAK_END: 'End break', CLOCK_OUT: 'Clock out' };
const NEXT_KINDS: Record<'OFF' | 'ON' | 'BREAK', readonly PunchKindV1[]> = {
  OFF: ['CLOCK_IN'],
  ON: ['BREAK_START', 'CLOCK_OUT'],
  BREAK: ['BREAK_END'],
};
const REASONS = ['MISSED_PUNCH', 'DEVICE_FAULT', 'WRONG_KIND', 'WRONG_TIME', 'WRONG_SITE', 'SUPERVISOR_ADJUSTMENT'] as const;
const time = (value: string) => new Date(value).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
const day = (value: string) => new Date(`${value}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const hours = (minutes: number) => `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

function isoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function mondayOf(date: Date): string {
  const copy = new Date(date);
  copy.setDate(copy.getDate() - ((copy.getDay() + 6) % 7));
  return isoDate(copy);
}

function storage<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function store(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage may be unavailable (private mode); punches are then sent without an offline queue.
  }
}

function deviceId(): string {
  const existing = storage<string | null>(DEVICE_KEY, null);
  if (existing) return existing;
  const created = `web-${crypto.randomUUID()}`;
  store(DEVICE_KEY, created);
  return created;
}

/** The signed-in user and tenant: undefined while it is being asked, null if it could not be read. */
type Session = { userId: string; tenantId: string; permissions: readonly string[] };

function sessionOf(context: ReturnType<typeof useAuthContext>): Session | null | undefined {
  if (context === undefined) return undefined;
  return context?.user?.id && context.tenant?.id
    ? { userId: context.user.id, tenantId: context.tenant.id, permissions: context.permissions ?? [] }
    : null;
}

/**
 * WI-OI-120ah: what the screen offers, from the user's permissions. The server decides; the screen offers only what it
 * would allow. A technician lists their own sheets and exceptions but may not approve or correct them.
 */
export function timeActions(permissions: readonly string[] | null): { approve: boolean; manage: boolean } {
  return {
    approve: !!permissions && hasPermission(permissions, 'workforce.timesheets.approve'),
    manage: !!permissions && hasPermission(permissions, 'workforce.time.manage'),
  };
}

/** The workbench's people list: still loading, holding everyone, or failed or cut short. */
export type PeopleList = 'loading' | 'complete' | 'unknown';

/** WI-OI-120an: the list's state from the workbench's page, or `unknown` if the request failed. */
export function peopleList(page: { total: number; items: readonly unknown[] } | null, failed: boolean): PeopleList {
  if (page) return page.total <= page.items.length ? 'complete' : 'unknown';
  return failed ? 'unknown' : 'loading';
}

/**
 * WI-OI-120an: whether the signed-in user has a Workforce person of their own. `wait` until both the session and the
 * people list have answered; `no` only when the complete list holds no person linked to the user; `ask` when that
 * cannot be known here (the list failed or was cut short, or the session could not be read), so the server decides.
 */
export type OwnPerson = 'wait' | 'yes' | 'no' | 'ask';

export function ownPerson(
  session: { userId: string } | null | undefined,
  people: readonly { platformUserId?: string | null }[],
  list: PeopleList,
): OwnPerson {
  if (session === undefined || list === 'loading') return 'wait';
  if (session === null) return 'ask';
  if (people.some((person) => person.platformUserId === session.userId)) return 'yes';
  return list === 'complete' ? 'no' : 'ask';
}

/** Whether a failed send should stay queued: no response, busy or a server fault. */
function retryable(error: WorkforceApiError): boolean {
  return error.status === undefined || error.status === 429 || error.status >= 500;
}

/**
 * Clock & timesheets (WI-OI-069): a worker's clock with an offline queue (each tap keeps its event id, so a
 * resend never records twice), the weekly timesheet, approvals, and the exception inbox with corrections.
 */
/**
 * WI-OI-120ah: Time & Attendance, at /gigaops/time (the demo PlantOperationsHub is retired). WI-OI-120an: the user's own
 * punches and week are asked for only once it is known they may have a person (`ownPerson`), so a user with none gets
 * no refusal.
 */
export function TimeAndAttendance({ resources, list }: { resources: readonly Person[]; list: PeopleList }) {
  // WI-OI-120ao: one session for the clock, the week and the site list; places only when the user may read them.
  const context = useAuthContext();
  const session = useMemo(() => sessionOf(context), [context]);
  const { sites, siteName, available: sitesAvailable } = useSitesFor(context);
  const people = useMemo(() => resources.filter((resource) => resource.resourceType === 'HUMAN'), [resources]);
  // WI-OI-120ao: raised by the clock after each punch it records or sends; the week and the exceptions follow it.
  const [recorded, setRecorded] = useState(0);
  const onRecorded = useCallback(() => setRecorded((count) => count + 1), []);
  // Any linked resource counts: the server then says whether it is an active person (WORKFORCE_WORKER_INACTIVE).
  const own = ownPerson(session, resources, list);
  const actions = timeActions(session?.permissions ?? null);
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <MyClock sites={sites} sitesAvailable={sitesAvailable} siteName={siteName} session={session} own={own} onRecorded={onRecorded} />
      <WeekSheet people={people} siteName={siteName} own={own} recorded={recorded} />
      {actions.approve ? <Approvals /> : null}
      <ExceptionInbox people={people} sites={sites} canManage={actions.manage} recorded={recorded} />
    </div>
  );
}

function MyClock({ sites, sitesAvailable, siteName, session, own, onRecorded }: {
  sites: ReturnType<typeof useSites>['sites'];
  sitesAvailable: boolean | null;
  siteName: (siteRef: string | null) => string;
  session: Session | null | undefined;
  own: OwnPerson;
  onRecorded: () => void;
}) {
  const [punches, setPunches] = useState<readonly PunchV1[] | null>(null);
  const [pending, setPending] = useState<readonly Omit<RecordPunchV1, 'geofence'>[]>([]);
  const [siteRef, setSiteRef] = useState('');
  const [shareLocation, setShareLocation] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<WorkforceApiError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // The signed-in tenant and user, whose offline queue this device may read (WI-OI-120e, P1-25).
  const queueKey = session ? punchQueueKey(session.tenantId, session.userId) : null;

  const load = useCallback(async () => {
    const today = new Date();
    try {
      const result = await workforceApi.listPunches({ from: isoDate(new Date(today.getTime() - 86_400_000)), to: isoDate(new Date(today.getTime() + 86_400_000)) });
      setPunches(result.items);
      setError(null);
    } catch (reason) {
      setError(reason as WorkforceApiError);
    }
  }, []);

  const flush = useCallback(async () => {
    if (!queueKey) return;
    const queue = storage<Omit<RecordPunchV1, 'geofence'>[]>(queueKey, []);
    const remaining: Omit<RecordPunchV1, 'geofence'>[] = [];
    for (const [index, punch] of queue.entries()) {
      try {
        await workforceApi.recordPunch(punch);
      } catch (reason) {
        if (retryable(reason as WorkforceApiError)) {
          remaining.push(...queue.slice(index));
          break;
        }
        setError(reason as WorkforceApiError);
      }
    }
    store(queueKey, remaining);
    setPending(remaining);
    if (remaining.length < queue.length) {
      await load();
      onRecorded();
    }
  }, [load, queueKey, onRecorded]);

  // WI-OI-120an: the user's own punches are asked for only once they may have a person.
  const mine = own === 'yes' || own === 'ask';
  useEffect(() => {
    if (!queueKey || !mine) return;
    const discarded = discardLegacyPunchQueue();
    if (discarded > 0) setNotice(`${discarded} punch(es) saved on this device before per-person queues could not be attributed to anyone and were not sent.`);
    setPending(storage(queueKey, []));
    void load().then(flush);
    const online = () => void flush();
    window.addEventListener('online', online);
    return () => window.removeEventListener('online', online);
  }, [load, flush, queueKey, mine]);

  const effective = (punches ?? []).filter((punch) => !punch.voided);
  const last = [...effective, ...pending.map((punch) => ({ kind: punch.kind, occurredAt: punch.occurredAt }))]
    .sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt))
    .at(-1);
  const state: 'OFF' | 'ON' | 'BREAK' = !last || last.kind === 'CLOCK_OUT' ? 'OFF' : last.kind === 'BREAK_START' ? 'BREAK' : 'ON';

  async function punch(kind: PunchKindV1) {
    setBusy(true);
    setError(null);
    setNotice(null);
    const location = shareLocation ? await position() : null;
    const input: Omit<RecordPunchV1, 'geofence'> = {
      deviceId: deviceId(),
      deviceEventId: crypto.randomUUID(),
      kind,
      occurredAt: new Date().toISOString(),
      timeZone: zone(),
      siteRef: siteRef || null,
      location,
    };
    try {
      const saved = await workforceApi.recordPunch(input);
      if (saved.exceptions.length) setNotice(`Recorded, flagged for review: ${saved.exceptions.map((item) => item.replaceAll('_', ' ').toLowerCase()).join(', ')}.`);
      await load();
      onRecorded();
    } catch (reason) {
      const failure = reason as WorkforceApiError;
      if (retryable(failure) && queueKey) {
        const queue = [...storage<Omit<RecordPunchV1, 'geofence'>[]>(queueKey, []), input];
        store(queueKey, queue);
        setPending(queue);
        setNotice('No connection: the punch is kept on this device with its original time and will be sent automatically.');
      } else {
        setError(failure);
      }
    } finally {
      setBusy(false);
    }
  }

  const unlinked = own === 'no' || error?.errorCode === 'WORKFORCE_NOT_A_WORKER';
  return (
    <Container className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Heading level="h2">My clock</Heading>
        <StatusBadge color={state === 'OFF' ? 'grey' : state === 'ON' ? 'green' : 'orange'}>
          {state === 'OFF' ? 'Clocked out' : state === 'ON' ? 'Working' : 'On break'}
        </StatusBadge>
      </div>
      {unlinked ? (
        <Text size="small" className="mt-3 text-ui-fg-subtle">Your user is not linked to a person in Workforce, so you cannot record time here. Ask an administrator to link it in the resource directory.</Text>
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field id="clock-site" label="Site">
              <select id="clock-site" value={siteRef} onChange={(event) => setSiteRef(event.target.value)} className={selectClass}>
                <option value="">No site</option>
                {sites.map((site) => <option key={site.id} value={site.id}>{site.label}</option>)}
              </select>
              {/* WI-OI-120ao: say why there is nothing to choose, instead of a silent "No site". */}
              {sitesAvailable === false ? (
                <Text size="small" className="mt-1 text-ui-fg-subtle">Sites come from Geospatial Studio, which you cannot use here, so punches are recorded without a site check.</Text>
              ) : null}
            </Field>
            <div className="flex items-end gap-2 pb-1">
              <Checkbox id="clock-location" checked={shareLocation} onCheckedChange={(value) => setShareLocation(value === true)} />
              <Label htmlFor="clock-location" size="small">Share my location for the site check</Label>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {NEXT_KINDS[state].map((kind) => (
              <Button key={kind} type="button" isLoading={busy} variant={kind === 'CLOCK_IN' ? 'primary' : 'secondary'} onClick={() => void punch(kind)}>
                {KIND_LABEL[kind]}
              </Button>
            ))}
          </div>
          {pending.length > 0 ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Text size="small" className="text-ui-fg-subtle">{pending.length} punch(es) waiting to be sent.</Text>
              <Button type="button" size="small" variant="secondary" onClick={() => void flush()}>Send now</Button>
            </div>
          ) : null}
          {notice ? <Alert variant="info" className="mt-3">{notice}</Alert> : null}
          {error ? <Alert variant="error" className="mt-3">{error.message}</Alert> : null}
          <ul className="mt-4 space-y-1">
            {effective.slice(-8).reverse().map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 txt-compact-small">
                <span>{day(item.workDate)} {time(item.occurredAt)} · {KIND_LABEL[item.kind]} · {siteName(item.siteRef)}</span>
                <span className="flex gap-1">
                  {item.late ? <StatusBadge color="orange">late</StatusBadge> : null}
                  <StatusBadge color={fenceColor[item.geofence]}>{item.geofence.replace('_', ' ').toLowerCase()}</StatusBadge>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Container>
  );
}

function position(): Promise<RecordPunchV1['location']> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (result) => resolve({ latitude: result.coords.latitude, longitude: result.coords.longitude, accuracyMeters: Math.round(result.coords.accuracy) }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8_000, maximumAge: 30_000 },
    );
  });
}

function WeekSheet({ people, siteName, own, recorded }: {
  people: readonly Person[];
  siteName: (siteRef: string | null) => string;
  own: OwnPerson;
  recorded: number;
}) {
  const [resourceId, setResourceId] = useState('');
  const [periodStart, setPeriodStart] = useState(() => mondayOf(new Date()));
  const [preview, setPreview] = useState<TimesheetPreviewV1 | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<WorkforceApiError | null>(null);
  // WI-OI-120n: an administrator or supervisor who is not a Workforce person has no week of their own; they choose a
  // person instead of being shown the refusal of "my week".
  // WI-OI-120an (journey finding): "my week" is asked for only once the user may have a person; a user known to have
  // none is never refused. A late answer never replaces the week of the person now chosen.
  const hold = resourceId === '' && (own === 'wait' || own === 'no');
  const notAWorker = resourceId === '' && (own === 'no' || error?.errorCode === 'WORKFORCE_NOT_A_WORKER');
  const latest = useRef(0);

  const load = useCallback(async () => {
    const request = ++latest.current;
    if (hold) {
      setPreview(null);
      setError(null);
      return;
    }
    try {
      const next = await workforceApi.timesheetPreview({ periodStart, ...(resourceId ? { resourceId } : {}) });
      if (request !== latest.current) return;
      setPreview(next);
      setError(null);
    } catch (reason) {
      if (request !== latest.current) return;
      setPreview(null);
      setError(reason as WorkforceApiError);
    }
  }, [periodStart, resourceId, hold]);

  useEffect(() => {
    void load();
  }, [load]);

  // WI-OI-120ao (journey 89ac2g): the week follows the clock; each punch recorded on this screen reloads it.
  const seenRecorded = useRef(recorded);
  useEffect(() => {
    if (recorded === seenRecorded.current) return;
    seenRecorded.current = recorded;
    void load();
  }, [recorded, load]);

  async function submit() {
    if (!preview) return;
    setBusy(true);
    try {
      await workforceApi.submitTimesheet({ resourceId: preview.resourceId, periodStart: preview.periodStart });
      await load();
    } catch (reason) {
      setError(reason as WorkforceApiError);
    } finally {
      setBusy(false);
    }
  }

  const status = preview?.timesheet?.status;
  const blocked = !preview || preview.lines.length === 0 || preview.issues.length > 0 || preview.openExceptions > 0 || status === 'SUBMITTED' || status === 'APPROVED';
  return (
    <Container className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Heading level="h2">Timesheet</Heading>
        {/* The badge shows only with a loaded week, so it never says "not submitted" for a week it has not read. */}
        {preview ? status ? <StatusBadge color={sheetColor[status]}>{status.toLowerCase()}</StatusBadge> : <StatusBadge color="grey">not submitted</StatusBadge> : null}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field id="sheet-person" label="Person">
          {/* WI-OI-120an (review L-1): a new choice clears the shown week, and choices wait while a week is submitted. */}
          <select id="sheet-person" value={resourceId} disabled={busy} onChange={(event) => { setPreview(null); setError(null); setResourceId(event.target.value); }} className={selectClass}>
            {notAWorker ? <option value="" disabled>Choose a person</option> : <option value="">Me</option>}
            {people.map((person) => <option key={person.id} value={person.id}>{person.displayName}</option>)}
          </select>
        </Field>
        <Field id="sheet-week" label="Week starting (Monday)">
          {/* Another day of the same week keeps the week shown; only a different week is cleared and loaded. */}
          <Input id="sheet-week" type="date" value={periodStart} disabled={busy} onChange={(event) => { if (!event.target.value) return; const next = mondayOf(new Date(`${event.target.value}T12:00:00`)); if (next === periodStart) return; setPreview(null); setError(null); setPeriodStart(next); }} />
        </Field>
      </div>
      {notAWorker ? (
        <Text size="small" className="mt-3 text-ui-fg-subtle">You are not a Workforce person yourself, so there is no week of your own. Choose a person to see their week.</Text>
      ) : error ? (
        <Alert variant="error" className="mt-3">{error.message}</Alert>
      ) : null}
      {preview && preview.lines.length === 0 ? (
        // WI-OI-120ao: an empty week says so instead of showing an empty table.
        <Text size="small" className="mt-4 text-ui-fg-subtle">No punches in this week yet.</Text>
      ) : null}
      {preview ? (
        <>
          {preview.lines.length > 0 ? (
            <Table className="mt-4">
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Day</Table.HeaderCell>
                  <Table.HeaderCell>In</Table.HeaderCell>
                  <Table.HeaderCell>Out</Table.HeaderCell>
                  <Table.HeaderCell>Break</Table.HeaderCell>
                  <Table.HeaderCell>Worked</Table.HeaderCell>
                  <Table.HeaderCell>Site</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {preview.lines.map((line) => (
                  <Table.Row key={line.clockInPunchId}>
                    <Table.Cell>{day(line.workDate)}</Table.Cell>
                    <Table.Cell>{time(line.clockInAt)}</Table.Cell>
                    <Table.Cell>{time(line.clockOutAt)}</Table.Cell>
                    <Table.Cell className="tabular-nums">{line.breakMinutes}m</Table.Cell>
                    <Table.Cell className="tabular-nums">{hours(line.workedMinutes)}</Table.Cell>
                    <Table.Cell>{siteName(line.siteRef)}</Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          ) : null}
          <Text size="small" className="mt-3 tabular-nums">Total {hours(preview.workedMinutes)} worked, {preview.breakMinutes}m breaks.</Text>
          {preview.issues.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {preview.issues.map((issue) => (
                <li key={`${issue.code}-${issue.punchId}`} className="txt-compact-small text-ui-fg-error">{day(issue.workDate)}: {issue.code.replaceAll('_', ' ').toLowerCase()}</li>
              ))}
            </ul>
          ) : null}
          {preview.openExceptions > 0 ? <Text size="small" className="mt-2 text-ui-fg-error">{preview.openExceptions} open exception(s) must be resolved first.</Text> : null}
          {preview.timesheet?.rejectionReason ? <Text size="small" className="mt-2 text-ui-fg-error">Returned: {preview.timesheet.rejectionReason}</Text> : null}
          <Button type="button" className="mt-4" isLoading={busy} disabled={blocked} onClick={() => void submit()}>Submit week</Button>
        </>
      ) : null}
    </Container>
  );
}

function Approvals() {
  const [items, setItems] = useState<readonly TimesheetV1[] | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<WorkforceApiError | null>(null);

  const load = useCallback(async () => {
    try {
      setItems((await workforceApi.listTimesheets({ status: 'SUBMITTED' })).items);
      setError(null);
    } catch (reason) {
      setError(reason as WorkforceApiError);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(action: () => Promise<unknown>) {
    try {
      await action();
      setRejecting(null);
      setReason('');
      await load();
    } catch (failure) {
      setError(failure as WorkforceApiError);
    }
  }

  return (
    <Container className="p-5">
      <Heading level="h2">Waiting for approval</Heading>
      <Text size="small" className="mt-1 text-ui-fg-subtle">Another manager decides your own time; approved weeks cannot change.</Text>
      {error ? <Alert variant="error" className="mt-3">{error.message}</Alert> : null}
      {items && items.length === 0 ? <Text size="small" className="mt-3 text-ui-fg-subtle">Nothing is waiting.</Text> : null}
      <ul className="mt-3 space-y-3">
        {(items ?? []).map((sheet) => (
          <li key={sheet.id} className="rounded-md border border-ui-border-base p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Text size="small" weight="plus">{sheet.resourceName ?? 'Person'} · week of {day(sheet.periodStart)}</Text>
              <Text size="small" className="tabular-nums">{hours(sheet.workedMinutes)}</Text>
            </div>
            {rejecting === sheet.id ? (
              <div className="mt-2 flex gap-2">
                <Input aria-label="Reason for returning the week" value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} placeholder="What needs fixing?" />
                <Button type="button" size="small" variant="danger" disabled={reason.trim().length < 3} onClick={() => void decide(() => workforceApi.rejectTimesheet(sheet.id, sheet.version, reason.trim()))}>Return</Button>
              </div>
            ) : (
              <div className="mt-2 flex gap-2">
                <Button type="button" size="small" onClick={() => void decide(() => workforceApi.approveTimesheet(sheet.id, sheet.version))}>Approve</Button>
                <Button type="button" size="small" variant="secondary" onClick={() => setRejecting(sheet.id)}>Return…</Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </Container>
  );
}

function ExceptionInbox({ people, sites, canManage, recorded }: {
  people: readonly Person[];
  sites: ReturnType<typeof useSites>['sites'];
  canManage: boolean;
  recorded: number;
}) {
  const [items, setItems] = useState<readonly TimeExceptionV1[] | null>(null);
  const [active, setActive] = useState<{ id: string; mode: 'resolve' | 'void' } | null>(null);
  const [error, setError] = useState<WorkforceApiError | null>(null);

  const load = useCallback(async () => {
    try {
      setItems((await workforceApi.listTimeExceptions({ status: 'OPEN' })).items);
      setError(null);
    } catch (reason) {
      setError(reason as WorkforceApiError);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // WI-OI-120ao: a punch can raise an exception, so the inbox follows the clock too.
  const seenRecorded = useRef(recorded);
  useEffect(() => {
    if (recorded === seenRecorded.current) return;
    seenRecorded.current = recorded;
    void load();
  }, [recorded, load]);

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
      setActive(null);
      await load();
    } catch (failure) {
      setError(failure as WorkforceApiError);
    }
  }

  return (
    <Container className="p-5">
      <Heading level="h2">Time exceptions</Heading>
      <Text size="small" className="mt-1 text-ui-fg-subtle">Punches outside the site, unverified or without a location, sent late, or after the week was submitted.</Text>
      {error ? <Alert variant="error" className="mt-3">{error.message}</Alert> : null}
      {items && items.length === 0 ? <Text size="small" className="mt-3 text-ui-fg-subtle">No open exceptions.</Text> : null}
      <ul className="mt-3 space-y-3">
        {(items ?? []).map((item) => (
          <li key={item.id} className="rounded-md border border-ui-border-base p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Text size="small" weight="plus">{item.resourceName ?? 'Person'} · {day(item.workDate)}</Text>
              <StatusBadge color="orange">{item.kind.replaceAll('_', ' ').toLowerCase()}</StatusBadge>
            </div>
            {typeof item.details.distanceToEdgeMeters === 'number' ? (
              <Text size="xsmall" className="mt-1 text-ui-fg-subtle">{Math.round(item.details.distanceToEdgeMeters)} m from the site boundary</Text>
            ) : null}
            {active?.id === item.id ? (
              <form
                className="mt-2 grid gap-2 sm:grid-cols-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  const data = new FormData(event.currentTarget);
                  const note = String(data.get('note') ?? '').trim();
                  void run(() =>
                    active.mode === 'resolve'
                      ? workforceApi.resolveTimeException(item.id, { expectedVersion: item.version, resolution: String(data.get('resolution')), note })
                      : workforceApi.correctTime({ resourceId: item.resourceId, action: 'VOID', punchId: item.punchId!, reasonCode: String(data.get('reason')) as (typeof REASONS)[number], note }),
                  );
                }}
              >
                {active.mode === 'resolve' ? (
                  <select name="resolution" aria-label="Resolution" className={selectClass} defaultValue="ACCEPTED">
                    <option value="ACCEPTED">Accept as recorded</option>
                    <option value="DISMISSED">Dismiss</option>
                    <option value="CORRECTED">Corrected elsewhere</option>
                  </select>
                ) : (
                  <select name="reason" aria-label="Reason code" className={selectClass} defaultValue="WRONG_SITE">
                    {REASONS.map((reason) => <option key={reason} value={reason}>{reason.replaceAll('_', ' ').toLowerCase()}</option>)}
                  </select>
                )}
                <Input name="note" aria-label="Note" required minLength={3} maxLength={500} placeholder="Note for the record" />
                <Button type="submit" size="small" variant={active.mode === 'void' ? 'danger' : 'primary'}>{active.mode === 'void' ? 'Void punch' : 'Resolve'}</Button>
              </form>
            ) : canManage ? (
              <div className="mt-2 flex gap-2">
                <Button type="button" size="small" variant="secondary" onClick={() => setActive({ id: item.id, mode: 'resolve' })}>Resolve…</Button>
                {item.punchId ? <Button type="button" size="small" variant="secondary" onClick={() => setActive({ id: item.id, mode: 'void' })}>Void punch…</Button> : null}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {canManage ? <MissedPunch people={people} sites={sites} onSaved={load} onError={setError} /> : null}
    </Container>
  );
}

function MissedPunch({ people, sites, onSaved, onError }: {
  people: readonly Person[];
  sites: ReturnType<typeof useSites>['sites'];
  onSaved: () => Promise<void>;
  onError: (error: WorkforceApiError) => void;
}) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return <Button type="button" size="small" variant="secondary" className="mt-4" onClick={() => setOpen(true)}>Add a missed punch…</Button>;
  }
  return (
    <form
      className="mt-4 grid gap-3 rounded-md border border-ui-border-base p-3 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const siteRef = String(data.get('siteRef') ?? '');
        workforceApi
          .correctTime({
            resourceId: String(data.get('resourceId')),
            action: 'ADD',
            punch: {
              kind: String(data.get('kind')) as PunchKindV1,
              occurredAt: new Date(String(data.get('occurredAt'))).toISOString(),
              timeZone: zone(),
              siteRef: siteRef || null,
            },
            reasonCode: String(data.get('reason')) as (typeof REASONS)[number],
            note: String(data.get('note') ?? '').trim(),
          })
          .then(async () => {
            setOpen(false);
            await onSaved();
          }, (reason) => onError(reason as WorkforceApiError));
      }}
    >
      <Field id="missed-person" label="Person">
        <select id="missed-person" name="resourceId" required className={selectClass} defaultValue="">
          <option value="" disabled>Choose a person</option>
          {people.map((person) => <option key={person.id} value={person.id}>{person.displayName}</option>)}
        </select>
      </Field>
      <Field id="missed-kind" label="Punch">
        <select id="missed-kind" name="kind" className={selectClass} defaultValue="CLOCK_OUT">
          {(Object.keys(KIND_LABEL) as PunchKindV1[]).map((kind) => <option key={kind} value={kind}>{KIND_LABEL[kind]}</option>)}
        </select>
      </Field>
      <Field id="missed-at" label="When"><Input id="missed-at" name="occurredAt" type="datetime-local" required /></Field>
      <Field id="missed-site" label="Site"><SiteSelect id="missed-site" name="siteRef" sites={sites} /></Field>
      <Field id="missed-reason" label="Reason">
        <select id="missed-reason" name="reason" className={selectClass} defaultValue="MISSED_PUNCH">
          {REASONS.map((reason) => <option key={reason} value={reason}>{reason.replaceAll('_', ' ').toLowerCase()}</option>)}
        </select>
      </Field>
      <Field id="missed-note" label="Note"><Input id="missed-note" name="note" required minLength={3} maxLength={500} /></Field>
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" size="small">Record correction</Button>
        <Button type="button" size="small" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  );
}

function Field({ id, label, className = '', children }: { id: string; label: string; className?: string; children: ReactNode }) {
  return (
    <div className={`flex flex-col gap-y-1.5 ${className}`}>
      <Label htmlFor={id} size="xsmall" weight="plus">{label}</Label>
      {children}
    </div>
  );
}
