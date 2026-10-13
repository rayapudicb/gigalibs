'use client';

import type { AvailabilityV1 } from '@gigalibs/contracts';
import { type FormEvent, useEffect, useState } from 'react';

// WI-OI-120u (M-WF1 Slice 2): the availability check, a named exception (a computed answer, not a record) on the
// Availability page. Scheduled working time less approved absences and closures, as Workforce computes it for bookings.

const BASE_PATH = '/api/workforce';
const MAX_DAYS = 93;

interface Option {
  readonly value: string;
  readonly label: string;
}

// The metadata window's own styles, so the check sits on the page as one of its tabs.
const box = 'rounded-lg border border-ui-border-base bg-ui-bg-base p-4';
const primary =
  'inline-flex items-center gap-1 rounded-md bg-ui-button-inverted px-3 py-1.5 text-sm font-medium text-ui-fg-on-inverted hover:bg-ui-button-inverted-hover disabled:opacity-50';
const inputClass =
  'w-full rounded-md border border-ui-border-base bg-ui-bg-field px-2 py-1.5 text-sm text-ui-fg-base focus:border-ui-border-interactive focus:outline-none';

async function read<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body &&
      typeof body === 'object' &&
      typeof (body as { message?: unknown }).message === 'string'
        ? (body as { message: string }).message
        : null;
    throw new Error(message ?? `The request failed (${response.status}).`);
  }
  return body as T;
}

const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};
const when = (instant: string) =>
  new Date(instant).toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
const hours = (minutes: number) => `${(minutes / 60).toFixed(1)} h`;

export function WhoIsAvailable() {
  const [search, setSearch] = useState('');
  const [people, setPeople] = useState<readonly Option[]>([]);
  const [person, setPerson] = useState('');
  const [from, setFrom] = useState(today);
  const [days, setDays] = useState(14);
  const [answer, setAnswer] = useState<AvailabilityV1 | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    const query = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : '';
    read<readonly Option[]>(`${BASE_PATH}/v1/lookups/wf-resources${query}`)
      .then((options) => active && setPeople(options))
      .catch((error: Error) => active && setFailure(error.message));
    return () => {
      active = false;
    };
  }, [search]);

  async function check(event: FormEvent) {
    event.preventDefault();
    if (!person) return;
    setBusy(true);
    setFailure(null);
    setAnswer(null);
    try {
      // The days are the viewer's own calendar days.
      const start = new Date(`${from}T00:00:00`);
      const end = new Date(start.getTime() + Math.min(Math.max(days, 1), MAX_DAYS) * 86_400_000);
      const query = new URLSearchParams({
        resourceId: person,
        from: start.toISOString(),
        to: end.toISOString(),
      });
      setAnswer(await read<AvailabilityV1>(`${BASE_PATH}/v1/availability?${query.toString()}`));
    } catch (error) {
      setFailure((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <form
        className={`${box} grid gap-3 md:grid-cols-4`}
        onSubmit={check}
        aria-label="Who is available"
      >
        <label className="space-y-1 text-sm md:col-span-2">
          <span className="text-ui-fg-subtle">Person</span>
          <input
            className={inputClass}
            placeholder="Search by name or code"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search people"
          />
          <select
            className={inputClass}
            value={person}
            onChange={(event) => setPerson(event.target.value)}
            aria-label="Person"
            required
          >
            <option value="">Choose a person</option>
            {people.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-ui-fg-subtle">From</span>
          <input
            className={inputClass}
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            required
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-ui-fg-subtle">Days (up to {MAX_DAYS})</span>
          <input
            className={inputClass}
            type="number"
            min={1}
            max={MAX_DAYS}
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
            required
          />
        </label>
        <div className="md:col-span-4">
          <button type="submit" className={primary} disabled={busy || !person}>
            {busy ? 'Checking…' : 'Check availability'}
          </button>
        </div>
      </form>
      {failure ? (
        <p role="alert" className="text-sm text-ui-fg-error">
          {failure}
        </p>
      ) : null}
      {answer ? (
        <div className={`${box} space-y-3`}>
          <p className="text-sm text-ui-fg-base">
            Available {hours(answer.availableMinutes)} of {hours(answer.scheduledMinutes)}{' '}
            scheduled.
          </p>
          <section aria-label="Available">
            <h3 className="text-sm font-medium text-ui-fg-base">Available</h3>
            {answer.available.length === 0 ? (
              <p className="text-sm text-ui-fg-subtle">No working time left in these days.</p>
            ) : (
              <ul className="text-sm text-ui-fg-subtle">
                {answer.available.map((interval) => (
                  <li key={interval.start}>
                    {when(interval.start)} → {when(interval.end)}
                  </li>
                ))}
              </ul>
            )}
          </section>
          {answer.blocked.length > 0 ? (
            <section aria-label="Not available">
              <h3 className="text-sm font-medium text-ui-fg-base">Not available</h3>
              <ul className="text-sm text-ui-fg-subtle">
                {answer.blocked.map((interval) => (
                  <li key={`${interval.start}-${interval.reason}`}>
                    {when(interval.start)} → {when(interval.end)}:{' '}
                    {interval.reason === 'ABSENCE' ? 'absence' : 'closure'} ({interval.label})
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {answer.pendingAbsences.length > 0 ? (
            <p className="text-sm text-ui-fg-subtle">
              {answer.pendingAbsences.length} absence request(s) in these days are waiting for a
              decision; they do not count yet.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
