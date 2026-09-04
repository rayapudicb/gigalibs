'use client';

import type {
  CursorPage,
  TenantEnvironment,
  ValueDefinitionSummary,
  ValueEventSummary,
  ValueReport,
} from '@/lib/api-types';
import { requestJson } from '@/lib/client-api';
import { formatMinorAmount } from '@/lib/money';
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

export default function ValueLedgerPage() {
  const [definitions, setDefinitions] = useState<CursorPage<ValueDefinitionSummary> | null>(null);
  const [events, setEvents] = useState<CursorPage<ValueEventSummary> | null>(null);
  const [report, setReport] = useState<ValueReport | null>(null);
  const [environments, setEnvironments] = useState<TenantEnvironment[]>([]);
  const [selectedDefinition, setSelectedDefinition] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [definitionRows, eventRows, reportRows, environmentRows] = await Promise.all([
        requestJson<CursorPage<ValueDefinitionSummary>>('/api/control/value/definitions?limit=100'),
        requestJson<CursorPage<ValueEventSummary>>('/api/control/value/events?limit=100'),
        requestJson<ValueReport>('/api/control/value/report'),
        requestJson<TenantEnvironment[]>('/api/operational-intelligence/environments'),
      ]);
      setDefinitions(definitionRows);
      setEvents(eventRows);
      setReport(reportRows);
      setEnvironments(environmentRows);
      setSelectedDefinition((current) => current || definitionRows.items[0]?.id || '');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load the value ledger.');
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const verified = useMemo(
    () => report?.rows.filter((row) => row.status === 'VERIFIED') ?? [],
    [report],
  );

  async function createDefinition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setError(null);
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const created = await requestJson<ValueDefinitionSummary>('/api/control/value/definitions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          environmentId: data.get('environmentId'),
          outcomeKey: data.get('outcomeKey'),
          name: data.get('name'),
          description: data.get('description') || undefined,
          currency: String(data.get('currency')).toUpperCase(),
          classification: data.get('classification'),
        }),
      });
      setSelectedDefinition(created.id);
      form.reset();
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to create the value definition.');
    } finally {
      setWorking(false);
    }
  }

  async function publishDefinition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    const integer = (name: string) => Number(data.get(name));
    try {
      await requestJson(
        `/api/control/value/definitions/${encodeURIComponent(selectedDefinition)}/publish`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            formulaKind: 'AP_PROCESSING_COST_AVOIDED',
            assumptions: {
              manualMinutesPerCase: integer('manualMinutesPerCase'),
              automatedMinutesPerCase: integer('automatedMinutesPerCase'),
              humanReviewMinutesPerCase: integer('humanReviewMinutesPerCase'),
              loadedHourlyCostMinor: integer('loadedHourlyCostMinor'),
              monthlyPlatformCostMinor: integer('monthlyPlatformCostMinor'),
              monthlyIntegrationOperatingCostMinor: integer('monthlyIntegrationOperatingCostMinor'),
            },
            baseline: {
              monthlyCaseVolume: integer('monthlyCaseVolume'),
              periodStart: data.get('periodStart'),
              periodEnd: data.get('periodEnd'),
              evidenceReference: data.get('evidenceReference'),
            },
            target: {
              automationRateBps: integer('automationRateBps'),
              targetDate: data.get('targetDate'),
            },
          }),
        },
      );
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to publish the formula.');
    } finally {
      setWorking(false);
    }
  }

  async function decide(eventId: string, decision: 'verify' | 'reject') {
    const reason = window.prompt(`Reason to ${decision} this value event:`)?.trim();
    if (!reason || reason.length < 3) return;
    setWorking(true);
    setError(null);
    try {
      await requestJson(`/api/control/value/events/${encodeURIComponent(eventId)}/${decision}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to decide the value event.');
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="space-y-8 p-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Verified value ledger</h1>
        <p className="mt-1 text-sm text-gray-400">
          Tenant-owned assumptions, versioned formulas, allocated costs, and independently verified
          outcomes.
        </p>
      </div>
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-900 bg-red-950/30 p-4 text-sm text-red-300"
        >
          {error}
        </div>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">
          Recognized value
        </h2>
        {verified.length === 0 ? (
          <Empty text="No verified value events exist in the selected tenant context." />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {verified.map((row) => (
              <div
                key={`${row.definition?.id}-${row.status}-${row.currency}`}
                className="rounded-xl border border-emerald-900 bg-emerald-950/20 p-5"
              >
                <div className="text-xs text-emerald-300">
                  {row.definition?.name ?? 'Definition unavailable'} · v{row.definition?.version}
                </div>
                <div className="mt-2 text-2xl font-bold text-white">
                  {formatMinorAmount(row.netValueMinor, row.currency)}
                </div>
                <div className="mt-1 text-xs text-gray-400">
                  Gross {formatMinorAmount(row.grossValueMinor, row.currency)} − allocated cost{' '}
                  {formatMinorAmount(row.allocatedCostMinor, row.currency)} · {row.eventCount}{' '}
                  events
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <form onSubmit={createDefinition} className={panel}>
          <h2 className="font-semibold text-white">Create outcome definition</h2>
          <Select
            name="environmentId"
            label="Environment"
            options={environments.map((item) => ({ value: item.id, label: item.displayName }))}
          />
          <Field name="outcomeKey" label="Outcome key" />
          <Field name="name" label="Name" />
          <Field name="description" label="Description" required={false} />
          <Field name="currency" label="ISO currency" maxLength={3} />
          <Select
            name="classification"
            label="Data classification"
            options={[
              { value: 'INTERNAL', label: 'Internal' },
              { value: 'CONFIDENTIAL', label: 'Confidential' },
              { value: 'RESTRICTED', label: 'Restricted' },
              { value: 'PUBLIC', label: 'Public' },
            ]}
          />
          <button type="submit" disabled={working || environments.length === 0} className={primary}>
            Create definition
          </button>
        </form>
        <form onSubmit={publishDefinition} className={panel}>
          <h2 className="font-semibold text-white">Publish formula version</h2>
          <Select
            name="definitionId"
            label="Definition"
            value={selectedDefinition}
            onChange={setSelectedDefinition}
            options={(definitions?.items ?? []).map((item) => ({
              value: item.id,
              label: `${item.name} · ${item.currency}`,
            }))}
          />
          <div className="grid gap-3 md:grid-cols-3">
            <Field name="manualMinutesPerCase" label="Manual minutes" type="number" />
            <Field name="automatedMinutesPerCase" label="Automated minutes" type="number" />
            <Field name="humanReviewMinutesPerCase" label="Review minutes" type="number" />
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <Field name="loadedHourlyCostMinor" label="Hourly cost (minor)" type="number" />
            <Field name="monthlyPlatformCostMinor" label="Platform cost (minor)" type="number" />
            <Field
              name="monthlyIntegrationOperatingCostMinor"
              label="Integration cost (minor)"
              type="number"
            />
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <Field name="monthlyCaseVolume" label="Monthly cases" type="number" />
            <Field name="periodStart" label="Baseline start" type="date" />
            <Field name="periodEnd" label="Baseline end" type="date" />
          </div>
          <Field name="evidenceReference" label="Baseline evidence reference" />
          <div className="grid gap-3 md:grid-cols-2">
            <Field name="automationRateBps" label="Target rate (basis points)" type="number" />
            <Field name="targetDate" label="Target date" type="date" />
          </div>
          <button type="submit" disabled={working || !selectedDefinition} className={primary}>
            Publish immutable version
          </button>
        </form>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">
          Value events
        </h2>
        <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900">
          {(events?.items.length ?? 0) === 0 ? (
            <Empty text="No value events have been calculated." />
          ) : (
            events?.items.map((item) => (
              <div
                key={item.id}
                className="grid grid-cols-12 gap-3 border-b border-gray-800 px-5 py-4 text-sm last:border-0"
              >
                <div className="col-span-4">
                  <div className="font-semibold text-white">
                    {item.valueDefinitionVersion.valueDefinition.name}
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    v{item.valueDefinitionVersion.version} · {item.classification.toLowerCase()} ·{' '}
                    {new Date(item.occurredAt).toLocaleString()}
                  </div>
                </div>
                <div className="col-span-2 self-center text-gray-300">
                  {formatMinorAmount(item.grossValueMinor, item.currency)}
                </div>
                <div className="col-span-2 self-center text-gray-300">
                  − {formatMinorAmount(item.allocatedCostMinor, item.currency)}
                </div>
                <div className="col-span-2 self-center font-semibold text-white">
                  {formatMinorAmount(item.netValueMinor, item.currency)}
                </div>
                <div className="col-span-2 self-center text-right">
                  <div className="text-xs text-gray-400">{item.status.toLowerCase()}</div>
                  {item.status === 'CALCULATED' && (
                    <div className="mt-2 flex justify-end gap-1">
                      <button
                        type="button"
                        disabled={working}
                        onClick={() => void decide(item.id, 'verify')}
                        className="text-xs text-emerald-300"
                      >
                        Verify
                      </button>
                      <button
                        type="button"
                        disabled={working}
                        onClick={() => void decide(item.id, 'reject')}
                        className="text-xs text-red-300"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

const panel = 'space-y-4 rounded-xl border border-gray-800 bg-gray-900 p-5';
const control =
  'w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500';
const primary =
  'rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50';
function Label({ text, htmlFor }: { text: string; htmlFor: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-xs font-medium text-gray-300">
      {text}
    </label>
  );
}
function Field({
  name,
  label,
  type = 'text',
  required = true,
  maxLength,
}: { name: string; label: string; type?: string; required?: boolean; maxLength?: number }) {
  return (
    <div>
      <Label text={label} htmlFor={name} />
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        maxLength={maxLength}
        min={type === 'number' ? 0 : undefined}
        step={type === 'number' ? 1 : undefined}
        className={control}
      />
    </div>
  );
}
function Select({
  name,
  label,
  options,
  value,
  onChange,
}: {
  name: string;
  label: string;
  options: Array<{ value: string; label: string }>;
  value?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <div>
      <Label text={label} htmlFor={name} />
      <select
        id={name}
        name={name}
        required
        value={value}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
        className={control}
      >
        <option value="" disabled>
          Select…
        </option>
        {options.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-700 p-10 text-center text-sm text-gray-500">
      {text}
    </div>
  );
}
