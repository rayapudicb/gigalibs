'use client';

import { type CmmsApiError, cmmsApi } from '@/lib/cmms-api';
import type { CmmsAssetV1, CmmsPmScheduleV1 } from '@gigalibs/contracts';
import { Plus } from '@medusajs/icons';
import { Alert, Button, Checkbox, Container, Heading, Input, StatusBadge, Table, Text, Textarea } from '@medusajs/ui';
import Link from 'next/link';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { ActionError, EmptyState, ErrorState, Field, LoadingState, formatDate, optionalNumber, optionalText, selectClass } from './CmmsShared';

const UNIT_LABEL = { DAY: 'day', WEEK: 'week', MONTH: 'month', YEAR: 'year' } as const;

export function CmmsSchedules() {
  const [schedules, setSchedules] = useState<readonly CmmsPmScheduleV1[] | null>(null);
  const [assets, setAssets] = useState<readonly CmmsAssetV1[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<CmmsApiError | null>(null);
  const [actionError, setActionError] = useState<CmmsApiError | null>(null);
  const [notice, setNotice] = useState<{ number: string; id: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [list, assetPage] = await Promise.all([cmmsApi.listSchedules(), cmmsApi.searchAssets({ pageSize: 100 })]);
      setSchedules(list.items);
      setAssets(assetPage.items);
    } catch (reason) {
      setError(reason as CmmsApiError);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(schedule: CmmsPmScheduleV1, action: 'generate' | 'toggle') {
    setBusyId(schedule.id);
    setActionError(null);
    setNotice(null);
    try {
      if (action === 'generate') {
        const result = await cmmsApi.generateWorkOrder(schedule.id, schedule.version);
        setNotice({ number: result.workOrder.woNumber, id: result.workOrder.id });
      } else {
        await cmmsApi.updateSchedule(schedule.id, { expectedVersion: schedule.version, isActive: !schedule.isActive });
      }
      await load();
    } catch (reason) {
      setActionError(reason as CmmsApiError);
    } finally {
      setBusyId(null);
    }
  }

  if (error && !schedules) return <ErrorState error={error} retry={() => void load()} />;
  if (!schedules) return <LoadingState />;

  return (
    <Container className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Heading level="h2">Preventive maintenance schedules</Heading>
          <Text size="small" className="mt-1 text-ui-fg-subtle">
            Generating a due occurrence creates its work order and advances the schedule in one step; an occurrence can never produce two work orders.
          </Text>
        </div>
        <Button type="button" size="small" disabled={assets.length === 0} onClick={() => setShowCreate((value) => !value)}><Plus /> New schedule</Button>
      </div>
      {showCreate ? <ScheduleForm assets={assets} onCreated={async () => { setShowCreate(false); await load(); }} /> : null}
      {notice ? (
        <Alert variant="success" className="mt-4">
          Work order {notice.number} created. <Link href="/cmms/work-orders" className="underline">Open work orders</Link>
        </Alert>
      ) : null}
      <ActionError error={actionError} onReload={() => void load()} />
      {schedules.length === 0 ? (
        <EmptyState
          title={assets.length === 0 ? 'Register an asset first' : 'No preventive schedules'}
          text="Schedules repeat every N days, weeks, months or years in the site's time zone. Automatic generation arrives with the durable job runner; generate due work here."
        />
      ) : (
        <div className="mt-4 overflow-x-auto">
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Schedule</Table.HeaderCell>
                <Table.HeaderCell>Every</Table.HeaderCell>
                <Table.HeaderCell>Next due</Table.HeaderCell>
                <Table.HeaderCell>State</Table.HeaderCell>
                <Table.HeaderCell className="text-right">Actions</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {schedules.map((schedule) => (
                <Table.Row key={schedule.id}>
                  <Table.Cell className="py-2">
                    <span className="block txt-compact-small-plus">{schedule.name}</span>
                    <span className="text-xs text-ui-fg-subtle">{schedule.assetName ?? 'Asset'} · {schedule.taskLabels.length} task(s)</span>
                  </Table.Cell>
                  <Table.Cell>{schedule.intervalCount} {UNIT_LABEL[schedule.intervalUnit]}{schedule.intervalCount === 1 ? '' : 's'}</Table.Cell>
                  <Table.Cell>
                    {formatDate(schedule.nextDueAt)}
                    <span className="block text-xs text-ui-fg-subtle">{schedule.timeZone}{schedule.lastGeneratedAt ? ` · last ${formatDate(schedule.lastGeneratedAt)}` : ''}</span>
                  </Table.Cell>
                  <Table.Cell>
                    {!schedule.isActive ? <StatusBadge color="grey">Paused</StatusBadge> : schedule.overdue ? <StatusBadge color="red">Due</StatusBadge> : <StatusBadge color="green">Scheduled</StatusBadge>}
                  </Table.Cell>
                  <Table.Cell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button type="button" size="small" disabled={!schedule.isActive} isLoading={busyId === schedule.id} onClick={() => void act(schedule, 'generate')}>Generate due work</Button>
                      <Button type="button" size="small" variant="secondary" isLoading={busyId === schedule.id} onClick={() => void act(schedule, 'toggle')}>{schedule.isActive ? 'Pause' : 'Resume'}</Button>
                    </div>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </div>
      )}
    </Container>
  );
}

function ScheduleForm({ assets, onCreated }: { assets: readonly CmmsAssetV1[]; onCreated: () => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<CmmsApiError | null>(null);
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    try {
      await cmmsApi.createSchedule({
        name: String(data.get('name') ?? ''),
        assetId: String(data.get('assetId')),
        intervalCount: Number(data.get('intervalCount')),
        intervalUnit: String(data.get('intervalUnit')),
        timeZone: optionalText(data.get('timeZone')) ?? 'UTC',
        firstDueAt: new Date(String(data.get('firstDueAt'))).toISOString(),
        woTitle: optionalText(data.get('woTitle')) ?? String(data.get('name') ?? ''),
        woDescription: optionalText(data.get('woDescription')),
        woPriority: String(data.get('woPriority')),
        estimatedHours: optionalNumber(data.get('estimatedHours')),
        requiresSignature: data.get('requiresSignature') === 'on',
        taskLabels: String(data.get('tasks') ?? '').split('\n').map((line) => line.trim()).filter(Boolean),
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
      <Field id="pm-name" label="Schedule name"><Input id="pm-name" name="name" required maxLength={200} /></Field>
      <Field id="pm-asset" label="Asset">
        <select id="pm-asset" name="assetId" required className={selectClass} defaultValue="">
          <option value="" disabled>Select an asset</option>
          {assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name} ({asset.assetTag})</option>)}
        </select>
      </Field>
      <Field id="pm-every" label="Every">
        <div className="flex gap-2">
          <Input id="pm-every" name="intervalCount" type="number" min="1" max="3650" required defaultValue="1" className="w-20" />
          <select name="intervalUnit" aria-label="Interval unit" className={selectClass} defaultValue="MONTH">
            <option value="DAY">Days</option>
            <option value="WEEK">Weeks</option>
            <option value="MONTH">Months</option>
            <option value="YEAR">Years</option>
          </select>
        </div>
      </Field>
      <Field id="pm-first" label="First due"><Input id="pm-first" name="firstDueAt" type="datetime-local" required /></Field>
      <Field id="pm-zone" label="Time zone"><Input id="pm-zone" name="timeZone" defaultValue={zone} maxLength={64} /></Field>
      <Field id="pm-priority" label="Work priority">
        <select id="pm-priority" name="woPriority" className={selectClass} defaultValue="MEDIUM">
          {['LOW', 'MEDIUM', 'HIGH', 'EMERGENCY'].map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </Field>
      <Field id="pm-title" label="Work order title (defaults to the name)" className="md:col-span-2"><Input id="pm-title" name="woTitle" maxLength={240} /></Field>
      <Field id="pm-hours" label="Estimated hours"><Input id="pm-hours" name="estimatedHours" type="number" min="0.25" step="0.25" /></Field>
      <Field id="pm-description" label="Instructions" className="md:col-span-3"><Textarea id="pm-description" name="woDescription" rows={2} /></Field>
      <Field id="pm-tasks" label="Checklist (one required task per line)" className="md:col-span-2"><Textarea id="pm-tasks" name="tasks" rows={3} /></Field>
      <div className="flex items-center gap-2 self-end pb-1">
        <Checkbox id="pm-signature" name="requiresSignature" />
        <label htmlFor="pm-signature" className="txt-compact-small">Signature on completion</label>
      </div>
      <div className="md:col-span-3"><ActionError error={error} /></div>
      <Button type="submit" isLoading={saving} className="md:col-span-3">Create schedule</Button>
    </form>
  );
}
