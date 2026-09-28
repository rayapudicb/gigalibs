'use client';

import { SiteSelect, useSites } from '@/components/geospatial/SitePicker';
import { type WorkforceApiError, workforceApi } from '@/lib/workforce-api';
import type {
  AbsenceTypeV1,
  AbsenceV1,
  AvailabilityPatternV1,
  AvailabilityV1,
  WeekdayV1,
  WorkingCalendarV1,
  WorkforceResourceV1,
} from '@gigalibs/contracts';
import { Plus } from '@medusajs/icons';
import { Alert, Button, Container, Heading, Input, Label, StatusBadge, Text } from '@medusajs/ui';
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';

const selectClass =
  'h-8 w-full rounded-md bg-ui-bg-field px-2 txt-compact-small text-ui-fg-base shadow-borders-base outline-none transition-fg hover:bg-ui-bg-field-hover focus-visible:shadow-borders-interactive-with-active';
const DAYS: readonly WeekdayV1[] = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
const dayLabel = (day: WeekdayV1) => day.charAt(0) + day.slice(1, 3).toLowerCase();
const absenceColor = { REQUESTED: 'orange', APPROVED: 'green', REJECTED: 'red', CANCELLED: 'grey' } as const;
const localDate = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
const time = (value: string) => new Date(value).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

/**
 * Availability (WI-OI-066): each person's working week in their time zone, absences with a four-eyes decision,
 * site and tenant calendars, and the resulting availability. Nothing is inferred; empty means not recorded.
 */
export function AvailabilityAndAbsence({ resources }: { resources: readonly WorkforceResourceV1[] }) {
  const people = useMemo(() => resources.filter((resource) => resource.resourceType === 'HUMAN' && resource.status === 'ACTIVE'), [resources]);
  const [personId, setPersonId] = useState<string>('');
  const [types, setTypes] = useState<readonly AbsenceTypeV1[]>([]);
  const [queue, setQueue] = useState<readonly AbsenceV1[]>([]);
  const [calendars, setCalendars] = useState<readonly WorkingCalendarV1[]>([]);
  const [error, setError] = useState<WorkforceApiError | null>(null);

  const loadShared = useCallback(async () => {
    try {
      const [typePage, pending, calendarPage] = await Promise.all([
        workforceApi.listAbsenceTypes(),
        workforceApi.listAbsences({ status: 'REQUESTED' }),
        workforceApi.listCalendars(),
      ]);
      setTypes(typePage.items);
      setQueue(pending.items);
      setCalendars(calendarPage.items);
      setError(null);
    } catch (reason) {
      setError(reason as WorkforceApiError);
    }
  }, []);

  useEffect(() => {
    void loadShared();
  }, [loadShared]);
  useEffect(() => {
    if (!personId && people[0]) setPersonId(people[0].id);
  }, [people, personId]);

  if (error && error.status === 403) {
    return (
      <Container className="p-6" role="alert">
        <Heading level="h2">You do not have access to availability</Heading>
        <Text size="small" className="mt-1 text-ui-fg-subtle">Ask a tenant administrator for Workforce availability access.</Text>
      </Container>
    );
  }

  return (
    <div className="space-y-5">
      {error ? <Alert variant="error" role="alert">{error.message}</Alert> : null}
      <Container className="flex flex-wrap items-end justify-between gap-4 p-5">
        <div>
          <Heading level="h2">People</Heading>
          <Text size="small" className="mt-1 text-ui-fg-subtle">{people.length} active person(s) · {queue.length} absence request(s) waiting for a decision</Text>
        </div>
        {people.length === 0 ? (
          <Text size="small" className="text-ui-fg-subtle">Add people in the resource directory first.</Text>
        ) : (
          <div className="flex min-w-[260px] flex-col gap-y-1.5">
            <Label htmlFor="availability-person" size="xsmall" weight="plus">Person</Label>
            <select id="availability-person" value={personId} onChange={(event) => setPersonId(event.target.value)} className={selectClass}>
              {people.map((person) => <option key={person.id} value={person.id}>{person.displayName} ({person.referenceCode})</option>)}
            </select>
          </div>
        )}
      </Container>

      {personId ? <PersonAvailability key={personId} personId={personId} types={types} onChanged={loadShared} /> : null}

      <div className="grid gap-5 xl:grid-cols-2">
        <DecisionQueue queue={queue} onChanged={loadShared} />
        <AbsenceTypes types={types} onChanged={loadShared} />
      </div>
      <Calendars calendars={calendars} onChanged={loadShared} />
    </div>
  );
}

function PersonAvailability({ personId, types, onChanged }: { personId: string; types: readonly AbsenceTypeV1[]; onChanged: () => Promise<void> }) {
  const [patterns, setPatterns] = useState<readonly AvailabilityPatternV1[]>([]);
  const [absences, setAbsences] = useState<readonly AbsenceV1[]>([]);
  const [availability, setAvailability] = useState<AvailabilityV1 | null>(null);
  const [showPattern, setShowPattern] = useState(false);
  const [error, setError] = useState<WorkforceApiError | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start.getTime() + 14 * 86_400_000);
    try {
      const [patternPage, absencePage, window] = await Promise.all([
        workforceApi.listPatterns(personId),
        workforceApi.listAbsences({ resourceId: personId }),
        workforceApi.availability(personId, start.toISOString(), end.toISOString()),
      ]);
      setPatterns(patternPage.items);
      setAbsences(absencePage.items);
      setAvailability(window);
    } catch (reason) {
      setError(reason as WorkforceApiError);
    }
  }, [personId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: () => Promise<unknown>, form?: HTMLFormElement) {
    setBusy(true);
    setError(null);
    try {
      await action();
      form?.reset();
      setShowPattern(false);
      await Promise.all([load(), onChanged()]);
    } catch (reason) {
      setError(reason as WorkforceApiError);
    } finally {
      setBusy(false);
    }
  }

  const days = useMemo(() => {
    if (!availability) return [];
    const byDay = new Map<string, { available: string[]; blocked: string[] }>();
    for (const item of availability.available) {
      const key = localDate(new Date(item.start));
      byDay.set(key, byDay.get(key) ?? { available: [], blocked: [] });
      byDay.get(key)!.available.push(`${time(item.start)}–${time(item.end)}`);
    }
    for (const item of availability.blocked) {
      const key = localDate(new Date(item.start));
      byDay.set(key, byDay.get(key) ?? { available: [], blocked: [] });
      byDay.get(key)!.blocked.push(`${item.label} ${time(item.start)}–${time(item.end)}`);
    }
    return [...byDay.entries()].sort(([left], [right]) => left.localeCompare(right));
  }, [availability]);

  const current = patterns.find((pattern) => !pattern.effectiveTo || pattern.effectiveTo > localDate(new Date()));

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Container className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Heading level="h2">Working week</Heading>
          <Button type="button" size="small" variant="secondary" onClick={() => setShowPattern((value) => !value)}>{showPattern ? 'Close' : 'Set a working week…'}</Button>
        </div>
        {error ? <Alert variant={error.status === 409 ? 'warning' : 'error'} role="alert" className="mt-3">{error.message}</Alert> : null}
        {showPattern ? (
          <PatternForm
            personId={personId}
            busy={busy}
            onSubmit={(input, form) => run(() => workforceApi.createPattern(input), form)}
          />
        ) : null}
        {patterns.length === 0 ? (
          <Text size="small" className="mt-3 text-ui-fg-subtle">No working week recorded; this person has no scheduled time.</Text>
        ) : (
          <ul className="mt-3 space-y-2">
            {patterns.map((pattern) => (
              <li key={pattern.id} className="rounded-md border border-ui-border-base p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Text size="small" weight="plus">{pattern.effectiveFrom} → {pattern.effectiveTo ?? 'open'} · {pattern.timeZone}</Text>
                  <Text size="xsmall" className="text-ui-fg-subtle">{Math.round(pattern.weeklyMinutes / 6) / 10} h/week</Text>
                </div>
                <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
                  {pattern.weeklySlots.map((slot) => `${dayLabel(slot.day)} ${slot.start}–${slot.end}`).join(' · ')}
                </Text>
                {pattern === current && !pattern.effectiveTo ? (
                  <form
                    className="mt-2 flex flex-wrap gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const form = event.currentTarget;
                      void run(() => workforceApi.endPattern(pattern.id, { expectedVersion: pattern.version, effectiveTo: String(new FormData(form).get('effectiveTo')) }), form);
                    }}
                  >
                    <Input name="effectiveTo" type="date" required aria-label="Pattern ends on" className="w-44" />
                    <Button type="submit" size="small" variant="secondary" isLoading={busy}>End pattern</Button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        <Heading level="h3" className="mt-6">Next 14 days</Heading>
        {!availability ? null : availability.scheduledMinutes === 0 ? (
          <Text size="small" className="mt-2 text-ui-fg-subtle">No scheduled time in this period.</Text>
        ) : (
          <>
            <Text size="small" className="mt-1 text-ui-fg-subtle">
              {Math.round(availability.availableMinutes / 6) / 10} h available of {Math.round(availability.scheduledMinutes / 6) / 10} h scheduled
              {availability.pendingAbsences.length ? ` · ${availability.pendingAbsences.length} pending absence request(s) not yet applied` : ''}
            </Text>
            <ul className="mt-3 space-y-1">
              {days.map(([day, entry]) => (
                <li key={day} className="grid grid-cols-[110px_1fr] gap-2 txt-compact-small">
                  <span className="text-ui-fg-subtle">{new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                  <span>
                    {entry.available.join(', ') || '—'}
                    {entry.blocked.length ? <span className="block text-ui-fg-subtle">Blocked: {entry.blocked.join(', ')}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Container>

      <Container className="p-5">
        <Heading level="h2">Absences</Heading>
        {types.filter((type) => type.status === 'ACTIVE').length === 0 ? (
          <Text size="small" className="mt-2 text-ui-fg-subtle">Define absence types first (below).</Text>
        ) : (
          <form
            className="mt-3 grid gap-3 md:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const data = new FormData(form);
              void run(
                () =>
                  workforceApi.requestAbsence({
                    resourceId: personId,
                    absenceTypeId: String(data.get('absenceTypeId')),
                    startsAt: new Date(String(data.get('startsAt'))).toISOString(),
                    endsAt: new Date(String(data.get('endsAt'))).toISOString(),
                    note: String(data.get('note') ?? '').trim() || undefined,
                  }),
                form,
              );
            }}
          >
            <Field id="absence-type" label="Type" className="md:col-span-2">
              <select id="absence-type" name="absenceTypeId" required className={selectClass}>
                {types.filter((type) => type.status === 'ACTIVE').map((type) => (
                  <option key={type.id} value={type.id}>{type.name}{type.requiresApproval ? '' : ' (no approval needed)'}</option>
                ))}
              </select>
            </Field>
            <Field id="absence-start" label="From"><Input id="absence-start" name="startsAt" type="datetime-local" required /></Field>
            <Field id="absence-end" label="Until"><Input id="absence-end" name="endsAt" type="datetime-local" required /></Field>
            <Field id="absence-note" label="Note" className="md:col-span-2"><Input id="absence-note" name="note" maxLength={1000} /></Field>
            <Button type="submit" size="small" isLoading={busy} className="md:col-span-2">Request absence</Button>
          </form>
        )}
        {absences.length === 0 ? <Text size="small" className="mt-4 text-ui-fg-subtle">No absences recorded.</Text> : (
          <ul className="mt-4 space-y-2">
            {absences.map((absence) => (
              <li key={absence.id} className="rounded-md border border-ui-border-base p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Text size="small" weight="plus">{absence.absenceTypeName}</Text>
                  <StatusBadge color={absenceColor[absence.status]}>{absence.status}</StatusBadge>
                </div>
                <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
                  {new Date(absence.startsAt).toLocaleString()} → {new Date(absence.endsAt).toLocaleString()}
                  {absence.decisionReason ? ` · ${absence.decisionReason}` : ''}
                </Text>
                {absence.status === 'REQUESTED' || (absence.status === 'APPROVED' && new Date(absence.startsAt) > new Date()) ? (
                  <Button
                    type="button"
                    size="small"
                    variant="secondary"
                    className="mt-2"
                    isLoading={busy}
                    onClick={() => void run(() => workforceApi.decideAbsence(absence.id, 'cancel', { expectedVersion: absence.version }))}
                  >
                    Cancel absence
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Container>
    </div>
  );
}

function PatternForm({ personId, busy, onSubmit }: {
  personId: string;
  busy: boolean;
  onSubmit: (input: Parameters<typeof workforceApi.createPattern>[0], form: HTMLFormElement) => void;
}) {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (
    <form
      className="mt-4 space-y-3 rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4"
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        const weeklySlots = DAYS.filter((day) => data.get(`works-${day}`) === 'on').map((day) => ({
          day,
          start: String(data.get(`start-${day}`)),
          end: String(data.get(`end-${day}`)),
        }));
        onSubmit(
          {
            resourceId: personId,
            effectiveFrom: String(data.get('effectiveFrom')),
            effectiveTo: String(data.get('effectiveTo') ?? '') || null,
            timeZone: String(data.get('timeZone') ?? zone),
            weeklySlots,
          },
          form,
        );
      }}
    >
      <div className="grid gap-3 md:grid-cols-3">
        <Field id="pattern-from" label="From"><Input id="pattern-from" name="effectiveFrom" type="date" required defaultValue={localDate(new Date())} /></Field>
        <Field id="pattern-to" label="Until (optional)"><Input id="pattern-to" name="effectiveTo" type="date" /></Field>
        <Field id="pattern-zone" label="Time zone"><Input id="pattern-zone" name="timeZone" required defaultValue={zone} maxLength={64} /></Field>
      </div>
      <fieldset className="space-y-1">
        <legend className="txt-compact-xsmall-plus">Working hours (an end before the start runs past midnight)</legend>
        {DAYS.map((day, index) => (
          <div key={day} className="grid grid-cols-[90px_110px_110px] items-center gap-2">
            <label className="flex items-center gap-2 txt-compact-small">
              <input type="checkbox" name={`works-${day}`} defaultChecked={index < 5} /> {dayLabel(day)}
            </label>
            <Input name={`start-${day}`} type="time" defaultValue="09:00" aria-label={`${dayLabel(day)} start`} />
            <Input name={`end-${day}`} type="time" defaultValue="17:00" aria-label={`${dayLabel(day)} end`} />
          </div>
        ))}
      </fieldset>
      <Button type="submit" size="small" isLoading={busy}>Save working week</Button>
    </form>
  );
}

function DecisionQueue({ queue, onChanged }: { queue: readonly AbsenceV1[]; onChanged: () => Promise<void> }) {
  const [error, setError] = useState<WorkforceApiError | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  async function decide(absence: AbsenceV1, decision: 'approve' | 'reject', reason?: string) {
    setBusyId(absence.id);
    setError(null);
    try {
      await workforceApi.decideAbsence(absence.id, decision, { expectedVersion: absence.version, ...(reason ? { reason } : {}) });
      await onChanged();
    } catch (reason) {
      setError(reason as WorkforceApiError);
    } finally {
      setBusyId(null);
    }
  }
  return (
    <Container className="p-5">
      <Heading level="h2">Waiting for a decision</Heading>
      <Text size="small" className="mt-1 text-ui-fg-subtle">Someone other than the requester decides each request.</Text>
      {error ? <Alert variant={error.status === 403 ? 'warning' : 'error'} role="alert" className="mt-3">{error.message}</Alert> : null}
      {queue.length === 0 ? <Text size="small" className="mt-3 text-ui-fg-subtle">Nothing is waiting.</Text> : (
        <ul className="mt-3 space-y-2">
          {queue.map((absence) => (
            <li key={absence.id} className="rounded-md border border-ui-border-base p-3">
              <Text size="small" weight="plus">{absence.resourceName} · {absence.absenceTypeName}</Text>
              <Text size="xsmall" className="mt-1 text-ui-fg-subtle">{new Date(absence.startsAt).toLocaleString()} → {new Date(absence.endsAt).toLocaleString()}{absence.note ? ` · ${absence.note}` : ''}</Text>
              <form
                className="mt-2 flex flex-wrap gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const reason = String(new FormData(event.currentTarget).get('reason') ?? '').trim();
                  void decide(absence, 'reject', reason);
                }}
              >
                <Button type="button" size="small" isLoading={busyId === absence.id} onClick={() => void decide(absence, 'approve')}>Approve</Button>
                <Input name="reason" required placeholder="Reason to reject" aria-label="Rejection reason" className="min-w-[140px] flex-1" maxLength={500} />
                <Button type="submit" size="small" variant="secondary" isLoading={busyId === absence.id}>Reject</Button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </Container>
  );
}

function AbsenceTypes({ types, onChanged }: { types: readonly AbsenceTypeV1[]; onChanged: () => Promise<void> }) {
  const [error, setError] = useState<WorkforceApiError | null>(null);
  const [saving, setSaving] = useState(false);
  return (
    <Container className="p-5">
      <Heading level="h2">Absence types</Heading>
      <form
        className="mt-3 grid gap-2 md:grid-cols-[1fr_1.5fr]"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const data = new FormData(form);
          setSaving(true);
          setError(null);
          try {
            await workforceApi.createAbsenceType({
              code: String(data.get('code') ?? ''),
              name: String(data.get('name') ?? ''),
              paid: data.get('paid') === 'on',
              requiresApproval: data.get('requiresApproval') === 'on',
            });
            form.reset();
            await onChanged();
          } catch (reason) {
            setError(reason as WorkforceApiError);
          } finally {
            setSaving(false);
          }
        }}
      >
        <Input name="code" required placeholder="Code, e.g. ANNUAL" aria-label="Absence type code" maxLength={64} className="uppercase" />
        <Input name="name" required placeholder="Name, e.g. Annual leave" aria-label="Absence type name" maxLength={160} />
        <label className="flex items-center gap-2 txt-compact-small"><input type="checkbox" name="paid" /> Paid</label>
        <label className="flex items-center gap-2 txt-compact-small"><input type="checkbox" name="requiresApproval" defaultChecked /> Needs approval</label>
        <Button type="submit" size="small" variant="secondary" isLoading={saving} className="md:col-span-2"><Plus /> Add type</Button>
      </form>
      {error ? <Alert variant="error" role="alert" className="mt-3">{error.message}</Alert> : null}
      <ul className="mt-3 space-y-1">
        {types.map((type) => (
          <li key={type.id} className="flex justify-between gap-2 txt-compact-small">
            <span>{type.name} <span className="font-mono text-xs text-ui-fg-subtle">{type.code}</span></span>
            <span className="text-ui-fg-subtle">{type.paid ? 'paid' : 'unpaid'} · {type.requiresApproval ? 'needs approval' : 'no approval'}{type.status === 'INACTIVE' ? ' · inactive' : ''}</span>
          </li>
        ))}
      </ul>
    </Container>
  );
}

function Calendars({ calendars, onChanged }: { calendars: readonly WorkingCalendarV1[]; onChanged: () => Promise<void> }) {
  const { sites, siteName } = useSites();
  const [error, setError] = useState<WorkforceApiError | null>(null);
  const [busy, setBusy] = useState(false);
  async function run(action: () => Promise<unknown>, form?: HTMLFormElement) {
    setBusy(true);
    setError(null);
    try {
      await action();
      form?.reset();
      await onChanged();
    } catch (reason) {
      setError(reason as WorkforceApiError);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Container className="p-5">
      <Heading level="h2">Working calendars</Heading>
      <Text size="small" className="mt-1 text-ui-fg-subtle">Days a site (or the whole organisation) is closed. Closures remove scheduled time from everyone working there.</Text>
      {error ? <Alert variant="error" role="alert" className="mt-3">{error.message}</Alert> : null}
      <form
        className="mt-3 grid gap-2 md:grid-cols-4"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const data = new FormData(form);
          void run(
            () => workforceApi.createCalendar({ code: String(data.get('code') ?? ''), name: String(data.get('name') ?? ''), siteRef: String(data.get('siteRef') ?? '') || null }),
            form,
          );
        }}
      >
        <Input name="code" required placeholder="Code" aria-label="Calendar code" maxLength={64} className="uppercase" />
        <Input name="name" required placeholder="Name" aria-label="Calendar name" maxLength={160} />
        <SiteSelect id="calendar-site" name="siteRef" sites={sites} label="Calendar site" />
        <Button type="submit" size="small" variant="secondary" isLoading={busy}><Plus /> Add calendar</Button>
      </form>
      {calendars.length === 0 ? <Text size="small" className="mt-3 text-ui-fg-subtle">No calendars yet; without one no day is treated as a closure.</Text> : (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {calendars.map((calendar) => (
            <section key={calendar.id} className="rounded-md border border-ui-border-base p-3" aria-label={calendar.name}>
              <Text size="small" weight="plus">{calendar.name} <span className="font-mono text-xs text-ui-fg-subtle">{calendar.code}</span></Text>
              <Text size="xsmall" className="text-ui-fg-subtle">{calendar.siteRef ? siteName(calendar.siteRef) : 'Whole organisation'}</Text>
              <ul className="mt-2 space-y-1">
                {calendar.closures.map((closure) => (
                  <li key={closure.id} className="flex items-center justify-between gap-2 txt-compact-small">
                    <span>{closure.closureDate} · {closure.label}</span>
                    <Button type="button" size="small" variant="transparent" onClick={() => void run(() => workforceApi.withdrawClosure(calendar.id, closure.id))}>Withdraw</Button>
                  </li>
                ))}
              </ul>
              <form
                className="mt-2 flex flex-wrap gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = event.currentTarget;
                  const data = new FormData(form);
                  void run(() => workforceApi.addClosure(calendar.id, { closureDate: String(data.get('closureDate')), label: String(data.get('label') ?? '') }), form);
                }}
              >
                <Input name="closureDate" type="date" required aria-label="Closure date" className="w-40" />
                <Input name="label" required placeholder="Label" aria-label="Closure label" maxLength={160} className="min-w-[120px] flex-1" />
                <Button type="submit" size="small" variant="secondary" isLoading={busy}>Add closure</Button>
              </form>
            </section>
          ))}
        </div>
      )}
    </Container>
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
