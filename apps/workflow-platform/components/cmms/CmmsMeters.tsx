'use client';

import { type CmmsApiError, cmmsApi } from '@/lib/cmms-api';
import type { CmmsAssetV1, CmmsMeterReadingV1, CmmsMeterV1 } from '@gigalibs/contracts';
import { Plus } from '@medusajs/icons';
import { Button, Container, Heading, Input, StatusBadge, Table, Text } from '@medusajs/ui';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { ActionError, EmptyState, ErrorState, Field, LoadingState, formatDate, optionalNumber, optionalText, selectClass } from './CmmsShared';

const conditionColor = { NORMAL: 'green', BELOW_MINIMUM: 'orange', ABOVE_MAXIMUM: 'red', UNKNOWN: 'grey' } as const;
const conditionLabel = { NORMAL: 'Within limits', BELOW_MINIMUM: 'Below minimum', ABOVE_MAXIMUM: 'Above maximum', UNKNOWN: 'No reading' } as const;

export function CmmsMeters() {
  const [meters, setMeters] = useState<readonly CmmsMeterV1[] | null>(null);
  const [assets, setAssets] = useState<readonly CmmsAssetV1[]>([]);
  const [selected, setSelected] = useState<CmmsMeterV1 | null>(null);
  const [readings, setReadings] = useState<readonly CmmsMeterReadingV1[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<CmmsApiError | null>(null);
  const [actionError, setActionError] = useState<CmmsApiError | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [list, assetPage] = await Promise.all([cmmsApi.listMeters(), cmmsApi.searchAssets({ pageSize: 100 })]);
      setMeters(list.items);
      setAssets(assetPage.items);
    } catch (reason) {
      setError(reason as CmmsApiError);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selected) return;
    let active = true;
    cmmsApi.readings(selected.id).then((result) => active && setReadings(result.items), (reason) => active && setActionError(reason as CmmsApiError));
    return () => {
      active = false;
    };
  }, [selected]);

  async function record(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const readAt = optionalText(data.get('readAt'));
    setBusy(true);
    setActionError(null);
    try {
      const result = await cmmsApi.recordReading(selected.id, {
        requestKey: crypto.randomUUID(),
        value: Number(data.get('value')),
        ...(readAt ? { readAt: new Date(readAt).toISOString() } : {}),
        notes: optionalText(data.get('notes')),
      });
      setSelected(result.meter);
      form.reset();
      await load();
    } catch (reason) {
      setActionError(reason as CmmsApiError);
    } finally {
      setBusy(false);
    }
  }

  if (error && !meters) return <ErrorState error={error} retry={() => void load()} />;
  if (!meters) return <LoadingState />;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_440px]">
      <Container className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Heading level="h2">Meters</Heading>
            <Text size="small" className="mt-1 text-ui-fg-subtle">Condition is derived from the latest reading and the meter limits.</Text>
          </div>
          <Button type="button" size="small" disabled={assets.length === 0} onClick={() => setShowCreate((value) => !value)}><Plus /> Add meter</Button>
        </div>
        {showCreate ? <MeterForm assets={assets} onCreated={async () => { setShowCreate(false); await load(); }} /> : null}
        {meters.length === 0 ? (
          <EmptyState title={assets.length === 0 ? 'Register an asset first' : 'No meters'} text="Add run-hour counters or gauges (temperature, vibration, pressure) to assets and record readings." />
        ) : (
          <div className="mt-4 overflow-x-auto">
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Meter</Table.HeaderCell>
                  <Table.HeaderCell>Latest</Table.HeaderCell>
                  <Table.HeaderCell>Condition</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {meters.map((meter) => (
                  <Table.Row key={meter.id} className={`cursor-pointer ${selected?.id === meter.id ? 'bg-ui-bg-highlight' : ''}`} onClick={() => setSelected(meter)}>
                    <Table.Cell className="py-2">
                      <span className="block txt-compact-small-plus">{meter.name}</span>
                      <span className="text-xs text-ui-fg-subtle">{meter.assetName} · {meter.readingType.toLowerCase()}</span>
                    </Table.Cell>
                    <Table.Cell className="tabular-nums">
                      {meter.lastValue === null ? '—' : `${meter.lastValue} ${meter.unit}`}
                      <span className="block text-xs text-ui-fg-subtle">{formatDate(meter.lastReadAt)}</span>
                    </Table.Cell>
                    <Table.Cell><StatusBadge color={conditionColor[meter.condition]}>{conditionLabel[meter.condition]}</StatusBadge></Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </div>
        )}
      </Container>
      <aside aria-label="Meter readings">
        <Container className="p-5">
          {!selected ? (
            <>
              <Heading level="h2">Readings</Heading>
              <Text size="small" className="mt-3 text-ui-fg-subtle">Select a meter to record a reading and see its history.</Text>
            </>
          ) : (
            <>
              <Heading level="h2">{selected.name}</Heading>
              <Text size="small" className="mt-1 text-ui-fg-subtle">
                Limits {selected.minThreshold ?? '—'} to {selected.maxThreshold ?? '—'} {selected.unit}
                {selected.readingType === 'COUNTER' ? ' · counter readings cannot go backwards' : ''}
              </Text>
              <form onSubmit={record} className="mt-4 grid grid-cols-2 gap-2">
                <Input name="value" type="number" step="any" required placeholder={`Value (${selected.unit})`} aria-label="Reading value" />
                <Input name="readAt" type="datetime-local" aria-label="Read at (defaults to now)" />
                <Input name="notes" placeholder="Notes" aria-label="Reading notes" className="col-span-2" maxLength={2000} />
                <Button type="submit" size="small" isLoading={busy} className="col-span-2">Record reading</Button>
              </form>
              <ActionError error={actionError} />
              {readings.length === 0 ? <Text size="small" className="mt-4 text-ui-fg-subtle">No readings yet.</Text> : (
                <ul className="mt-4 space-y-1">
                  {readings.map((reading) => (
                    <li key={reading.id} className="flex justify-between gap-2 txt-compact-small">
                      <span className="text-ui-fg-subtle">{formatDate(reading.readAt)}</span>
                      <span className="tabular-nums">{reading.value} {selected.unit}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </Container>
      </aside>
    </div>
  );
}

function MeterForm({ assets, onCreated }: { assets: readonly CmmsAssetV1[]; onCreated: () => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<CmmsApiError | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    try {
      await cmmsApi.createMeter({
        assetId: String(data.get('assetId')),
        name: String(data.get('name') ?? ''),
        unit: String(data.get('unit') ?? ''),
        readingType: String(data.get('readingType')),
        minThreshold: optionalNumber(data.get('minThreshold')),
        maxThreshold: optionalNumber(data.get('maxThreshold')),
      });
      await onCreated();
    } catch (reason) {
      setError(reason as CmmsApiError);
    } finally {
      setSaving(false);
    }
  }
  return (
    <form onSubmit={submit} className="mt-5 grid gap-3 rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4 md:grid-cols-3">
      <Field id="meter-asset" label="Asset">
        <select id="meter-asset" name="assetId" required className={selectClass} defaultValue="">
          <option value="" disabled>Select an asset</option>
          {assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name} ({asset.assetTag})</option>)}
        </select>
      </Field>
      <Field id="meter-name" label="Name"><Input id="meter-name" name="name" required maxLength={120} /></Field>
      <Field id="meter-unit" label="Unit"><Input id="meter-unit" name="unit" required maxLength={32} placeholder="hours, °C, mm/s" /></Field>
      <Field id="meter-type" label="Type">
        <select id="meter-type" name="readingType" className={selectClass} defaultValue="GAUGE">
          <option value="GAUGE">Gauge</option>
          <option value="COUNTER">Counter</option>
        </select>
      </Field>
      <Field id="meter-min" label="Minimum"><Input id="meter-min" name="minThreshold" type="number" step="any" /></Field>
      <Field id="meter-max" label="Maximum"><Input id="meter-max" name="maxThreshold" type="number" step="any" /></Field>
      <div className="md:col-span-3"><ActionError error={error} /></div>
      <Button type="submit" isLoading={saving} className="md:col-span-3">Add meter</Button>
    </form>
  );
}
