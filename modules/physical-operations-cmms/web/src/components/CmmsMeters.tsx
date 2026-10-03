'use client';

import type {
  CmmsAssetV1,
  CmmsJobPlanV1,
  CmmsMeterReadingSourceV1,
  CmmsMeterReadingV1,
  CmmsMeterTriggerV1,
  CmmsMeterV1,
} from '@gigalibs/contracts';
import { Plus, Trash } from '@medusajs/icons';
import { Badge, Button, Container, Heading, Input, StatusBadge, Table, Text } from '@medusajs/ui';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { type CmmsApiError, cmmsApi } from '../api';
import {
  ActionError,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  formatDate,
  optionalNumber,
  optionalText,
  selectClass,
} from './CmmsShared';

const conditionColor = {
  NORMAL: 'green',
  BELOW_MINIMUM: 'orange',
  ABOVE_MAXIMUM: 'red',
  UNKNOWN: 'grey',
} as const;

const conditionLabel = {
  NORMAL: 'Within limits',
  BELOW_MINIMUM: 'Below minimum',
  ABOVE_MAXIMUM: 'Above maximum',
  UNKNOWN: 'No reading',
} as const;

const priorityBadgeColor = {
  LOW: 'grey',
  MEDIUM: 'blue',
  HIGH: 'orange',
  EMERGENCY: 'red',
} as const;

export function CmmsMeters() {
  const [meters, setMeters] = useState<readonly CmmsMeterV1[] | null>(null);
  const [assets, setAssets] = useState<readonly CmmsAssetV1[]>([]);
  const [jobPlans, setJobPlans] = useState<readonly CmmsJobPlanV1[]>([]);
  const [selected, setSelected] = useState<CmmsMeterV1 | null>(null);
  const [readings, setReadings] = useState<readonly CmmsMeterReadingV1[]>([]);
  const [triggers, setTriggers] = useState<readonly CmmsMeterTriggerV1[]>([]);
  const [activeTab, setActiveTab] = useState<'readings' | 'triggers'>('readings');
  const [showCreate, setShowCreate] = useState(false);
  const [showCreateTrigger, setShowCreateTrigger] = useState(false);
  const [error, setError] = useState<CmmsApiError | null>(null);
  const [actionError, setActionError] = useState<CmmsApiError | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [list, assetPage, jpList] = await Promise.all([
        cmmsApi.listMeters(),
        cmmsApi.searchAssets({ pageSize: 100 }),
        cmmsApi.listJobPlans(),
      ]);
      setMeters(list.items);
      setAssets(assetPage.items);
      setJobPlans(jpList.items);
    } catch (reason) {
      setError(reason as CmmsApiError);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const loadSelectedDetails = useCallback(async () => {
    if (!selected) return;
    try {
      const [readingsRes, triggersRes] = await Promise.all([
        cmmsApi.readings(selected.id),
        cmmsApi.listMeterTriggers(selected.id),
      ]);
      setReadings(readingsRes.items);
      setTriggers(triggersRes.items);
    } catch (reason) {
      setActionError(reason as CmmsApiError);
    }
  }, [selected]);

  useEffect(() => {
    void loadSelectedDetails();
  }, [loadSelectedDetails]);

  async function record(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const readAt = optionalText(data.get('readAt'));
    const source = (optionalText(data.get('source')) ?? 'MANUAL') as CmmsMeterReadingSourceV1;
    const deviceId = optionalText(data.get('deviceId'));
    setBusy(true);
    setActionError(null);
    try {
      const result = await cmmsApi.recordReading(selected.id, {
        requestKey: crypto.randomUUID(),
        value: Number(data.get('value')),
        source,
        deviceId: deviceId ?? undefined,
        ...(readAt ? { readAt: new Date(readAt).toISOString() } : {}),
        notes: optionalText(data.get('notes')),
      });
      setSelected(result.meter);
      form.reset();
      await load();
      await loadSelectedDetails();
    } catch (reason) {
      setActionError(reason as CmmsApiError);
    } finally {
      setBusy(false);
    }
  }

  async function deleteTrigger(triggerId: string) {
    if (!confirm('Are you sure you want to delete this meter trigger policy?')) return;
    setBusy(true);
    try {
      await cmmsApi.deleteMeterTrigger(triggerId);
      await loadSelectedDetails();
    } catch (reason) {
      setActionError(reason as CmmsApiError);
    } finally {
      setBusy(false);
    }
  }

  if (error && !meters) return <ErrorState error={error} retry={() => void load()} />;
  if (!meters) return <LoadingState />;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_480px]">
      <Container className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Heading level="h2">Telemetry & Meters</Heading>
            <Text size="small" className="mt-1 text-ui-fg-subtle">
              Condition-based monitoring, IoT telemetry ingestion, and automated PM triggers.
            </Text>
          </div>
          <Button
            type="button"
            size="small"
            disabled={assets.length === 0}
            onClick={() => setShowCreate((value) => !value)}
          >
            <Plus /> Add meter
          </Button>
        </div>
        {showCreate ? (
          <MeterForm
            assets={assets}
            onCreated={async () => {
              setShowCreate(false);
              await load();
            }}
          />
        ) : null}
        {meters.length === 0 ? (
          <EmptyState
            title={assets.length === 0 ? 'Register an asset first' : 'No meters'}
            text="Add run-hour counters or gauges (temperature, vibration, pressure) to assets and configure autonomous PM triggers."
          />
        ) : (
          <div className="mt-4 overflow-x-auto">
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Meter</Table.HeaderCell>
                  <Table.HeaderCell>Latest</Table.HeaderCell>
                  <Table.HeaderCell>Limits</Table.HeaderCell>
                  <Table.HeaderCell>Condition</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {meters.map((meter) => (
                  <Table.Row
                    key={meter.id}
                    className={`cursor-pointer ${selected?.id === meter.id ? 'bg-ui-bg-highlight' : ''}`}
                    onClick={() => setSelected(meter)}
                  >
                    <Table.Cell className="py-2">
                      <span className="block txt-compact-small-plus">{meter.name}</span>
                      <span className="text-xs text-ui-fg-subtle">
                        {meter.assetName} · {meter.readingType.toLowerCase()}
                      </span>
                    </Table.Cell>
                    <Table.Cell className="tabular-nums">
                      {meter.lastValue === null ? '—' : `${meter.lastValue} ${meter.unit}`}
                      <span className="block text-xs text-ui-fg-subtle">
                        {formatDate(meter.lastReadAt)}
                      </span>
                    </Table.Cell>
                    <Table.Cell className="text-xs text-ui-fg-subtle">
                      {meter.minThreshold !== null || meter.maxThreshold !== null
                        ? `[${meter.minThreshold ?? '—'}, ${meter.maxThreshold ?? '—'}]`
                        : 'No limits'}
                    </Table.Cell>
                    <Table.Cell>
                      <StatusBadge color={conditionColor[meter.condition]}>
                        {conditionLabel[meter.condition]}
                      </StatusBadge>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </div>
        )}
      </Container>

      <aside aria-label="Meter details">
        <Container className="p-5">
          {!selected ? (
            <>
              <Heading level="h2">Telemetry & Trigger Policies</Heading>
              <Text size="small" className="mt-3 text-ui-fg-subtle">
                Select a meter to record readings, ingest IoT telemetry, and manage automated PM triggers.
              </Text>
            </>
          ) : (
            <>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <Heading level="h2">{selected.name}</Heading>
                  <Text size="small" className="mt-1 text-ui-fg-subtle">
                    {selected.assetName} · Limits {selected.minThreshold ?? '—'} to{' '}
                    {selected.maxThreshold ?? '—'} {selected.unit}
                    {selected.readingType === 'COUNTER' ? ' (Continuous Counter)' : ' (Instant Gauge)'}
                  </Text>
                </div>
                <StatusBadge color={conditionColor[selected.condition]}>
                  {conditionLabel[selected.condition]}
                </StatusBadge>
              </div>

              {/* Navigation Tabs */}
              <div className="mt-4 flex border-b border-ui-border-base">
                <button
                  type="button"
                  onClick={() => setActiveTab('readings')}
                  className={`pb-2 px-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'readings'
                      ? 'border-ui-fg-interactive text-ui-fg-interactive'
                      : 'border-transparent text-ui-fg-subtle hover:text-ui-fg-base'
                  }`}
                >
                  Readings ({readings.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('triggers')}
                  className={`pb-2 px-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'triggers'
                      ? 'border-ui-fg-interactive text-ui-fg-interactive'
                      : 'border-transparent text-ui-fg-subtle hover:text-ui-fg-base'
                  }`}
                >
                  PM Trigger Policies ({triggers.length})
                </button>
              </div>

              {activeTab === 'readings' ? (
                <>
                  <form onSubmit={record} className="mt-4 grid grid-cols-2 gap-2">
                    <Input
                      name="value"
                      type="number"
                      step="any"
                      required
                      placeholder={`Value (${selected.unit})`}
                      aria-label="Reading value"
                    />
                    <select name="source" aria-label="Telemetry source" className={selectClass} defaultValue="MANUAL">
                      <option value="MANUAL">Manual Reading</option>
                      <option value="IOT_TELEMETRY">IoT Telemetry</option>
                      <option value="CONNECTOR_HUB">Connector Hub</option>
                      <option value="SCADA">SCADA / PLC</option>
                    </select>
                    <Input name="deviceId" placeholder="Sensor / Device ID (optional)" aria-label="Device ID" />
                    <Input name="readAt" type="datetime-local" aria-label="Read at (defaults to now)" />
                    <Input
                      name="notes"
                      placeholder="Notes / Observation"
                      aria-label="Reading notes"
                      className="col-span-2"
                      maxLength={2000}
                    />
                    <Button type="submit" size="small" isLoading={busy} className="col-span-2">
                      Record Telemetry Reading
                    </Button>
                  </form>
                  <ActionError error={actionError} />
                  {readings.length === 0 ? (
                    <Text size="small" className="mt-4 text-ui-fg-subtle">
                      No readings recorded yet.
                    </Text>
                  ) : (
                    <div className="mt-4 max-h-[360px] overflow-y-auto space-y-1">
                      {readings.map((reading) => (
                        <div
                          key={reading.id}
                          className="flex items-center justify-between gap-2 p-2 rounded border border-ui-border-base bg-ui-bg-subtle text-xs"
                        >
                          <div>
                            <span className="font-semibold tabular-nums text-sm">
                              {reading.value} {selected.unit}
                            </span>
                            <span className="block text-ui-fg-subtle">{formatDate(reading.readAt)}</span>
                            {reading.notes ? (
                              <span className="block text-ui-fg-muted italic mt-0.5">{reading.notes}</span>
                            ) : null}
                          </div>
                          <div className="text-right">
                            <Badge size="small" color={reading.source === 'MANUAL' ? 'grey' : 'blue'}>
                              {reading.source}
                            </Badge>
                            {reading.deviceId ? (
                              <span className="block text-ui-fg-muted mt-0.5">{reading.deviceId}</span>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="mt-3 flex items-center justify-between">
                    <Text size="small" className="text-ui-fg-subtle">
                      Autonomous rules that auto-fire PM work orders with Job Plans.
                    </Text>
                    <Button
                      type="button"
                      size="small"
                      variant="secondary"
                      onClick={() => setShowCreateTrigger((v) => !v)}
                    >
                      <Plus /> Add Trigger
                    </Button>
                  </div>

                  {showCreateTrigger ? (
                    <TriggerForm
                      meter={selected}
                      jobPlans={jobPlans}
                      onCreated={async () => {
                        setShowCreateTrigger(false);
                        await loadSelectedDetails();
                      }}
                    />
                  ) : null}

                  <ActionError error={actionError} />

                  {triggers.length === 0 ? (
                    <Text size="small" className="mt-4 text-ui-fg-subtle">
                      No automated triggers configured for this meter yet.
                    </Text>
                  ) : (
                    <div className="mt-4 space-y-2 max-h-[400px] overflow-y-auto">
                      {triggers.map((trigger) => (
                        <div
                          key={trigger.id}
                          className="p-3 rounded-lg border border-ui-border-base bg-ui-bg-subtle space-y-2 text-xs"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <span className="font-medium text-sm text-ui-fg-base block">
                                {trigger.workOrderTitle}
                              </span>
                              <span className="text-ui-fg-subtle">
                                {trigger.triggerType === 'THRESHOLD_BREACH'
                                  ? `Condition Breach (${trigger.thresholdType ?? 'Out of bounds'}${
                                      trigger.thresholdValue !== null ? `: ${trigger.thresholdValue}` : ''
                                    })`
                                  : `Usage Delta: Every ${trigger.intervalValue} ${selected.unit}`}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Badge size="small" color={priorityBadgeColor[trigger.workOrderPriority]}>
                                {trigger.workOrderPriority}
                              </Badge>
                              <Button
                                size="small"
                                variant="transparent"
                                onClick={() => void deleteTrigger(trigger.id)}
                                aria-label="Delete trigger"
                              >
                                <Trash className="text-ui-fg-error" />
                              </Button>
                            </div>
                          </div>

                          {trigger.jobPlanTitle ? (
                            <div className="text-ui-fg-muted">
                              <span className="font-semibold text-ui-fg-subtle">SOP / Job Plan:</span>{' '}
                              {trigger.jobPlanTitle}
                            </div>
                          ) : null}

                          <div className="flex justify-between items-center text-ui-fg-muted pt-1 border-t border-ui-border-base">
                            <span>
                              {trigger.lastTriggeredAt
                                ? `Last fired: ${formatDate(trigger.lastTriggeredAt)} (at ${trigger.lastTriggeredValue} ${selected.unit})`
                                : 'Never fired'}
                            </span>
                            <StatusBadge color={trigger.isActive ? 'green' : 'grey'}>
                              {trigger.isActive ? 'Active' : 'Disabled'}
                            </StatusBadge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </Container>
      </aside>
    </div>
  );
}

function MeterForm({
  assets,
  onCreated,
}: { assets: readonly CmmsAssetV1[]; onCreated: () => Promise<void> }) {
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
    <form
      onSubmit={submit}
      className="mt-5 grid gap-3 rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4 md:grid-cols-3"
    >
      <Field id="meter-asset" label="Asset">
        <select id="meter-asset" name="assetId" required className={selectClass} defaultValue="">
          <option value="" disabled>
            Select an asset
          </option>
          {assets.map((asset) => (
            <option key={asset.id} value={asset.id}>
              {asset.name} ({asset.assetTag})
            </option>
          ))}
        </select>
      </Field>
      <Field id="meter-name" label="Name">
        <Input id="meter-name" name="name" required maxLength={120} />
      </Field>
      <Field id="meter-unit" label="Unit">
        <Input id="meter-unit" name="unit" required maxLength={32} placeholder="hours, °C, mm/s" />
      </Field>
      <Field id="meter-type" label="Type">
        <select id="meter-type" name="readingType" className={selectClass} defaultValue="GAUGE">
          <option value="GAUGE">Gauge (Instantaneous)</option>
          <option value="COUNTER">Counter (Continuous)</option>
        </select>
      </Field>
      <Field id="meter-min" label="Minimum Limit">
        <Input id="meter-min" name="minThreshold" type="number" step="any" />
      </Field>
      <Field id="meter-max" label="Maximum Limit">
        <Input id="meter-max" name="maxThreshold" type="number" step="any" />
      </Field>
      <div className="md:col-span-3">
        <ActionError error={error} />
      </div>
      <Button type="submit" isLoading={saving} className="md:col-span-3">
        Add meter
      </Button>
    </form>
  );
}

function TriggerForm({
  meter,
  jobPlans,
  onCreated,
}: {
  meter: CmmsMeterV1;
  jobPlans: readonly CmmsJobPlanV1[];
  onCreated: () => Promise<void>;
}) {
  const [triggerType, setTriggerType] = useState<'THRESHOLD_BREACH' | 'USAGE_INTERVAL'>(
    meter.readingType === 'COUNTER' ? 'USAGE_INTERVAL' : 'THRESHOLD_BREACH',
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<CmmsApiError | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    try {
      await cmmsApi.createMeterTrigger({
        meterId: meter.id,
        triggerType,
        thresholdType: triggerType === 'THRESHOLD_BREACH' ? optionalText(data.get('thresholdType')) : undefined,
        thresholdValue: triggerType === 'THRESHOLD_BREACH' ? optionalNumber(data.get('thresholdValue')) : undefined,
        intervalValue: triggerType === 'USAGE_INTERVAL' ? optionalNumber(data.get('intervalValue')) : undefined,
        jobPlanId: optionalText(data.get('jobPlanId')) ?? null,
        workOrderTitle: String(data.get('workOrderTitle') ?? `Service required for ${meter.name}`),
        workOrderPriority: String(data.get('workOrderPriority') ?? 'HIGH'),
        isActive: true,
      });
      await onCreated();
    } catch (reason) {
      setError(reason as CmmsApiError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="mt-3 p-3 rounded-lg border border-ui-border-base bg-ui-bg-base space-y-3 text-xs"
    >
      <Field id="trigger-type" label="Trigger Policy Type">
        <select
          id="trigger-type"
          value={triggerType}
          onChange={(e) => setTriggerType(e.target.value as any)}
          className={selectClass}
        >
          <option value="THRESHOLD_BREACH">Condition Threshold Breach (Gauges)</option>
          <option value="USAGE_INTERVAL">Continuous Usage Delta (Counters)</option>
        </select>
      </Field>

      {triggerType === 'THRESHOLD_BREACH' ? (
        <div className="grid grid-cols-2 gap-2">
          <Field id="threshold-type" label="Breach Direction">
            <select id="threshold-type" name="thresholdType" className={selectClass} defaultValue="UPPER">
              <option value="UPPER">Above Maximum Limit</option>
              <option value="LOWER">Below Minimum Limit</option>
              <option value="OUT_OF_BOUNDS">Either Out-of-Bounds</option>
            </select>
          </Field>
          <Field id="threshold-value" label="Override Value (Optional)">
            <Input id="threshold-value" name="thresholdValue" type="number" step="any" placeholder="Default from meter" />
          </Field>
        </div>
      ) : (
        <Field id="interval-value" label={`Run Interval Delta (${meter.unit})`}>
          <Input id="interval-value" name="intervalValue" type="number" step="any" required placeholder="e.g. 500" />
        </Field>
      )}

      <Field id="trigger-job-plan" label="Linked Job Plan / SOP (Auto-populates tasks)">
        <select id="trigger-job-plan" name="jobPlanId" className={selectClass} defaultValue="">
          <option value="">— None (Generic inspection task) —</option>
          {jobPlans.map((jp) => (
            <option key={jp.id} value={jp.id}>
              {jp.code} · {jp.title}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2">
          <Field id="trigger-wo-title" label="Work Order Title">
            <Input
              id="trigger-wo-title"
              name="workOrderTitle"
              required
              defaultValue={`Maintenance alert for ${meter.name}`}
            />
          </Field>
        </div>
        <Field id="trigger-priority" label="Priority">
          <select id="trigger-priority" name="workOrderPriority" className={selectClass} defaultValue="HIGH">
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
            <option value="EMERGENCY">Emergency</option>
          </select>
        </Field>
      </div>

      <ActionError error={error} />

      <Button type="submit" size="small" isLoading={saving} className="w-full">
        Save Trigger Policy
      </Button>
    </form>
  );
}
