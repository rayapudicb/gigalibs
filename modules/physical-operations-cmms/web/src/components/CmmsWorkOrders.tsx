'use client';

import type {
  CmmsAssetV1,
  CmmsFailureCodeV1,
  CmmsJobPlanV1,
  CmmsPageV1,
  CmmsPartV1,
  CmmsPriorityV1,
  CmmsStaffingV1,
  CmmsStoreroomV1,
  CmmsTaskStatusV1,
  CmmsWorkOrderBookingV1,
  CmmsWorkOrderDetailV1,
  CmmsWorkOrderEventV1,
  CmmsWorkOrderStatusV1,
  CmmsWorkOrderV1,
} from '@gigalibs/contracts';
import { Plus } from '@medusajs/icons';
import {
  Button,
  Checkbox,
  Container,
  Heading,
  Input,
  StatusBadge,
  Table,
  Text,
  Textarea,
} from '@medusajs/ui';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { type CmmsApiError, cmmsApi } from '../api';
import {
  ActionError,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  formatDate,
  formatMoney,
  optionalNumber,
  optionalText,
  selectClass,
  useCurrentUserId,
  useSites,
} from './CmmsShared';

type BadgeColor = 'green' | 'red' | 'blue' | 'orange' | 'grey' | 'purple';

export const statusColor: Record<CmmsWorkOrderStatusV1, BadgeColor> = {
  OPEN: 'blue',
  IN_PROGRESS: 'orange',
  ON_HOLD: 'purple',
  COMPLETED: 'green',
  CANCELLED: 'grey',
};
export const priorityColor: Record<CmmsPriorityV1, BadgeColor> = {
  LOW: 'grey',
  MEDIUM: 'blue',
  HIGH: 'orange',
  EMERGENCY: 'red',
};
const taskColor: Record<CmmsTaskStatusV1, BadgeColor> = {
  PENDING: 'grey',
  DONE: 'green',
  FAILED: 'red',
  NOT_APPLICABLE: 'purple',
};
const staffingColor: Record<CmmsStaffingV1['status'], BadgeColor> = {
  REQUESTED: 'orange',
  ACCEPTED: 'green',
  REJECTED: 'red',
  CANCELLED: 'grey',
};
function isWorkOrderClosed(workOrder: Pick<CmmsWorkOrderV1, 'signedOffAt'>): boolean {
  return workOrder.signedOffAt != null;
}

function WorkOrderStatusBadge({ workOrder }: { workOrder: CmmsWorkOrderV1 }) {
  if (isWorkOrderClosed(workOrder)) {
    return <StatusBadge color="green">Closed</StatusBadge>;
  }
  return (
    <StatusBadge color={statusColor[workOrder.status]}>
      {workOrder.status.replace('_', ' ')}
    </StatusBadge>
  );
}

const bookingColor: Record<CmmsWorkOrderBookingV1['status'], BadgeColor> = {
  DRAFT: 'grey',
  CONFIRMED: 'blue',
  DISPATCHED: 'purple',
  ON_SITE: 'orange',
  COMPLETED: 'green',
  CANCELLED: 'grey',
};
const ACTIVE: readonly CmmsWorkOrderStatusV1[] = ['OPEN', 'IN_PROGRESS', 'ON_HOLD'];
const EXECUTING: readonly CmmsWorkOrderStatusV1[] = ['IN_PROGRESS', 'ON_HOLD'];

export function CmmsWorkOrders() {
  const [page, setPage] = useState<CmmsPageV1<CmmsWorkOrderV1> | null>(null);
  const [assets, setAssets] = useState<readonly CmmsAssetV1[]>([]);
  const [status, setStatus] = useState<CmmsWorkOrderStatusV1 | 'ACTIVE' | ''>('ACTIVE');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<CmmsApiError | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [workOrders, assetPage] = await Promise.all([
        cmmsApi.searchWorkOrders({
          pageSize: 100,
          ...(status === 'ACTIVE' ? { openOnly: true } : status ? { status } : {}),
          ...(query.trim() ? { q: query.trim() } : {}),
        }),
        cmmsApi.searchAssets({ pageSize: 100 }),
      ]);
      setPage(workOrders);
      setAssets(assetPage.items);
    } catch (reason) {
      setError(reason as CmmsApiError);
    } finally {
      setLoading(false);
    }
  }, [status, query]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error && !page) return <ErrorState error={error} retry={() => void load()} />;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_520px]">
      <Container className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Heading level="h2">Work orders</Heading>
            <Text size="small" className="mt-1 text-ui-fg-subtle">
              {page ? `${page.total} matching` : 'Loading…'}
            </Text>
          </div>
          <Button type="button" size="small" onClick={() => setShowCreate((value) => !value)}>
            <Plus /> New work order
          </Button>
        </div>
        {showCreate ? (
          <CreateWorkOrderForm
            assets={assets}
            onCreated={async (workOrder) => {
              setShowCreate(false);
              setSelectedId(workOrder.id);
              await load();
            }}
          />
        ) : null}
        <form
          className="mt-5 flex flex-wrap gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void load();
          }}
        >
          <div className="min-w-[220px] flex-1">
            <Input
              type="text"
              inputMode="search"
              enterKeyHint="search"
              aria-label="Search work orders"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search title or number"
            />
          </div>
          <select
            aria-label="Status"
            value={status}
            onChange={(event) => setStatus(event.target.value as typeof status)}
            className={`${selectClass} w-auto min-w-[180px]`}
          >
            <option value="ACTIVE">Open work</option>
            <option value="">All statuses</option>
            {(['OPEN', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED'] as const).map(
              (value) => (
                <option key={value} value={value}>
                  {value.replace('_', ' ')}
                </option>
              ),
            )}
          </select>
        </form>
        {loading ? (
          <LoadingState />
        ) : !page || page.items.length === 0 ? (
          <EmptyState
            title={assets.length === 0 ? 'Register an asset first' : 'No matching work orders'}
            text={
              assets.length === 0
                ? 'Work orders are raised against assets at your sites.'
                : 'Raise a work order or change the filters.'
            }
          />
        ) : (
          <div className="mt-4 overflow-x-auto">
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Work order</Table.HeaderCell>
                  <Table.HeaderCell>Priority</Table.HeaderCell>
                  <Table.HeaderCell>Status</Table.HeaderCell>
                  <Table.HeaderCell>Due</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {page.items.map((workOrder) => (
                  <Table.Row
                    key={workOrder.id}
                    className={`cursor-pointer ${selectedId === workOrder.id ? 'bg-ui-bg-highlight' : ''}`}
                    onClick={() => setSelectedId(workOrder.id)}
                  >
                    <Table.Cell className="py-2">
                      <span className="block txt-compact-small-plus">{workOrder.title}</span>
                      <span className="font-mono text-xs text-ui-fg-subtle">
                        {workOrder.woNumber}
                        {workOrder.assetName ? ` · ${workOrder.assetName}` : ''}
                        {workOrder.triggerSource === 'PM_SCHEDULE' ? ' · preventive' : ''}
                      </span>
                    </Table.Cell>
                    <Table.Cell>
                      <StatusBadge color={priorityColor[workOrder.priority]}>
                        {workOrder.priority}
                      </StatusBadge>
                    </Table.Cell>
                    <Table.Cell>
                      <WorkOrderStatusBadge workOrder={workOrder} />
                    </Table.Cell>
                    <Table.Cell>{formatDate(workOrder.dueAt)}</Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </div>
        )}
      </Container>
      <WorkOrderPanel workOrderId={selectedId} onChanged={load} />
    </div>
  );
}

function CreateWorkOrderForm({
  assets,
  onCreated,
}: {
  assets: readonly CmmsAssetV1[];
  onCreated: (workOrder: CmmsWorkOrderDetailV1) => Promise<void>;
}) {
  const [requestKey] = useState(() => crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<CmmsApiError | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    const due = optionalText(data.get('dueAt'));
    const tasks = String(data.get('tasks') ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((label) => ({ label, required: true }));
    try {
      const workOrder = await cmmsApi.createWorkOrder({
        requestKey,
        type: String(data.get('type')),
        priority: String(data.get('priority')),
        title: String(data.get('title') ?? ''),
        description: optionalText(data.get('description')),
        assetId: optionalText(data.get('assetId')),
        dueAt: due ? new Date(due).toISOString() : undefined,
        requiresSignature: data.get('requiresSignature') === 'on',
        estimatedHours: optionalNumber(data.get('estimatedHours')),
        tasks,
      });
      await onCreated(workOrder);
    } catch (reason) {
      setError(reason as CmmsApiError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="mt-5 grid gap-3 rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4 md:grid-cols-2"
    >
      <Field id="wo-title" label="Title" className="md:col-span-2">
        <Input id="wo-title" name="title" required maxLength={240} />
      </Field>
      <Field id="wo-type" label="Type">
        <select id="wo-type" name="type" className={selectClass} defaultValue="REACTIVE">
          <option value="REACTIVE">Reactive</option>
          <option value="INSPECTION">Inspection</option>
          <option value="PREVENTIVE">Preventive</option>
          <option value="EMERGENCY">Emergency</option>
        </select>
      </Field>
      <Field id="wo-priority" label="Priority">
        <select id="wo-priority" name="priority" className={selectClass} defaultValue="MEDIUM">
          <option value="LOW">Low</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option>
          <option value="EMERGENCY">Emergency</option>
        </select>
      </Field>
      <Field id="wo-asset" label="Asset">
        <select id="wo-asset" name="assetId" className={selectClass} defaultValue="">
          <option value="">No asset</option>
          {assets.map((asset) => (
            <option key={asset.id} value={asset.id}>
              {asset.name} ({asset.assetTag})
            </option>
          ))}
        </select>
      </Field>
      <Field id="wo-due" label="Due">
        <Input id="wo-due" name="dueAt" type="datetime-local" />
      </Field>
      <Field id="wo-hours" label="Estimated hours">
        <Input id="wo-hours" name="estimatedHours" type="number" min="0.25" step="0.25" />
      </Field>
      <div className="flex items-center gap-2 self-end pb-1">
        <Checkbox id="wo-signature" name="requiresSignature" />
        <label htmlFor="wo-signature" className="txt-compact-small">
          Completion requires a signature
        </label>
      </div>
      <Field id="wo-description" label="Description" className="md:col-span-2">
        <Textarea id="wo-description" name="description" rows={3} maxLength={10000} />
      </Field>
      <Field id="wo-tasks" label="Checklist (one required task per line)" className="md:col-span-2">
        <Textarea id="wo-tasks" name="tasks" rows={3} />
      </Field>
      <div className="md:col-span-2">
        <ActionError error={error} />
      </div>
      <Button type="submit" isLoading={saving} className="md:col-span-2">
        Create work order
      </Button>
    </form>
  );
}

function WorkOrderPanel({
  workOrderId,
  onChanged,
}: { workOrderId: string | null; onChanged: () => Promise<void> }) {
  const [workOrder, setWorkOrder] = useState<CmmsWorkOrderDetailV1 | null>(null);
  const [history, setHistory] = useState<readonly CmmsWorkOrderEventV1[] | null>(null);
  const [error, setError] = useState<CmmsApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const { siteName } = useSites();

  const reload = useCallback(async () => {
    if (!workOrderId) return;
    setError(null);
    setHistory(null);
    try {
      setWorkOrder(await cmmsApi.getWorkOrder(workOrderId));
    } catch (reason) {
      setError(reason as CmmsApiError);
    }
  }, [workOrderId]);

  useEffect(() => {
    setWorkOrder(null);
    void reload();
  }, [reload]);

  /** Runs a command and reports whether it succeeded, so forms reset only after a saved change. */
  async function run(action: () => Promise<CmmsWorkOrderDetailV1>): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      setWorkOrder(await action());
      setHistory(null);
      await onChanged();
      return true;
    } catch (reason) {
      setError(reason as CmmsApiError);
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (!workOrderId) {
    return (
      <aside aria-label="Work order details">
        <Container className="p-5">
          <Heading level="h2">Work order details</Heading>
          <Text size="small" className="mt-3 text-ui-fg-subtle">
            Select a work order to execute it: start, record checklist results, log labour, issue
            parts and complete it.
          </Text>
        </Container>
      </aside>
    );
  }
  if (!workOrder) {
    return error ? (
      <ErrorState error={error} retry={() => void reload()} />
    ) : (
      <LoadingState label="Loading work order…" />
    );
  }

  const executing = EXECUTING.includes(workOrder.status);
  const active = ACTIVE.includes(workOrder.status);
  const pendingRequired = workOrder.tasks.filter(
    (task) => task.required && task.status === 'PENDING',
  ).length;

  return (
    <aside aria-label="Work order details" className="space-y-4">
      <Container className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Text size="xsmall" className="font-mono text-ui-fg-subtle">
              {workOrder.woNumber} · v{workOrder.version}
            </Text>
            <Heading level="h2" className="mt-1">
              {workOrder.title}
            </Heading>
          </div>
          <div className="flex gap-2">
            <StatusBadge color={priorityColor[workOrder.priority]}>
              {workOrder.priority}
            </StatusBadge>
            <WorkOrderStatusBadge workOrder={workOrder} />
          </div>
        </div>
        {workOrder.description ? (
          <Text size="small" className="mt-3 whitespace-pre-wrap text-ui-fg-subtle">
            {workOrder.description}
          </Text>
        ) : null}
        <dl className="mt-4 grid grid-cols-2 gap-3 txt-compact-small">
          <div>
            <dt className="text-ui-fg-subtle">Asset</dt>
            <dd>{workOrder.assetName ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-ui-fg-subtle">Site</dt>
            <dd>{siteName(workOrder.siteRef)}</dd>
          </div>
          <div>
            <dt className="text-ui-fg-subtle">Due</dt>
            <dd>{formatDate(workOrder.dueAt)}</dd>
          </div>
          <div>
            <dt className="text-ui-fg-subtle">Started</dt>
            <dd>{formatDate(workOrder.startedAt)}</dd>
          </div>
          <div>
            <dt className="text-ui-fg-subtle">Labour</dt>
            <dd className="tabular-nums">{workOrder.labourHours} h</dd>
          </div>
          <div>
            <dt className="text-ui-fg-subtle">Cost</dt>
            <dd className="tabular-nums">
              {workOrder.costs.length === 0
                ? '—'
                : workOrder.costs
                    .map((cost) => formatMoney(cost.amount, cost.currencyCode))
                    .join(' · ')}
            </dd>
          </div>
          {workOrder.completedAt ? (
            <div>
              <dt className="text-ui-fg-subtle">Completed</dt>
              <dd>
                {formatDate(workOrder.completedAt)}
                {workOrder.signed ? ' · signed' : ''}
              </dd>
            </div>
          ) : null}
          {workOrder.completionNotes ? (
            <div className="col-span-2">
              <dt className="text-ui-fg-subtle">Completion notes</dt>
              <dd>{workOrder.completionNotes}</dd>
            </div>
          ) : null}
          {isWorkOrderClosed(workOrder) ? (
            <>
              <div className="col-span-2">
                <dt className="text-ui-fg-subtle">Sign-off</dt>
                <dd>
                  Signed off by {workOrder.signedOffBy ?? '—'} on {formatDate(workOrder.signedOffAt)}
                </dd>
              </div>
              {workOrder.signOffNote ? (
                <div className="col-span-2">
                  <dt className="text-ui-fg-subtle">Sign-off note</dt>
                  <dd>{workOrder.signOffNote}</dd>
                </div>
              ) : null}
            </>
          ) : null}
        </dl>
        <StatusActions
          workOrder={workOrder}
          busy={busy}
          pendingRequired={pendingRequired}
          run={run}
        />
        <ActionError error={error} onReload={() => void reload()} />
      </Container>

      <Container className="p-5">
        <Heading level="h3">Checklist</Heading>
        {workOrder.tasks.length === 0 ? (
          <Text size="small" className="mt-2 text-ui-fg-subtle">
            No checklist tasks.
          </Text>
        ) : (
          <ul className="mt-3 space-y-3">
            {workOrder.tasks.map((task) => (
              <li key={task.id} className="rounded-md border border-ui-border-base p-3">
                <div className="flex items-start justify-between gap-2">
                  <Text size="small" weight="plus">
                    {task.position}. {task.label}
                    {task.required ? '' : ' (optional)'}
                  </Text>
                  <StatusBadge color={taskColor[task.status]}>
                    {task.status.replace('_', ' ')}
                  </StatusBadge>
                </div>
                {task.resultValue !== null || task.notes ? (
                  <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
                    {task.resultValue !== null ? `Result ${task.resultValue}. ` : ''}
                    {task.notes ?? ''}
                  </Text>
                ) : null}
                {executing ? (
                  <form
                    className="mt-2 flex flex-wrap gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const data = new FormData(event.currentTarget);
                      void run(() =>
                        cmmsApi.recordTask(workOrder.id, task.id, {
                          expectedVersion: task.version,
                          status: String(data.get('status')),
                          resultValue: optionalNumber(data.get('resultValue')) ?? null,
                          notes: optionalText(data.get('notes')) ?? null,
                        }),
                      );
                    }}
                  >
                    <select
                      name="status"
                      aria-label={`Result for ${task.label}`}
                      defaultValue={task.status === 'PENDING' ? 'DONE' : task.status}
                      className={`${selectClass} w-auto`}
                    >
                      <option value="DONE">Done</option>
                      <option value="FAILED">Failed</option>
                      <option value="NOT_APPLICABLE">Not applicable</option>
                      <option value="PENDING">Reset</option>
                    </select>
                    <Input
                      name="resultValue"
                      type="number"
                      step="any"
                      placeholder="Reading"
                      aria-label="Reading"
                      className="w-28"
                    />
                    <Input
                      name="notes"
                      placeholder="Notes"
                      aria-label="Task notes"
                      className="min-w-[120px] flex-1"
                    />
                    <Button type="submit" size="small" variant="secondary" isLoading={busy}>
                      Record
                    </Button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {active ? (
          <form
            className="mt-3 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const label = optionalText(new FormData(form).get('label'));
              if (label)
                void run(() => cmmsApi.addTask(workOrder.id, { label, required: true })).then(
                  (saved) => saved && form.reset(),
                );
            }}
          >
            <Input
              name="label"
              placeholder="Add a required task"
              aria-label="New task"
              maxLength={240}
            />
            <Button type="submit" size="small" variant="secondary" isLoading={busy}>
              Add
            </Button>
          </form>
        ) : null}
      </Container>

      <LabourCard workOrder={workOrder} busy={busy} run={run} executing={executing} />
      <PartsCard workOrder={workOrder} busy={busy} run={run} executing={executing} />
      <TcoCard workOrder={workOrder} />
      <FailureAnalysisCard workOrder={workOrder} busy={busy} reload={reload} onChanged={onChanged} />
      <StaffingCard
        workOrder={workOrder}
        busy={busy}
        run={run}
        active={active}
        refresh={() => void reload()}
      />

      <Container className="p-5">
        <Heading level="h3">Notes</Heading>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const body = optionalText(new FormData(form).get('body'));
            if (body)
              void run(() => cmmsApi.addNote(workOrder.id, body)).then(
                (saved) => saved && form.reset(),
              );
          }}
        >
          <Input name="body" placeholder="Add a note" aria-label="New note" maxLength={4000} />
          <Button type="submit" size="small" variant="secondary" isLoading={busy}>
            Add
          </Button>
        </form>
        {workOrder.notes.length === 0 ? null : (
          <ul className="mt-3 space-y-2">
            {workOrder.notes.map((note) => (
              <li key={note.id} className="txt-compact-small">
                <span className="text-ui-fg-subtle">
                  {formatDate(note.occurredAt)} · {note.actorSubject}
                </span>
                <p className="mt-0.5 whitespace-pre-wrap">{String(note.details.body ?? '')}</p>
              </li>
            ))}
          </ul>
        )}
      </Container>

      <Container className="p-5">
        <div className="flex items-center justify-between gap-3">
          <Heading level="h3">History</Heading>
          {history === null ? (
            <Button
              type="button"
              size="small"
              variant="secondary"
              onClick={() =>
                void cmmsApi.workOrderHistory(workOrder.id).then(
                  (result) => setHistory(result.items),
                  (reason) => setError(reason as CmmsApiError),
                )
              }
            >
              Show history
            </Button>
          ) : null}
        </div>
        {history ? (
          <ol className="mt-3 space-y-2">
            {history.map((event) => (
              <li key={event.id} className="txt-compact-small">
                <span className="text-ui-fg-subtle">{formatDate(event.occurredAt)}</span>{' '}
                {event.eventType.replaceAll('_', ' ').toLowerCase()}
                {event.toStatus ? ` → ${event.toStatus.replace('_', ' ')}` : ''}
                <span className="text-ui-fg-subtle"> · {event.actorSubject}</span>
              </li>
            ))}
          </ol>
        ) : null}
      </Container>
    </aside>
  );
}

function StatusActions({
  workOrder,
  busy,
  pendingRequired,
  run,
}: {
  workOrder: CmmsWorkOrderDetailV1;
  busy: boolean;
  pendingRequired: number;
  run: (action: () => Promise<CmmsWorkOrderDetailV1>) => Promise<boolean>;
}) {
  const [completing, setCompleting] = useState(false);
  const [signingOff, setSigningOff] = useState(false);
  const move = (status: CmmsWorkOrderStatusV1, extra: Record<string, unknown> = {}) =>
    run(() =>
      cmmsApi.changeStatus(workOrder.id, { expectedVersion: workOrder.version, status, ...extra }),
    );

  if (workOrder.status === 'CANCELLED') return null;
  if (workOrder.status === 'COMPLETED') {
    if (isWorkOrderClosed(workOrder)) return null;
    return (
      <div className="mt-4">
        <Button
          type="button"
          size="small"
          isLoading={busy}
          onClick={() => setSigningOff((value) => !value)}
        >
          Sign off
        </Button>
        {signingOff ? (
          <div role="dialog" aria-label="Sign off work order">
            <form
              className="mt-3 grid gap-3 rounded-lg border border-ui-border-base bg-ui-bg-subtle p-3"
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                const note = optionalText(data.get('note'));
                if (!note) return;
                void run(() =>
                  cmmsApi.signOff(workOrder.id, { expectedVersion: workOrder.version, note }),
                ).then((ok) => {
                  if (ok) setSigningOff(false);
                });
              }}
            >
              <Field id="sign-off-note" label="Sign-off note" required>
                <Textarea id="sign-off-note" name="note" rows={3} required maxLength={4000} />
              </Field>
              <Button type="submit" size="small" isLoading={busy}>
                Confirm sign-off
              </Button>
            </form>
          </div>
        ) : null}
      </div>
    );
  }
  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-2">
        {workOrder.status === 'OPEN' ? (
          <Button
            type="button"
            size="small"
            isLoading={busy}
            onClick={() => void move('IN_PROGRESS')}
          >
            Start work
          </Button>
        ) : null}
        {workOrder.status === 'ON_HOLD' ? (
          <Button
            type="button"
            size="small"
            isLoading={busy}
            onClick={() => void move('IN_PROGRESS')}
          >
            Resume
          </Button>
        ) : null}
        {workOrder.status === 'IN_PROGRESS' ? (
          <>
            <Button
              type="button"
              size="small"
              isLoading={busy}
              onClick={() => setCompleting((value) => !value)}
            >
              Complete…
            </Button>
            <Button
              type="button"
              size="small"
              variant="secondary"
              isLoading={busy}
              onClick={() => void move('ON_HOLD')}
            >
              Put on hold
            </Button>
          </>
        ) : null}
        <Button
          type="button"
          size="small"
          variant="danger"
          isLoading={busy}
          onClick={() => void move('CANCELLED')}
        >
          Cancel work order
        </Button>
      </div>
      {completing && workOrder.status === 'IN_PROGRESS' ? (
        <div role="dialog" aria-label="Complete work order">
          <form
            className="mt-3 grid gap-3 rounded-lg border border-ui-border-base bg-ui-bg-subtle p-3"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const signature = optionalText(data.get('signature'));
              void move('COMPLETED', {
                notes: optionalText(data.get('notes')),
                ...(signature ? { signatureData: `typed:${signature}` } : {}),
              });
            }}
          >
            {pendingRequired > 0 ? (
              <Text size="small" className="text-ui-fg-error">
                {pendingRequired} required task(s) still pending; record them before completing.
              </Text>
            ) : null}
            <Field id="complete-notes" label="Completion notes">
              <Textarea id="complete-notes" name="notes" rows={2} maxLength={4000} />
            </Field>
            {workOrder.requiresSignature ? (
              <Field id="complete-signature" label="Signature (type your full name)">
                <Input id="complete-signature" name="signature" required maxLength={200} />
              </Field>
            ) : null}
            <Button type="submit" size="small" isLoading={busy}>
              Confirm completion
            </Button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function LabourCard({
  workOrder,
  busy,
  run,
  executing,
}: {
  workOrder: CmmsWorkOrderDetailV1;
  busy: boolean;
  executing: boolean;
  run: (action: () => Promise<CmmsWorkOrderDetailV1>) => Promise<boolean>;
}) {
  const userId = useCurrentUserId();
  return (
    <Container className="p-5">
      <Heading level="h3">Labour</Heading>
      {workOrder.labour.length === 0 ? (
        <Text size="small" className="mt-2 text-ui-fg-subtle">
          No labour logged.
        </Text>
      ) : (
        <ul className="mt-3 space-y-1">
          {workOrder.labour.map((entry) => (
            <li key={entry.id} className="flex justify-between gap-2 txt-compact-small">
              <span>
                {entry.performedOn} · {entry.workerRef} · {entry.timeCategory.toLowerCase()}
              </span>
              <span className="tabular-nums">
                {entry.hours} h
                {entry.hourlyRate !== null && entry.currencyCode
                  ? ` · ${formatMoney(entry.hours * entry.hourlyRate, entry.currencyCode)}`
                  : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
      {executing ? (
        <form
          className="mt-3 grid grid-cols-2 gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const data = new FormData(form);
            const rate = optionalNumber(data.get('hourlyRate'));
            void run(() =>
              cmmsApi.logLabour(workOrder.id, {
                workerRef: optionalText(data.get('workerRef')) ?? userId ?? '',
                hours: Number(data.get('hours')),
                performedOn: String(data.get('performedOn')),
                timeCategory: String(data.get('timeCategory')),
                ...(rate !== undefined
                  ? {
                      hourlyRate: rate,
                      currencyCode: optionalText(data.get('currencyCode'))?.toUpperCase(),
                    }
                  : {}),
              }),
            ).then((saved) => saved && form.reset());
          }}
        >
          <Input
            name="workerRef"
            placeholder={userId ? 'Worker (defaults to you)' : 'Worker user id'}
            aria-label="Worker"
            className="col-span-2"
          />
          <Input
            name="hours"
            type="number"
            min="0.25"
            max="24"
            step="0.25"
            required
            placeholder="Hours"
            aria-label="Hours"
          />
          <Input
            name="performedOn"
            type="date"
            required
            defaultValue={new Date().toISOString().slice(0, 10)}
            aria-label="Date"
          />
          <select
            name="timeCategory"
            aria-label="Time category"
            className={selectClass}
            defaultValue="REGULAR"
          >
            <option value="REGULAR">Regular</option>
            <option value="OVERTIME">Overtime</option>
            <option value="TRAVEL">Travel</option>
          </select>
          <div className="flex gap-2">
            <Input
              name="hourlyRate"
              type="number"
              min="0"
              step="0.01"
              placeholder="Rate"
              aria-label="Hourly rate"
            />
            <Input
              name="currencyCode"
              maxLength={3}
              placeholder="USD"
              aria-label="Currency"
              className="w-20 uppercase"
            />
          </div>
          <Button
            type="submit"
            size="small"
            variant="secondary"
            isLoading={busy}
            className="col-span-2"
          >
            Log labour
          </Button>
        </form>
      ) : null}
    </Container>
  );
}

function PartsCard({
  workOrder,
  busy,
  run,
  executing,
}: {
  workOrder: CmmsWorkOrderDetailV1;
  busy: boolean;
  executing: boolean;
  run: (action: () => Promise<CmmsWorkOrderDetailV1>) => Promise<boolean>;
}) {
  const [parts, setParts] = useState<readonly CmmsPartV1[]>([]);
  const [storerooms, setStorerooms] = useState<readonly CmmsStoreroomV1[]>([]);

  useEffect(() => {
    if (!executing) return;
    let active = true;
    cmmsApi.searchParts({ pageSize: 100 }).then(
      (page) => active && setParts(page.items),
      () => undefined,
    );
    cmmsApi.listStorerooms().then(
      (res) => active && setStorerooms(res.items),
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [executing]);

  return (
    <Container className="p-5">
      <Heading level="h3">Parts used</Heading>
      {workOrder.parts.length === 0 ? (
        <Text size="small" className="mt-2 text-ui-fg-subtle">
          No parts issued.
        </Text>
      ) : (
        <ul className="mt-3 space-y-2">
          {workOrder.parts.map((part) => (
            <li
              key={part.movementId}
              className="flex items-center justify-between gap-2 border-b border-ui-border-base pb-2 last:border-0 last:pb-0 txt-compact-small"
            >
              <div>
                <span className="font-medium">
                  {part.partNumber} · {part.partName}
                </span>
                {(part.storeroomName || part.binLocation) && (
                  <span className="block text-xs text-ui-fg-subtle">
                    {part.storeroomName ? `Storeroom: ${part.storeroomName}` : ''}
                    {part.binLocation ? ` [Bin: ${part.binLocation}]` : ''}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="tabular-nums">
                  {part.quantity}
                  {part.unitCost !== null
                    ? ` · ${formatMoney(part.quantity * part.unitCost, part.currencyCode)}`
                    : ''}
                </span>
                {executing && (
                  <Button
                    type="button"
                    size="small"
                    variant="secondary"
                    className="text-xs px-2 py-0.5"
                    disabled={busy}
                    onClick={() => {
                      const qtyStr = window.prompt(
                        `Return quantity for ${part.partNumber} (max ${part.quantity}):`,
                        String(part.quantity),
                      );
                      if (!qtyStr) return;
                      const qty = Number(qtyStr);
                      if (Number.isFinite(qty) && qty > 0) {
                        void run(async () => {
                          await cmmsApi.returnPartFromWorkOrder(workOrder.id, {
                            partId: part.partId,
                            storeroomId: part.storeroomId ?? undefined,
                            binLocation: part.binLocation ?? undefined,
                            quantity: qty,
                            idempotencyKey: crypto.randomUUID(),
                          });
                          return cmmsApi.getWorkOrder(workOrder.id);
                        });
                      }
                    }}
                  >
                    Return
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {executing ? (
        <form
          className="mt-3 flex flex-wrap gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const data = new FormData(form);
            void run(() =>
              cmmsApi.issuePart(workOrder.id, {
                partId: String(data.get('partId')),
                quantity: Number(data.get('quantity')),
                storeroomId: optionalText(data.get('storeroomId')),
                binLocation: optionalText(data.get('binLocation')),
                idempotencyKey: crypto.randomUUID(),
              }),
            ).then((saved) => saved && form.reset());
          }}
        >
          <select
            name="partId"
            required
            aria-label="Part"
            className={`${selectClass} min-w-[180px] flex-1`}
            defaultValue=""
          >
            <option value="" disabled>
              Select a part
            </option>
            {parts.map((part) => (
              <option key={part.id} value={part.id}>
                {part.partNumber} · {part.name} (
                {part.nonStock ? 'non-stock' : `${part.quantityOnHand} on hand`})
              </option>
            ))}
          </select>
          <select
            name="storeroomId"
            aria-label="Storeroom"
            className={`${selectClass} min-w-[140px]`}
            defaultValue=""
          >
            <option value="">Default store</option>
            {storerooms.map((store) => (
              <option key={store.id} value={store.id}>
                {store.code} ({store.name})
              </option>
            ))}
          </select>
          <Input
            name="binLocation"
            placeholder="Bin (opt)"
            aria-label="Bin location"
            className="w-24"
            maxLength={120}
          />
          <Input
            name="quantity"
            type="number"
            min="0.001"
            step="any"
            required
            placeholder="Qty"
            aria-label="Quantity"
            className="w-20"
          />
          <Button type="submit" size="small" variant="secondary" isLoading={busy}>
            Issue
          </Button>
        </form>
      ) : null}
    </Container>
  );
}

function TcoCard({ workOrder }: { workOrder: CmmsWorkOrderDetailV1 }) {
  const tco = workOrder.tco;
  const currency = tco?.currencyCode ?? 'USD';
  const totalCost = tco?.totalCost ?? 0;
  const labourCost = tco?.labourCost ?? 0;
  const partsCost = tco?.partsCost ?? 0;
  const labourHours = tco?.labourHours ?? 0;
  const partsCount = tco?.partsCount ?? 0;

  return (
    <Container className="p-5">
      <div className="flex items-center justify-between">
        <Heading level="h3">Total Cost of Ownership (TCO)</Heading>
        <span className="font-mono text-base font-semibold text-ui-fg-base tabular-nums">
          {formatMoney(totalCost, currency)}
        </span>
      </div>
      <Text size="small" className="mt-1 text-ui-fg-subtle">
        Real-time financial roll-up aggregating logged craft labour and MRO storeroom materials.
      </Text>
      <div className="mt-4 grid grid-cols-2 gap-3 txt-compact-small">
        <div className="rounded-md border border-ui-border-base bg-ui-bg-subtle p-3">
          <dt className="text-ui-fg-subtle">Labour ({labourHours.toFixed(1)} hrs)</dt>
          <dd className="mt-1 font-mono text-sm font-medium tabular-nums">
            {formatMoney(labourCost, currency)}
          </dd>
        </div>
        <div className="rounded-md border border-ui-border-base bg-ui-bg-subtle p-3">
          <dt className="text-ui-fg-subtle">Parts & Materials ({partsCount} items)</dt>
          <dd className="mt-1 font-mono text-sm font-medium tabular-nums">
            {formatMoney(partsCost, currency)}
          </dd>
        </div>
      </div>
    </Container>
  );
}

/**
 * Staffing through Workforce (WI-OI-068): CMMS asks for people with capabilities for a window; Workforce answers
 * asynchronously (accepted, or refused with a reason) and its bookings appear here. CMMS keeps no worker records.
 */
function StaffingCard({
  workOrder,
  busy,
  run,
  active,
  refresh,
}: {
  workOrder: CmmsWorkOrderDetailV1;
  busy: boolean;
  active: boolean;
  run: (action: () => Promise<CmmsWorkOrderDetailV1>) => Promise<boolean>;
  refresh: () => void;
}) {
  const staffing = workOrder.staffing;
  const live =
    staffing !== null && (staffing.status === 'REQUESTED' || staffing.status === 'ACCEPTED');
  const [cancelling, setCancelling] = useState(false);
  return (
    <Container className="p-5">
      <div className="flex items-center justify-between gap-3">
        <Heading level="h3">Staffing</Heading>
        {live ? (
          <Button type="button" size="small" variant="transparent" onClick={refresh}>
            Refresh
          </Button>
        ) : null}
      </div>
      {staffing ? (
        <div className="mt-3 rounded-md border border-ui-border-base p-3">
          <div className="flex items-start justify-between gap-2">
            <Text size="small" weight="plus">
              {staffing.headcount} ×{' '}
              {staffing.capabilityCodes.length
                ? staffing.capabilityCodes.join(', ')
                : 'any capability'}
            </Text>
            <StatusBadge color={staffingColor[staffing.status]}>{staffing.status}</StatusBadge>
          </div>
          <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
            {formatDate(staffing.startsAt)} → {formatDate(staffing.endsAt)}
          </Text>
          {staffing.status === 'REQUESTED' ? (
            <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
              Waiting for Workforce to accept the request.
            </Text>
          ) : null}
          {staffing.rejectionReason ? (
            <Text size="xsmall" className="mt-1 text-ui-fg-error">
              Workforce refused: {staffing.rejectionReason}
            </Text>
          ) : null}
        </div>
      ) : (
        <Text size="small" className="mt-2 text-ui-fg-subtle">
          No staffing requested. Ask Workforce for qualified people for this job.
        </Text>
      )}
      {workOrder.bookings.length > 0 ? (
        <ul className="mt-3 space-y-1">
          {workOrder.bookings.map((booking) => (
            <li
              key={booking.bookingRef}
              className="flex items-center justify-between gap-2 txt-compact-small"
            >
              <span>
                {booking.resourceName ?? 'Booked resource'} · {formatDate(booking.startsAt)}
              </span>
              <StatusBadge color={bookingColor[booking.status]}>
                {booking.status.replace('_', ' ')}
              </StatusBadge>
            </li>
          ))}
        </ul>
      ) : null}
      {live ? (
        cancelling ? (
          <form
            className="mt-3 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const reason = optionalText(new FormData(event.currentTarget).get('reason'));
              if (reason)
                void run(() => cmmsApi.cancelStaffing(workOrder.id, reason)).then(
                  (saved) => saved && setCancelling(false),
                );
            }}
          >
            <Input
              name="reason"
              required
              maxLength={500}
              placeholder="Why is staffing no longer needed?"
              aria-label="Cancellation reason"
            />
            <Button type="submit" size="small" variant="danger" isLoading={busy}>
              Withdraw
            </Button>
          </form>
        ) : (
          <Button
            type="button"
            size="small"
            variant="secondary"
            className="mt-3"
            onClick={() => setCancelling(true)}
          >
            Withdraw request…
          </Button>
        )
      ) : null}
      {active && !live ? (
        <form
          className="mt-3 grid grid-cols-2 gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const codes = String(data.get('capabilityCodes') ?? '')
              .split(',')
              .map((code) => code.trim())
              .filter(Boolean);
            void run(() =>
              cmmsApi.requestStaffing(workOrder.id, {
                startsAt: new Date(String(data.get('startsAt'))).toISOString(),
                endsAt: new Date(String(data.get('endsAt'))).toISOString(),
                headcount: Number(data.get('headcount')),
                capabilityCodes: codes,
              }),
            );
          }}
        >
          <Field id="staffing-starts" label="From">
            <Input id="staffing-starts" name="startsAt" type="datetime-local" required />
          </Field>
          <Field id="staffing-ends" label="Until">
            <Input id="staffing-ends" name="endsAt" type="datetime-local" required />
          </Field>
          <Field id="staffing-headcount" label="People">
            <Input
              id="staffing-headcount"
              name="headcount"
              type="number"
              min="1"
              max="50"
              defaultValue="1"
              required
            />
          </Field>
          <Field id="staffing-capabilities" label="Capability codes">
            <Input
              id="staffing-capabilities"
              name="capabilityCodes"
              placeholder="e.g. MECH-L2, LOTO"
              maxLength={400}
            />
          </Field>
          <Button
            type="submit"
            size="small"
            variant="secondary"
            isLoading={busy}
            className="col-span-2"
          >
            Request staffing
          </Button>
        </form>
      ) : null}
    </Container>
  );
}
// ─── Failure Analysis & Job Plans Card ───────────────────────────────────────

function FailureAnalysisCard({
  workOrder,
  busy,
  reload,
  onChanged,
}: {
  workOrder: CmmsWorkOrderDetailV1;
  busy: boolean;
  reload: () => Promise<void>;
  onChanged: () => Promise<void>;
}) {
  const [problems, setProblems] = useState<readonly CmmsFailureCodeV1[]>([]);
  const [causes, setCauses] = useState<readonly CmmsFailureCodeV1[]>([]);
  const [remedies, setRemedies] = useState<readonly CmmsFailureCodeV1[]>([]);
  const [jobPlans, setJobPlans] = useState<readonly CmmsJobPlanV1[]>([]);
  const [selectedProblem, setSelectedProblem] = useState(workOrder.failureProblemId ?? '');
  const [selectedCause, setSelectedCause] = useState(workOrder.failureCauseId ?? '');
  const [selectedRemedy, setSelectedRemedy] = useState(workOrder.failureRemedyId ?? '');
  const [selectedJobPlan, setSelectedJobPlan] = useState(workOrder.jobPlanId ?? '');
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [safetyNotes, setSafetyNotes] = useState<string[]>([]);
  const active = ACTIVE.includes(workOrder.status);

  useEffect(() => {
    void Promise.all([
      cmmsApi.listFailureCodes('PROBLEM'),
      cmmsApi.listFailureCodes('CAUSE'),
      cmmsApi.listFailureCodes('REMEDY'),
      cmmsApi.listJobPlans(),
    ]).then(([p, c, r, jp]) => {
      setProblems(p.items);
      setCauses(c.items);
      setRemedies(r.items);
      setJobPlans(jp.items);
    });
  }, []);

  // When job plan selection changes, surface safety notes from plan.safetyGuidelines and SAFETY_CHECK tasks
  useEffect(() => {
    const plan = jobPlans.find((p) => p.id === selectedJobPlan);
    if (plan) {
      const notes: string[] = [];
      if (plan.safetyGuidelines) notes.push(`📋 Safety guidelines: ${plan.safetyGuidelines}`);
      const safetyTasks = plan.tasks.filter((t) => t.taskType === 'SAFETY_CHECK');
      for (const t of safetyTasks) {
        notes.push(`⚠️ LOTO/Safety check required: ${t.label} (${t.estimatedMinutes} min)`);
      }
      setSafetyNotes(notes);
    } else {
      setSafetyNotes([]);
    }
  }, [selectedJobPlan, jobPlans]);


  async function saveAttribution() {
    setSaving(true);
    setError(null);
    try {
      await cmmsApi.recordFailureAttribution(workOrder.id, {
        expectedVersion: workOrder.version,
        failureProblemId: selectedProblem || null,
        failureCauseId: selectedCause || null,
        failureRemedyId: selectedRemedy || null,
      });
      await reload();
      await onChanged();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function applyJobPlan() {
    if (!selectedJobPlan) return;
    setApplying(true);
    setApplyError(null);
    try {
      await cmmsApi.applyJobPlan(selectedJobPlan, workOrder.id, workOrder.version);
      await reload();
      await onChanged();
    } catch (reason) {
      setApplyError((reason as Error).message);
    } finally {
      setApplying(false);
    }
  }

  return (
    <Container className="p-5">
      <Heading level="h3">Failure Analysis & Standard Procedures</Heading>

      {/* Current attribution summary */}
      {(workOrder.failureProblemCode || workOrder.jobPlanTitle) ? (
        <dl className="mt-3 grid grid-cols-2 gap-2 txt-compact-small">
          {workOrder.failureProblemCode ? (
            <div>
              <dt className="text-ui-fg-subtle">Problem</dt>
              <dd>{workOrder.failureProblemCode}</dd>
            </div>
          ) : null}
          {workOrder.failureCauseCode ? (
            <div>
              <dt className="text-ui-fg-subtle">Cause</dt>
              <dd>{workOrder.failureCauseCode}</dd>
            </div>
          ) : null}
          {workOrder.failureRemedyCode ? (
            <div>
              <dt className="text-ui-fg-subtle">Remedy</dt>
              <dd>{workOrder.failureRemedyCode}</dd>
            </div>
          ) : null}
          {workOrder.jobPlanTitle ? (
            <div>
              <dt className="text-ui-fg-subtle">SOP / Job Plan</dt>
              <dd>{workOrder.jobPlanTitle}</dd>
            </div>
          ) : null}
        </dl>
      ) : (
        <Text size="small" className="mt-2 text-ui-fg-subtle">
          No failure attribution or job plan recorded yet.
        </Text>
      )}

      {active ? (
        <>
          {/* Failure Attribution */}
          <div className="mt-4 space-y-3">
            <Text size="small" weight="plus">Record failure codes (Problem → Cause → Remedy)</Text>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="txt-compact-xsmall text-ui-fg-subtle block mb-1">Problem</label>
                <select
                  aria-label="Failure problem"
                  value={selectedProblem}
                  onChange={(e) => setSelectedProblem(e.target.value)}
                  className={selectClass}
                >
                  <option value="">— none —</option>
                  {problems.map((p) => (
                    <option key={p.id} value={p.id}>{p.code} · {p.description}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="txt-compact-xsmall text-ui-fg-subtle block mb-1">Cause</label>
                <select
                  aria-label="Failure cause"
                  value={selectedCause}
                  onChange={(e) => setSelectedCause(e.target.value)}
                  className={selectClass}
                >
                  <option value="">— none —</option>
                  {causes.map((c) => (
                    <option key={c.id} value={c.id}>{c.code} · {c.description}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="txt-compact-xsmall text-ui-fg-subtle block mb-1">Remedy</label>
                <select
                  aria-label="Failure remedy"
                  value={selectedRemedy}
                  onChange={(e) => setSelectedRemedy(e.target.value)}
                  className={selectClass}
                >
                  <option value="">— none —</option>
                  {remedies.map((r) => (
                    <option key={r.id} value={r.id}>{r.code} · {r.description}</option>
                  ))}
                </select>
              </div>
            </div>
            {error ? <Text size="small" className="text-ui-fg-error">{error}</Text> : null}
            <Button
              size="small"
              variant="secondary"
              isLoading={saving || busy}
              onClick={() => void saveAttribution()}
            >
              Save failure attribution
            </Button>
          </div>

          {/* Apply Job Plan / SOP */}
          <div className="mt-5 space-y-3 border-t border-ui-border-base pt-4">
            <Text size="small" weight="plus">Apply Standard Operating Procedure / Job Plan</Text>
            {jobPlans.length === 0 ? (
              <Text size="small" className="text-ui-fg-subtle">No job plans available.</Text>
            ) : (
              <>
                <select
                  aria-label="Select job plan"
                  value={selectedJobPlan}
                  onChange={(e) => setSelectedJobPlan(e.target.value)}
                  className={selectClass}
                >
                  <option value="">— select a job plan —</option>
                  {jobPlans.map((jp) => (
                    <option key={jp.id} value={jp.id}>
                      {jp.code} · {jp.title}
                      {jp.estimatedDurationMinutes ? ` (${jp.estimatedDurationMinutes} min)` : ''}
                    </option>
                  ))}
                </select>

                {/* Safety / LOTO guidance */}
                {safetyNotes.length > 0 ? (
                  <div className="rounded-md border border-ui-tag-orange-border bg-ui-tag-orange-bg p-3 space-y-1">
                    <Text size="small" weight="plus" className="text-ui-tag-orange-text">
                      ⚠️ Safety & LOTO requirements
                    </Text>
                    {safetyNotes.map((note, i) => (
                      <Text key={i} size="xsmall" className="text-ui-tag-orange-text">{note}</Text>
                    ))}
                  </div>
                ) : null}

                {applyError ? (
                  <Text size="small" className="text-ui-fg-error">{applyError}</Text>
                ) : null}

                <Button
                  size="small"
                  variant="secondary"
                  isLoading={applying || busy}
                  disabled={!selectedJobPlan}
                  onClick={() => void applyJobPlan()}
                >
                  Apply SOP tasks to work order
                </Button>
              </>
            )}
          </div>
        </>
      ) : null}
    </Container>
  );
}
