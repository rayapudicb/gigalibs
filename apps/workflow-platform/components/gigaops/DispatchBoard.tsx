'use client';

import { SiteSelect, useSites } from '@/components/geospatial/SitePicker';
import { type WorkforceApiError, workforceApi } from '@/lib/workforce-api';
import type {
  BookingCandidateV1,
  BookingStatusV1,
  BookingV1,
  CapabilityDefinitionV1,
  WorkRequirementDetailV1,
  WorkRequirementV1,
} from '@gigalibs/contracts';
import { Plus } from '@medusajs/icons';
import { Alert, Button, Container, Heading, Input, Label, StatusBadge, Table, Text } from '@medusajs/ui';
import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from 'react';

const selectClass =
  'h-8 w-full rounded-md bg-ui-bg-field px-2 txt-compact-small text-ui-fg-base shadow-borders-base outline-none transition-fg hover:bg-ui-bg-field-hover focus-visible:shadow-borders-interactive-with-active';
const requirementColor = { OPEN: 'orange', FILLED: 'green', CANCELLED: 'grey' } as const;
const bookingColor: Record<BookingStatusV1, 'grey' | 'blue' | 'purple' | 'orange' | 'green' | 'red'> = {
  DRAFT: 'grey',
  CONFIRMED: 'blue',
  DISPATCHED: 'purple',
  ON_SITE: 'orange',
  COMPLETED: 'green',
  CANCELLED: 'red',
};
const NEXT: Partial<Record<BookingStatusV1, { status: BookingStatusV1; label: string }>> = {
  DRAFT: { status: 'CONFIRMED', label: 'Confirm' },
  CONFIRMED: { status: 'DISPATCHED', label: 'Dispatch' },
  DISPATCHED: { status: 'ON_SITE', label: 'Arrived on site' },
  ON_SITE: { status: 'COMPLETED', label: 'Complete' },
};
const when = (value: string) => new Date(value).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

/**
 * Scheduling & dispatch (WI-OI-067): demand from any source, qualified and available candidates, and bookings
 * the server guards against double booking and over-staffing.
 */
export function DispatchBoard({ capabilities }: { capabilities: readonly CapabilityDefinitionV1[] }) {
  const [requirements, setRequirements] = useState<readonly WorkRequirementV1[] | null>(null);
  const [selected, setSelected] = useState<WorkRequirementDetailV1 | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<WorkforceApiError | null>(null);
  const { sites, siteName } = useSites();

  const load = useCallback(async () => {
    try {
      setRequirements((await workforceApi.listRequirements({ from: new Date(Date.now() - 7 * 86_400_000).toISOString() })).items);
      setError(null);
    } catch (reason) {
      setError(reason as WorkforceApiError);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error && !requirements) {
    return (
      <Container className="p-6" role="alert">
        <Heading level="h2">{error.status === 403 ? 'You do not have access to dispatch' : 'Could not load demand'}</Heading>
        <Text size="small" className="mt-1 text-ui-fg-subtle">{error.status === 403 ? 'Ask a tenant administrator for Workforce demand and booking access.' : error.message}</Text>
      </Container>
    );
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_560px]">
      <Container className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Heading level="h2">Demand</Heading>
            <Text size="small" className="mt-1 text-ui-fg-subtle">Work that needs people, from any source; last 7 days onward.</Text>
          </div>
          <Button type="button" size="small" onClick={() => setShowCreate((value) => !value)}><Plus /> New requirement</Button>
        </div>
        {showCreate ? (
          <RequirementForm
            sites={sites}
            capabilities={capabilities}
            onCreated={async (requirement) => {
              setShowCreate(false);
              setSelected(requirement);
              await load();
            }}
          />
        ) : null}
        {!requirements ? null : requirements.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-ui-border-strong bg-ui-bg-subtle p-6">
            <Text weight="plus">No demand yet</Text>
            <Text size="small" className="mt-2 text-ui-fg-subtle">Create a requirement here, or request staffing from a CMMS work order.</Text>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto" tabIndex={0} role="region" aria-label="Work requirements">
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Requirement</Table.HeaderCell>
                  <Table.HeaderCell>When</Table.HeaderCell>
                  <Table.HeaderCell>Staffed</Table.HeaderCell>
                  <Table.HeaderCell>State</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {requirements.map((requirement) => (
                  <Table.Row
                    key={requirement.id}
                    className={`cursor-pointer ${selected?.id === requirement.id ? 'bg-ui-bg-highlight' : ''}`}
                    onClick={() => void workforceApi.getRequirement(requirement.id).then(setSelected, (reason) => setError(reason as WorkforceApiError))}
                  >
                    <Table.Cell className="py-2">
                      <span className="block txt-compact-small-plus">{requirement.title}</span>
                      <span className="text-xs text-ui-fg-subtle">{siteName(requirement.siteRef)}{requirement.sourceRef ? ` · ${requirement.sourceType.replaceAll('_', ' ').toLowerCase()} ${requirement.sourceRef}` : ''}</span>
                    </Table.Cell>
                    <Table.Cell className="text-xs">{when(requirement.startsAt)} → {when(requirement.endsAt)}</Table.Cell>
                    <Table.Cell className="tabular-nums">{requirement.bookedCount} / {requirement.headcount}</Table.Cell>
                    <Table.Cell><StatusBadge color={requirementColor[requirement.status]}>{requirement.status}</StatusBadge></Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </div>
        )}
      </Container>
      {selected ? (
        <RequirementPanel requirement={selected} siteName={siteName} onChanged={async (next) => { setSelected(next); await load(); }} />
      ) : (
        <Container className="p-5">
          <Heading level="h2">Staffing</Heading>
          <Text size="small" className="mt-3 text-ui-fg-subtle">Select a requirement to see ranked candidates and book people.</Text>
        </Container>
      )}
    </div>
  );
}

function RequirementForm({ sites, capabilities, onCreated }: {
  sites: ReturnType<typeof useSites>['sites'];
  capabilities: readonly CapabilityDefinitionV1[];
  onCreated: (requirement: WorkRequirementDetailV1) => Promise<void>;
}) {
  const [requestKey] = useState(() => crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<WorkforceApiError | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    try {
      const requirement = await workforceApi.createRequirement({
        requestKey,
        title: String(data.get('title') ?? ''),
        sourceType: 'MANUAL',
        siteRef: String(data.get('siteRef') ?? '') || null,
        startsAt: new Date(String(data.get('startsAt'))).toISOString(),
        endsAt: new Date(String(data.get('endsAt'))).toISOString(),
        headcount: Number(data.get('headcount') || 1),
        requiredCapabilities: data.getAll('capability').map((id) => ({
          capabilityDefinitionId: String(id),
          minimumProficiency: String(data.get(`proficiency-${String(id)}`) ?? 'STANDARD') as 'STANDARD',
        })),
      });
      await onCreated(requirement);
    } catch (reason) {
      setError(reason as WorkforceApiError);
    } finally {
      setSaving(false);
    }
  }
  const active = capabilities.filter((capability) => capability.status === 'ACTIVE');
  return (
    <form onSubmit={submit} className="mt-4 grid gap-3 rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4 md:grid-cols-2">
      <Field id="req-title" label="Title" className="md:col-span-2"><Input id="req-title" name="title" required maxLength={240} /></Field>
      <Field id="req-site" label="Site"><SiteSelect id="req-site" name="siteRef" sites={sites} /></Field>
      <Field id="req-headcount" label="People needed"><Input id="req-headcount" name="headcount" type="number" min="1" max="500" defaultValue="1" /></Field>
      <Field id="req-start" label="Starts"><Input id="req-start" name="startsAt" type="datetime-local" required /></Field>
      <Field id="req-end" label="Ends"><Input id="req-end" name="endsAt" type="datetime-local" required /></Field>
      <fieldset className="md:col-span-2">
        <legend className="txt-compact-xsmall-plus">Required capabilities</legend>
        {active.length === 0 ? <Text size="xsmall" className="text-ui-fg-subtle">None defined yet.</Text> : (
          <div className="mt-1 grid gap-1 sm:grid-cols-2">
            {active.map((capability) => (
              <div key={capability.id} className="flex items-center gap-2 txt-compact-small">
                <input type="checkbox" name="capability" value={capability.id} aria-label={capability.name} />
                <span className="flex-1">{capability.name}</span>
                <select name={`proficiency-${capability.id}`} aria-label={`${capability.name} minimum`} className={`${selectClass} w-28`} defaultValue="STANDARD">
                  <option value="STANDARD">Standard</option>
                  <option value="ADVANCED">Advanced</option>
                  <option value="EXPERT">Expert</option>
                  <option value="MASTER">Master</option>
                </select>
              </div>
            ))}
          </div>
        )}
      </fieldset>
      {error ? <Alert variant="error" role="alert" className="md:col-span-2">{error.message}</Alert> : null}
      <Button type="submit" size="small" isLoading={saving} className="md:col-span-2">Create requirement</Button>
    </form>
  );
}

function RequirementPanel({ requirement, siteName, onChanged }: {
  requirement: WorkRequirementDetailV1;
  siteName: (siteRef: string | null) => string;
  onChanged: (requirement: WorkRequirementDetailV1) => Promise<void>;
}) {
  const [candidates, setCandidates] = useState<readonly BookingCandidateV1[] | null>(null);
  const [error, setError] = useState<WorkforceApiError | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setCandidates(null);
    setError(null);
    if (requirement.status !== 'OPEN') return;
    workforceApi.candidates(requirement.id).then((result) => setCandidates(result.items), (reason) => setError(reason as WorkforceApiError));
  }, [requirement.id, requirement.status, requirement.version]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await onChanged(await workforceApi.getRequirement(requirement.id));
    } catch (reason) {
      setError(reason as WorkforceApiError);
    } finally {
      setBusy(false);
    }
  }

  const book = (candidate: BookingCandidateV1, overrideReason?: string) =>
    run(() => workforceApi.createBooking({ requestKey: crypto.randomUUID(), requirementId: requirement.id, resourceId: candidate.resourceId, ...(overrideReason ? { overrideReason } : {}) }));

  return (
    <Container className="p-5" aria-label={`Requirement ${requirement.title}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Heading level="h2">{requirement.title}</Heading>
          <Text size="small" className="mt-1 text-ui-fg-subtle">
            {siteName(requirement.siteRef)} · {when(requirement.startsAt)} → {when(requirement.endsAt)} · {requirement.bookedCount} of {requirement.headcount} booked
          </Text>
        </div>
        <StatusBadge color={requirementColor[requirement.status]}>{requirement.status}</StatusBadge>
      </div>
      {error ? <Alert variant={error.status === 409 || error.status === 422 ? 'warning' : 'error'} role="alert" className="mt-3">{error.message}</Alert> : null}

      <Heading level="h3" className="mt-5">Bookings</Heading>
      {requirement.bookings.length === 0 ? <Text size="small" className="mt-2 text-ui-fg-subtle">Nobody booked yet.</Text> : (
        <ul className="mt-2 space-y-2">
          {requirement.bookings.map((booking) => (
            <BookingRow key={booking.id} booking={booking} busy={busy} onMove={(status, reason) => run(() => workforceApi.changeBookingStatus(booking.id, { expectedVersion: booking.version, status, ...(reason ? { reason } : {}) }))} />
          ))}
        </ul>
      )}

      {requirement.status === 'OPEN' ? (
        <>
          <Heading level="h3" className="mt-5">Candidates</Heading>
          {!candidates ? <Text size="small" className="mt-2 text-ui-fg-subtle">Checking qualifications and availability…</Text> : candidates.length === 0 ? (
            <Text size="small" className="mt-2 text-ui-fg-subtle">No active people yet.</Text>
          ) : (
            <ul className="mt-2 space-y-2">
              {candidates.map((candidate) => {
                const ready = candidate.qualified && candidate.available && !candidate.conflictingBooking;
                return (
                  <li key={candidate.resourceId} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-ui-border-base p-3">
                    <div>
                      <Text size="small" weight="plus">{candidate.resourceName}</Text>
                      <Text size="xsmall" className="text-ui-fg-subtle">
                        {candidate.qualified ? 'Qualified' : `Missing ${candidate.missingCapabilities.join(', ')}`} ·{' '}
                        {candidate.available ? 'available' : `available ${Math.round(candidate.availableMinutes / 6) / 10} h`}
                        {candidate.conflictingBooking ? ' · already booked then' : ''}
                      </Text>
                    </div>
                    {ready ? (
                      <Button type="button" size="small" isLoading={busy} onClick={() => void book(candidate)}>Book</Button>
                    ) : candidate.qualified && !candidate.conflictingBooking ? (
                      <form
                        className="flex gap-2"
                        onSubmit={(event) => {
                          event.preventDefault();
                          const reason = String(new FormData(event.currentTarget).get('override') ?? '').trim();
                          if (reason) void book(candidate, reason);
                        }}
                      >
                        <Input name="override" required placeholder="Reason to book anyway" aria-label="Override reason" maxLength={500} className="w-48" />
                        <Button type="submit" size="small" variant="secondary" isLoading={busy}>Book anyway</Button>
                      </form>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          <form
            className="mt-5 flex flex-wrap gap-2 border-t border-ui-border-base pt-4"
            onSubmit={(event) => {
              event.preventDefault();
              const reason = String(new FormData(event.currentTarget).get('reason') ?? '').trim();
              if (reason) void run(() => workforceApi.cancelRequirement(requirement.id, { expectedVersion: requirement.version, reason }));
            }}
          >
            <Input name="reason" required placeholder="Reason to cancel this requirement" aria-label="Cancellation reason" maxLength={500} className="min-w-[220px] flex-1" />
            <Button type="submit" size="small" variant="danger" isLoading={busy}>Cancel requirement</Button>
          </form>
        </>
      ) : null}
    </Container>
  );
}

function BookingRow({ booking, busy, onMove }: { booking: BookingV1; busy: boolean; onMove: (status: BookingStatusV1, reason?: string) => void }) {
  const next = NEXT[booking.status];
  const cancellable = ['DRAFT', 'CONFIRMED', 'DISPATCHED'].includes(booking.status);
  return (
    <li className="rounded-md border border-ui-border-base p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Text size="small" weight="plus">{booking.resourceName}</Text>
        <StatusBadge color={bookingColor[booking.status]}>{booking.status.replace('_', ' ')}</StatusBadge>
      </div>
      <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
        {when(booking.startsAt)} → {when(booking.endsAt)}
        {booking.overrideReason ? ` · override: ${booking.overrideReason}` : ''}
        {booking.cancelReason ? ` · ${booking.cancelReason}` : ''}
      </Text>
      {next || cancellable ? (
        <form
          className="mt-2 flex flex-wrap gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const reason = String(new FormData(event.currentTarget).get('reason') ?? '').trim();
            if (reason) onMove('CANCELLED', reason);
          }}
        >
          {next ? <Button type="button" size="small" isLoading={busy} onClick={() => onMove(next.status)}>{next.label}</Button> : null}
          {cancellable ? (
            <>
              <Input name="reason" required placeholder="Reason to cancel" aria-label="Booking cancellation reason" maxLength={500} className="min-w-[140px] flex-1" />
              <Button type="submit" size="small" variant="secondary" isLoading={busy}>Cancel</Button>
            </>
          ) : null}
        </form>
      ) : null}
    </li>
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
