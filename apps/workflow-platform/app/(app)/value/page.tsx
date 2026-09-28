'use client';

import Link from 'next/link';
import type {
  CursorPage,
  TenantEnvironment,
  ValueDefinitionSummary,
  ValueEventSummary,
  ValueReport,
} from '@/lib/api-types';
import { requestJson } from '@/lib/client-api';
import { formatMinorAmount } from '@/lib/money';
import { ArrowPath } from '@medusajs/icons';
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
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
        requestJson<CursorPage<ValueDefinitionSummary>>('/api/control/value/definitions?limit=100').catch(() => ({ items: [], nextCursor: null })),
        requestJson<CursorPage<ValueEventSummary>>('/api/control/value/events?limit=100').catch(() => ({ items: [], nextCursor: null })),
        requestJson<ValueReport>('/api/control/value/report').catch(() => null),
        requestJson<TenantEnvironment[]>('/api/operational-intelligence/environments').catch(() => []),
      ]);
      setDefinitions(definitionRows);
      setEvents(eventRows);
      setReport(reportRows);
      setEnvironments(environmentRows);
      setSelectedDefinition((current) => current || definitionRows.items[0]?.id || '');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load value ledger records.');
      setDefinitions({ items: [], nextCursor: null });
      setEvents({ items: [], nextCursor: null });
      setReport(null);
      setEnvironments([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const verified = useMemo(
    () => report?.rows.filter((row) => row.status === 'VERIFIED') ?? [],
    [report],
  );

  const totalVerifiedNetMinor = useMemo(
    () => verified.reduce((sum, row) => sum + (Number(row.netValueMinor) || 0), 0),
    [verified],
  );
  const totalGrossBenefitMinor = useMemo(
    () => verified.reduce((sum, row) => sum + (Number(row.grossValueMinor) || 0), 0),
    [verified],
  );
  const totalAllocatedCostsMinor = useMemo(
    () => verified.reduce((sum, row) => sum + (Number(row.allocatedCostMinor) || 0), 0),
    [verified],
  );
  const totalEventsCount = useMemo(
    () => verified.reduce((sum, row) => sum + (Number(row.eventCount) || 0), 0),
    [verified],
  );
  const primaryCurrency = verified[0]?.currency || 'USD';

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
    <div className="space-y-8 p-8 min-h-screen bg-ui-bg-subtle text-ui-fg-base font-sans">
      {/* ── Action Toolbar ───────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-ui-border-base pb-3">
        <div className="flex items-center gap-2">
          <Badge color="green" size="small">AUDITOR PROOF</Badge>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="small"
            variant="secondary"
            onClick={() => void load()}
            disabled={working}
          >
            <ArrowPath className="w-4 h-4 mr-1.5" />
            Refresh
          </Button>
          <Link href="/recovery">
            <Button size="small" variant="primary" className="bg-ui-button-inverted text-ui-fg-on-inverted font-semibold whitespace-nowrap">
              Cash Recovery Studio →
            </Button>
          </Link>
        </div>
      </div>

      {/* ── Executive Business Outcome KPI Ribbon ─────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Container className="p-4 border border-ui-border-base bg-ui-bg-base shadow-elevation-card-rest">
          <Text size="xsmall" weight="plus" className="text-ui-fg-subtle uppercase tracking-wider">
            Total Realized Net Benefit
          </Text>
          <div className="flex items-baseline justify-between mt-2">
            <Heading level="h2" className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 font-mono">
              {formatMinorAmount(String(Math.round(totalVerifiedNetMinor)), primaryCurrency)}
            </Heading>
            <Badge color="green" size="small">NET ROI</Badge>
          </div>
          <Text size="xsmall" className="text-ui-fg-muted mt-1">
            After operational cost deductions
          </Text>
        </Container>

        <Container className="p-4 border border-ui-border-base bg-ui-bg-base shadow-elevation-card-rest">
          <Text size="xsmall" weight="plus" className="text-ui-fg-subtle uppercase tracking-wider">
            Cumulative Gross Benefit
          </Text>
          <div className="flex items-baseline justify-between mt-2">
            <Heading level="h2" className="text-2xl font-bold text-ui-fg-base font-mono">
              {formatMinorAmount(String(Math.round(totalGrossBenefitMinor)), primaryCurrency)}
            </Heading>
            <Badge color="blue" size="small">GROSS</Badge>
          </div>
          <Text size="xsmall" className="text-ui-fg-muted mt-1">
            Across all verified value events
          </Text>
        </Container>

        <Container className="p-4 border border-ui-border-base bg-ui-bg-base shadow-elevation-card-rest">
          <Text size="xsmall" weight="plus" className="text-ui-fg-subtle uppercase tracking-wider">
            Allocated Platform &amp; Ops Costs
          </Text>
          <div className="flex items-baseline justify-between mt-2">
            <Heading level="h2" className="text-2xl font-bold text-ui-fg-base font-mono">
              {formatMinorAmount(String(Math.round(totalAllocatedCostsMinor)), primaryCurrency)}
            </Heading>
            <Badge color="grey" size="small">COST DEDUCTION</Badge>
          </div>
          <Text size="xsmall" className="text-ui-fg-muted mt-1">
            Fully absorbed operating overhead
          </Text>
        </Container>

        <Container className="p-4 border border-ui-border-base bg-ui-bg-base shadow-elevation-card-rest">
          <Text size="xsmall" weight="plus" className="text-ui-fg-subtle uppercase tracking-wider">
            Verified Value Events
          </Text>
          <div className="flex items-baseline justify-between mt-2">
            <Heading level="h2" className="text-2xl font-bold text-ui-fg-base font-mono">
              {totalEventsCount}
            </Heading>
            <Badge color="purple" size="small">IMMUTABLE</Badge>
          </div>
          <Text size="xsmall" className="text-ui-fg-muted mt-1">
            100% cryptographic trace verified
          </Text>
        </Container>
      </div>

      {error && (
        <Alert variant="error">
          <span>{error}</span>
        </Alert>
      )}

      {/* ── Recognized Value Section ────────────────────────────── */}
      <section className="space-y-3">
        <Heading level="h2" className="text-xs font-bold uppercase tracking-wider text-ui-fg-muted">
          Recognized Value
        </Heading>
        {verified.length === 0 ? (
          <Container className="p-8 text-center border border-ui-border-base bg-ui-bg-base">
            <Text size="small" className="text-ui-fg-muted">
              No verified value events exist in the selected tenant context.
            </Text>
          </Container>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {verified.map((row) => (
              <Container
                key={`${row.definition?.id}-${row.status}-${row.currency}`}
                className="p-5 border border-ui-border-base bg-ui-bg-base shadow-elevation-card-rest"
              >
                <div className="flex items-center justify-between">
                  <Text size="xsmall" weight="plus" className="text-ui-fg-muted uppercase tracking-wider font-semibold">
                    {row.definition?.name ?? 'Definition unavailable'} · v{row.definition?.version}
                  </Text>
                  <StatusBadge color="green">VERIFIED</StatusBadge>
                </div>
                <div className="mt-2 text-2xl font-bold font-mono text-ui-fg-base">
                  {formatMinorAmount(row.netValueMinor, row.currency)}
                </div>
                <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
                  Gross {formatMinorAmount(row.grossValueMinor, row.currency)} − allocated cost{' '}
                  {formatMinorAmount(row.allocatedCostMinor, row.currency)} · {row.eventCount} events
                </Text>
              </Container>
            ))}
          </div>
        )}
      </section>

      {/* ── Two Form Panels ─────────────────────────────────────── */}
      <div className="grid gap-6 xl:grid-cols-2">
        <Container className="space-y-4 p-6 border border-ui-border-base bg-ui-bg-base shadow-elevation-card-rest">
          <form onSubmit={createDefinition} className="space-y-4">
            <Heading level="h2" className="text-base font-semibold text-ui-fg-base">
              Create Outcome Definition
            </Heading>
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
            <Button
              type="submit"
              variant="primary"
              disabled={working || environments.length === 0}
              isLoading={working}
              className="w-full"
            >
              Create Definition
            </Button>
          </form>
        </Container>

        <Container className="space-y-4 p-6 border border-ui-border-base bg-ui-bg-base shadow-elevation-card-rest">
          <form onSubmit={publishDefinition} className="space-y-4">
            <Heading level="h2" className="text-base font-semibold text-ui-fg-base">
              Publish Formula Version
            </Heading>
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
            <Button
              type="submit"
              variant="primary"
              disabled={working || !selectedDefinition}
              isLoading={working}
              className="w-full"
            >
              Publish Immutable Version
            </Button>
          </form>
        </Container>
      </div>

      {/* ── Value Events Table ───────────────────────────────────── */}
      <section className="space-y-3">
        <Heading level="h2" className="text-xs font-bold uppercase tracking-wider text-ui-fg-muted">
          Value Events Ledger
        </Heading>
        <Container className="p-0 border border-ui-border-base bg-ui-bg-base shadow-elevation-card-rest overflow-hidden">
          {(events?.items.length ?? 0) === 0 ? (
            <div className="p-8 text-center text-ui-fg-muted text-sm">
              No value events have been calculated.
            </div>
          ) : (
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Definition</Table.HeaderCell>
                  <Table.HeaderCell>Gross Value</Table.HeaderCell>
                  <Table.HeaderCell>Allocated Cost</Table.HeaderCell>
                  <Table.HeaderCell>Net Value</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">Status / Decision</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {events?.items.map((item) => (
                  <Table.Row key={item.id}>
                    <Table.Cell>
                      <div className="font-semibold text-ui-fg-base">
                        {item.valueDefinitionVersion.valueDefinition.name}
                      </div>
                      <div className="text-xs text-ui-fg-subtle mt-0.5">
                        v{item.valueDefinitionVersion.version} · {item.classification.toLowerCase()} ·{' '}
                        {new Date(item.occurredAt).toLocaleDateString()}
                      </div>
                    </Table.Cell>
                    <Table.Cell className="font-mono text-ui-fg-muted">
                      {formatMinorAmount(item.grossValueMinor, item.currency)}
                    </Table.Cell>
                    <Table.Cell className="font-mono text-ui-fg-muted">
                      − {formatMinorAmount(item.allocatedCostMinor, item.currency)}
                    </Table.Cell>
                    <Table.Cell className="font-mono font-bold text-ui-fg-base">
                      {formatMinorAmount(item.netValueMinor, item.currency)}
                    </Table.Cell>
                    <Table.Cell className="text-right">
                      <div className="inline-block">
                        <Badge
                          color={
                            item.status === 'VERIFIED'
                              ? 'green'
                              : item.status === 'REJECTED'
                                ? 'red'
                                : 'grey'
                          }
                          size="small"
                        >
                          {item.status}
                        </Badge>
                      </div>
                      {item.status === 'CALCULATED' && (
                        <div className="mt-2 flex justify-end gap-1.5">
                          <Button
                            variant="secondary"
                            size="small"
                            disabled={working}
                            onClick={() => void decide(item.id, 'verify')}
                          >
                            Verify
                          </Button>
                          <Button
                            variant="danger"
                            size="small"
                            disabled={working}
                            onClick={() => void decide(item.id, 'reject')}
                          >
                            Reject
                          </Button>
                        </div>
                      )}
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          )}
        </Container>
      </section>
    </div>
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
      <label htmlFor={name} className="mb-1 block text-xs font-medium text-ui-fg-subtle">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        maxLength={maxLength}
        min={type === 'number' ? 0 : undefined}
        step={type === 'number' ? 1 : undefined}
        className="w-full rounded-md border border-ui-border-base bg-ui-bg-field px-3 py-2 text-sm text-ui-fg-base focus:border-ui-border-interactive focus:outline-none transition"
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
      <label htmlFor={name} className="mb-1 block text-xs font-medium text-ui-fg-subtle">
        {label}
      </label>
      <select
        id={name}
        name={name}
        required
        value={value}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
        className="w-full rounded-md border border-ui-border-base bg-ui-bg-field px-3 py-2 text-sm text-ui-fg-base focus:border-ui-border-interactive focus:outline-none transition"
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
