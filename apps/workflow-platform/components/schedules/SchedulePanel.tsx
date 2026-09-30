'use client';

/**
 * WI-OI-104c: schedules for one report or connection. The kernel worker runs each one as its owner, re-checking the
 * owner's rights at every run. What a member may see and do comes from the core API (`canCreate`, `canManage`).
 */

import { useCallback, useEffect, useState } from 'react';
import { Alert, Badge, Button, Input, Label, Text } from '@medusajs/ui';
import type { KernelScheduleListV1, KernelScheduleRunV1, KernelScheduleV1, ScheduledOperation } from '@gigalibs/contracts';
import { requestJson } from '@/lib/client-api';
import { type Cadence, WEEKDAYS, cadenceToCron, describeCron } from '@/lib/schedules/cadence';

const BASE = '/api/control/tenants/current/schedules';
const selectClass =
  'w-full rounded-md border border-ui-border-base bg-ui-bg-field px-2 py-1.5 text-sm text-ui-fg-base focus:outline-none focus:ring-2 focus:ring-ui-border-interactive';

const RUN_LABEL: Record<KernelScheduleRunV1['status'], { label: string; color: 'green' | 'red' | 'orange' | 'grey' }> = {
  QUEUED: { label: 'queued', color: 'grey' },
  RUNNING: { label: 'running', color: 'orange' },
  RETRY_WAIT: { label: 'retrying', color: 'orange' },
  SUCCEEDED: { label: 'succeeded', color: 'green' },
  DEAD_LETTER: { label: 'failed', color: 'red' },
  CANCELLED: { label: 'cancelled', color: 'grey' },
};

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function SchedulePanel({
  operation,
  targetId,
  targetName,
}: {
  operation: ScheduledOperation;
  targetId: string;
  targetName: string;
}) {
  const [list, setList] = useState<KernelScheduleListV1 | null>(null);
  const [kind, setKind] = useState<Cadence['kind']>('daily');
  const [time, setTime] = useState('06:00');
  const [weekday, setWeekday] = useState(1);
  const [day, setDay] = useState(1);
  const [timeZone, setTimeZone] = useState(browserTimeZone);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    const query = new URLSearchParams({ operation, targetId });
    requestJson<KernelScheduleListV1>(`${BASE}?${query}`)
      .then(setList)
      .catch((cause: Error) => {
        setList({ schedules: [], canCreate: false });
        setError(cause.message);
      });
  }, [operation, targetId]);

  useEffect(refresh, [refresh]);

  const act = async (key: string, url: string, body?: unknown) => {
    setBusy(key);
    setError(null);
    try {
      await requestJson(url, {
        method: 'POST',
        ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
      });
      setConfirmRemove(null);
      refresh();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const create = () => {
    let cron: string;
    try {
      const cadence: Cadence = kind === 'daily' ? { kind, time } : kind === 'weekly' ? { kind, time, weekday } : { kind, time, day };
      cron = cadenceToCron(cadence);
    } catch (cause) {
      setError((cause as Error).message);
      return;
    }
    const name = `${targetName} · ${describeCron(cron)}`.slice(0, 120);
    void act('create', BASE, { name, operation, targetId, cron, timeZone: timeZone.trim() });
  };

  if (list === null) return <Text size="xsmall" className="text-ui-fg-subtle">Loading schedules…</Text>;

  return (
    <div className="flex flex-col gap-3">
      {error ? <Alert variant="error">{error}</Alert> : null}
      {list.schedules.length === 0 ? (
        <Text size="xsmall" className="text-ui-fg-subtle">Not scheduled.</Text>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.schedules.map((schedule) => (
            <ScheduleRow
              key={schedule.id}
              schedule={schedule}
              busy={busy}
              confirming={confirmRemove === schedule.id}
              onPause={() => void act(schedule.id, `${BASE}/${schedule.id}/pause`)}
              onResume={() => void act(schedule.id, `${BASE}/${schedule.id}/resume`)}
              onRemove={() =>
                confirmRemove === schedule.id ? void act(schedule.id, `${BASE}/${schedule.id}/remove`) : setConfirmRemove(schedule.id)
              }
            />
          ))}
        </ul>
      )}
      {list.canCreate ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[auto_auto_auto_1fr_auto] sm:items-end">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`cadence-${targetId}`} size="xsmall">Runs</Label>
            <select id={`cadence-${targetId}`} className={selectClass} value={kind} onChange={(event) => setKind(event.target.value as Cadence['kind'])}>
              <option value="daily">Every day</option>
              <option value="weekly">Every week</option>
              <option value="monthly">Every month</option>
            </select>
          </div>
          {kind === 'weekly' ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`weekday-${targetId}`} size="xsmall">On</Label>
              <select id={`weekday-${targetId}`} className={selectClass} value={weekday} onChange={(event) => setWeekday(Number(event.target.value))}>
                {WEEKDAYS.map((name, index) => (
                  <option key={name} value={index}>{name}</option>
                ))}
              </select>
            </div>
          ) : kind === 'monthly' ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`day-${targetId}`} size="xsmall">On day</Label>
              <select id={`day-${targetId}`} className={selectClass} value={day} onChange={(event) => setDay(Number(event.target.value))}>
                {Array.from({ length: 28 }, (_, index) => index + 1).map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </div>
          ) : (
            <div />
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`time-${targetId}`} size="xsmall">At</Label>
            <Input id={`time-${targetId}`} type="time" size="small" value={time} onChange={(event) => setTime(event.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`zone-${targetId}`} size="xsmall">Time zone</Label>
            <Input id={`zone-${targetId}`} size="small" value={timeZone} maxLength={64} onChange={(event) => setTimeZone(event.target.value)} />
          </div>
          <Button type="button" size="small" variant="secondary" isLoading={busy === 'create'} disabled={busy !== null} onClick={create}>
            Add schedule
          </Button>
        </div>
      ) : null}
      <Text size="xsmall" className="text-ui-fg-subtle">
        A schedule runs as the member who owns it, with that member&apos;s rights at the time of each run. If the owner
        leaves or loses the permission, it pauses; whoever resumes it becomes its owner.
      </Text>
    </div>
  );
}

function ScheduleRow({
  schedule,
  busy,
  confirming,
  onPause,
  onResume,
  onRemove,
}: {
  schedule: KernelScheduleV1;
  busy: string | null;
  confirming: boolean;
  onPause: () => void;
  onResume: () => void;
  onRemove: () => void;
}) {
  const last = schedule.lastJob ? RUN_LABEL[schedule.lastJob.status] : null;
  return (
    <li className="flex flex-col gap-2 rounded-md border border-ui-border-base px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge size="2xsmall" color={schedule.status === 'ACTIVE' ? 'green' : 'grey'}>{schedule.status === 'ACTIVE' ? 'active' : 'paused'}</Badge>
          <Text size="small" weight="plus">{describeCron(schedule.cron)}</Text>
          <Text size="xsmall" className="text-ui-fg-subtle">{schedule.timeZone}</Text>
        </div>
        <Text size="xsmall" className="tabular-nums text-ui-fg-subtle">
          {schedule.status === 'ACTIVE' ? `Next run ${new Date(schedule.nextRunAt).toLocaleString()}` : schedule.pausedReason}
          {` · owner ${schedule.owner.name ?? 'a former member'}`}
        </Text>
        {schedule.lastJob && last ? (
          <div className="flex flex-wrap items-center gap-2">
            <Badge size="2xsmall" color={last.color}>last run {last.label}</Badge>
            <Text size="xsmall" className="tabular-nums text-ui-fg-subtle">{new Date(schedule.lastJob.createdAt).toLocaleString()}</Text>
            {schedule.lastJob.errorMessage && schedule.lastJob.status !== 'SUCCEEDED' ? (
              <Text size="xsmall" className="text-ui-fg-error">{schedule.lastJob.errorMessage}</Text>
            ) : null}
          </div>
        ) : null}
      </div>
      {schedule.canManage ? (
        <div className="flex shrink-0 gap-2">
          {schedule.status === 'ACTIVE' ? (
            <Button type="button" size="small" variant="secondary" disabled={busy !== null} isLoading={busy === schedule.id} onClick={onPause}>Pause</Button>
          ) : (
            <Button type="button" size="small" variant="secondary" disabled={busy !== null} isLoading={busy === schedule.id} onClick={onResume}>Resume as me</Button>
          )}
          <Button type="button" size="small" variant={confirming ? 'danger' : 'transparent'} disabled={busy !== null} onClick={onRemove}>
            {confirming ? 'Confirm remove' : 'Remove'}
          </Button>
        </div>
      ) : null}
    </li>
  );
}
