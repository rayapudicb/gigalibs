'use client';

import type {
  ProjectBurnMatrixV1,
  ProjectGanttV1,
  ProjectSummaryV1,
  TimesheetApprovalQueueItemV1,
} from '@gigalibs/contracts';
import { Button, Container, FocusModal, Heading, Input, StatusBadge, Table, Text } from '@medusajs/ui';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { projectOperationsApi } from '../api.js';
import { ganttBarStyle, projectTimelineRange } from '../gantt-layout.js';

function formatMinor(minor: string, currency: string): string {
  const value = Number(minor);
  if (!Number.isFinite(value)) return minor;
  return new Intl.NumberFormat(undefined, { style: 'currency', currency, minimumFractionDigits: 2 }).format(value / 100);
}

function burnBadge(consumedBasisPoints: number) {
  if (consumedBasisPoints >= 10_000) return 'red';
  if (consumedBasisPoints >= 8_000) return 'orange';
  return 'green';
}

export function ProjectOperationsWorkspace() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [projects, setProjects] = useState<ProjectSummaryV1[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [gantt, setGantt] = useState<ProjectGanttV1 | null>(null);
  const [burn, setBurn] = useState<ProjectBurnMatrixV1 | null>(null);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [approvalQueue, setApprovalQueue] = useState<TimesheetApprovalQueueItemV1[]>([]);
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});

  const loadProjects = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await projectOperationsApi.listProjects();
      setProjects(response.items);
      if (!selectedId && response.items[0]) setSelectedId(response.items[0].id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Failed to load projects.');
    } finally {
      setBusy(false);
    }
  }, [selectedId]);

  const loadInsights = useCallback(async (projectId: string) => {
    setBusy(true);
    setError(null);
    try {
      const [ganttData, burnData] = await Promise.all([
        projectOperationsApi.gantt(projectId),
        projectOperationsApi.burnMatrix(projectId),
      ]);
      setGantt(ganttData);
      setBurn(burnData);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Failed to load project insights.');
      setGantt(null);
      setBurn(null);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    if (selectedId) void loadInsights(selectedId);
  }, [selectedId, loadInsights]);

  const timeline = useMemo(() => {
    if (!gantt) return null;
    const taskStarts = gantt.phases.flatMap((phase) => phase.tasks.map((task) => task.plannedStart));
    const taskEnds = gantt.phases.flatMap((phase) => phase.tasks.map((task) => task.plannedEnd));
    return projectTimelineRange(gantt.plannedStart, gantt.plannedEnd, taskStarts, taskEnds);
  }, [gantt]);

  const loadApprovalQueue = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await projectOperationsApi.approvalQueue();
      setApprovalQueue(response.items);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Failed to load timesheet approvals.');
    } finally {
      setBusy(false);
    }
  }, []);

  const approveTimesheet = useCallback(
    async (item: TimesheetApprovalQueueItemV1) => {
      setBusy(true);
      setError(null);
      try {
        await projectOperationsApi.approveTimesheet(item.id, {
          requestKey: crypto.randomUUID(),
          expectedVersion: item.version,
        });
        await loadApprovalQueue();
        if (selectedId) await loadInsights(selectedId);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Approval failed.');
      } finally {
        setBusy(false);
      }
    },
    [loadApprovalQueue, loadInsights, selectedId],
  );

  const rejectTimesheet = useCallback(
    async (item: TimesheetApprovalQueueItemV1) => {
      const rejectionReason = rejectReason[item.id]?.trim();
      if (!rejectionReason) {
        setError('Enter a rejection reason.');
        return;
      }
      setBusy(true);
      setError(null);
      try {
        await projectOperationsApi.rejectTimesheet(item.id, {
          requestKey: crypto.randomUUID(),
          expectedVersion: item.version,
          rejectionReason,
        });
        await loadApprovalQueue();
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Rejection failed.');
      } finally {
        setBusy(false);
      }
    },
    [loadApprovalQueue, rejectReason],
  );

  const selected = projects.find((project) => project.id === selectedId) ?? null;

  return (
    <Container className="flex flex-col gap-6 py-6">
      <div className="flex flex-col gap-2">
        <Heading level="h1">Project Operations</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          Gantt, budget burn, and timesheet approval queue (Module 7 / WI-OI-129 S5–S6).
        </Text>
      </div>

      <div>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => {
            setApprovalOpen(true);
            void loadApprovalQueue();
          }}
        >
          Timesheet approvals
        </Button>
      </div>

      <FocusModal open={approvalOpen} onOpenChange={setApprovalOpen}>
        <FocusModal.Content>
          <FocusModal.Header>
            <Heading level="h2">Timesheet approval queue</Heading>
          </FocusModal.Header>
          <FocusModal.Body className="flex flex-col gap-4">
            {approvalQueue.length === 0 ? (
              <Text size="small" className="text-ui-fg-subtle">
                No submitted timesheets awaiting approval.
              </Text>
            ) : (
              <Table>
                <Table.Header>
                  <Table.Row>
                    <Table.HeaderCell>Project</Table.HeaderCell>
                    <Table.HeaderCell>Task</Table.HeaderCell>
                    <Table.HeaderCell>Worker</Table.HeaderCell>
                    <Table.HeaderCell>Date</Table.HeaderCell>
                    <Table.HeaderCell>Hours</Table.HeaderCell>
                    <Table.HeaderCell>Actions</Table.HeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {approvalQueue.map((item) => (
                    <Table.Row key={item.id}>
                      <Table.Cell>
                        {item.projectCode}
                        <Text size="xsmall" className="text-ui-fg-subtle">
                          {item.projectName}
                        </Text>
                      </Table.Cell>
                      <Table.Cell>{item.taskName}</Table.Cell>
                      <Table.Cell>{item.workerSubject}</Table.Cell>
                      <Table.Cell>{item.workDate}</Table.Cell>
                      <Table.Cell>{item.hours}</Table.Cell>
                      <Table.Cell>
                        <div className="flex flex-col gap-2">
                          <Button size="small" disabled={busy} onClick={() => void approveTimesheet(item)}>
                            Approve
                          </Button>
                          <Input
                            placeholder="Rejection reason"
                            value={rejectReason[item.id] ?? ''}
                            onChange={(event) =>
                              setRejectReason((current) => ({ ...current, [item.id]: event.target.value }))
                            }
                          />
                          <Button
                            size="small"
                            variant="danger"
                            disabled={busy}
                            onClick={() => void rejectTimesheet(item)}
                          >
                            Reject
                          </Button>
                        </div>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table>
            )}
          </FocusModal.Body>
        </FocusModal.Content>
      </FocusModal>

      {error ? (
        <Text size="small" className="text-ui-fg-error">
          {error}
        </Text>
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-ui-fg-subtle">Project</span>
          <select
            className="min-w-[16rem] rounded-md border border-ui-border-base bg-ui-bg-base px-3 py-2 text-sm"
            value={selectedId ?? ''}
            disabled={busy || projects.length === 0}
            onChange={(event) => setSelectedId(event.target.value || null)}
          >
            {projects.length === 0 ? <option value="">No projects</option> : null}
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.projectCode} — {project.name}
              </option>
            ))}
          </select>
        </label>
        {selected ? (
          <StatusBadge color={selected.status === 'ACTIVE' ? 'green' : 'grey'}>{selected.status}</StatusBadge>
        ) : null}
      </div>

      {burn ? (
        <section className="rounded-lg border border-ui-border-base p-4">
          <Heading level="h2" className="mb-3">
            Budget burn
          </Heading>
          <div className="mb-4 flex flex-wrap gap-4 text-sm">
            <div>
              <Text size="xsmall" className="text-ui-fg-subtle">
                Budget
              </Text>
              <div>{formatMinor(burn.summary.budgetMinor, burn.currencyCode)}</div>
            </div>
            <div>
              <Text size="xsmall" className="text-ui-fg-subtle">
                Accrued
              </Text>
              <div>{formatMinor(burn.summary.accruedMinor, burn.currencyCode)}</div>
            </div>
            <div>
              <Text size="xsmall" className="text-ui-fg-subtle">
                Remaining
              </Text>
              <div>{formatMinor(burn.summary.remainingMinor, burn.currencyCode)}</div>
            </div>
            <StatusBadge color={burnBadge(burn.summary.consumedBasisPoints)}>
              {(burn.summary.consumedBasisPoints / 100).toFixed(1)}% consumed
            </StatusBadge>
          </div>
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Task</Table.HeaderCell>
                <Table.HeaderCell>Planned hours</Table.HeaderCell>
                <Table.HeaderCell>Labor</Table.HeaderCell>
                <Table.HeaderCell>Material</Table.HeaderCell>
                <Table.HeaderCell>Total</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {burn.rows.map((row) => (
                <Table.Row key={row.taskId ?? row.taskName}>
                  <Table.Cell>{row.taskName}</Table.Cell>
                  <Table.Cell>{row.plannedHours}</Table.Cell>
                  <Table.Cell>{formatMinor(row.laborMinor, burn.currencyCode)}</Table.Cell>
                  <Table.Cell>{formatMinor(row.materialMinor, burn.currencyCode)}</Table.Cell>
                  <Table.Cell>{formatMinor(row.totalMinor, burn.currencyCode)}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </section>
      ) : null}

      {gantt && timeline ? (
        <section className="rounded-lg border border-ui-border-base p-4">
          <Heading level="h2" className="mb-3">
            Gantt timeline
          </Heading>
          <Text size="xsmall" className="mb-4 text-ui-fg-subtle">
            {gantt.plannedStart ?? '—'} → {gantt.plannedEnd ?? '—'}
          </Text>
          <div className="flex flex-col gap-4">
            {gantt.phases.map((phase) => (
              <div key={phase.id} className="flex flex-col gap-2">
                <Text weight="plus" size="small">
                  Phase {phase.phaseNumber}: {phase.name}
                </Text>
                {phase.tasks.length === 0 ? (
                  <Text size="xsmall" className="text-ui-fg-subtle">
                    No tasks scheduled.
                  </Text>
                ) : null}
                {phase.tasks.map((task) => {
                  const bar = ganttBarStyle(task.plannedStart, task.plannedEnd, timeline.startMs, timeline.endMs);
                  return (
                    <div key={task.id} className="grid grid-cols-[12rem_1fr] items-center gap-3 text-sm">
                      <div>
                        <div>{task.name}</div>
                        <Text size="xsmall" className="text-ui-fg-subtle">
                          {task.plannedHours}h · {task.status}
                        </Text>
                      </div>
                      <div className="relative h-7 rounded-md bg-ui-bg-subtle">
                        {bar ? (
                          <div
                            className="absolute top-1 h-5 rounded bg-ui-tag-blue-bg text-ui-tag-blue-text"
                            style={{ left: `${bar.leftPercent}%`, width: `${bar.widthPercent}%` }}
                            title={`${task.plannedStart ?? ''} – ${task.plannedEnd ?? ''}`}
                          />
                        ) : (
                          <Text size="xsmall" className="px-2 py-1 text-ui-fg-subtle">
                            Dates not set
                          </Text>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </Container>
  );
}
