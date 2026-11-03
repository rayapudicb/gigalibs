'use client';

import {
  type SopExecutionV1,
  type SopFeedbackV1,
  type SopProcedureV1,
  type SopStepDurationsV1,
  type SopStepV1,
  holdsPermission,
} from '@gigalibs/contracts';
import { Button, Container, Heading, Input, StatusBadge, Table, Text, Textarea } from '@medusajs/ui';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import type { CmmsApiError } from '../api';
import { sopApi } from '../sop-api';
import { ActionError, EmptyState, ErrorState, Field, LoadingState, formatDate, selectClass } from './CmmsShared';

// WI-OI-138 M-SOP. CMMS enforces the path, the gates, the countersign by a second person and four-eyes approval; this
// screen authors revisions with a structured step editor and walks an execution one step at a time.

const statusColor = { DRAFT: 'orange', IN_REVIEW: 'blue', PUBLISHED: 'green', SUPERSEDED: 'grey', WITHDRAWN: 'red' } as const;
const gateLabel = { NONE: 'Read and continue', CONFIRM: 'Confirm', PHOTO: 'Photo', READING: 'Reading', DECISION: 'Yes / no decision' } as const;
type Can = (permission: string) => boolean;
type View = { kind: 'list' } | { kind: 'procedure'; id: string } | { kind: 'execution'; id: string } | { kind: 'new' };

function readRaster(file: File): Promise<{ contentType: string; base64: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('The file could not be read.'));
    reader.onload = () => {
      const url = String(reader.result);
      resolve({ contentType: file.type, base64: url.slice(url.indexOf(',') + 1) });
    };
    reader.readAsDataURL(file);
  });
}

export function CmmsSop({ permissions = [] }: { permissions?: readonly string[] }) {
  const can = useCallback((permission: string) => holdsPermission(permissions, permission), [permissions]);
  const [view, setView] = useState<View>({ kind: 'list' });
  const back = () => setView({ kind: 'list' });
  if (view.kind === 'new') return <ProcedureEditor onDone={(id) => setView(id ? { kind: 'procedure', id } : { kind: 'list' })} />;
  if (view.kind === 'procedure')
    return <ProcedureView procedureId={view.id} can={can} onBack={back} onOpen={(id) => setView({ kind: 'procedure', id })}
      onRun={(id) => setView({ kind: 'execution', id })} />;
  if (view.kind === 'execution') return <ExecutionView executionId={view.id} can={can} onBack={back} />;
  return <Overview can={can} onNew={() => setView({ kind: 'new' })} onOpen={(id) => setView({ kind: 'procedure', id })}
    onRun={(id) => setView({ kind: 'execution', id })} />;
}

function Overview({ can, onNew, onOpen, onRun }: { can: Can; onNew: () => void; onOpen: (id: string) => void; onRun: (id: string) => void }) {
  const [procedures, setProcedures] = useState<readonly SopProcedureV1[] | null>(null);
  const [awaiting, setAwaiting] = useState<readonly SopExecutionV1[]>([]);
  const [feedback, setFeedback] = useState<readonly SopFeedbackV1[]>([]);
  const [error, setError] = useState<CmmsApiError | null>(null);
  const [actionError, setActionError] = useState<CmmsApiError | null>(null);
  const load = useCallback(() => {
    setError(null);
    sopApi.procedures().then((page) => setProcedures(page.items), (failure: CmmsApiError) => setError(failure));
    sopApi.executions({ awaitingCosign: true }).then((page) => setAwaiting(page.items), () => setAwaiting([]));
    if (can('cmms.sop.author')) sopApi.feedback('OPEN').then((page) => setFeedback(page.items), () => setFeedback([]));
  }, [can]);
  useEffect(load, [load]);
  async function resolve(event: FormEvent<HTMLFormElement>, item: SopFeedbackV1) {
    event.preventDefault();
    setActionError(null);
    try {
      await sopApi.resolveFeedback(item.id, String(new FormData(event.currentTarget).get('note')));
      load();
    } catch (failure) {
      setActionError(failure as CmmsApiError);
    }
  }
  return (
    <div className="flex flex-col gap-4">
      <Container className="p-0">
        <div className="flex flex-wrap items-end justify-between gap-3 p-6">
          <div>
            <Heading level="h2">Work instructions</Heading>
            <Text size="small" className="text-ui-fg-subtle">Step-by-step maintenance procedures with pictures, readings, decisions and countersigns.</Text>
          </div>
          {can('cmms.sop.author') ? <Button type="button" size="small" onClick={onNew}>New procedure</Button> : null}
        </div>
        {error ? <div className="px-6 pb-6"><ErrorState error={error} retry={load} /></div> : null}
        {!error && !procedures ? <LoadingState label="Loading procedures…" /> : null}
        {procedures && procedures.length === 0 ? <div className="px-6 pb-6"><EmptyState title="No procedures" text="Write the first work instruction." /></div> : null}
        {procedures && procedures.length > 0 ? (
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Code</Table.HeaderCell>
                <Table.HeaderCell>Title</Table.HeaderCell>
                <Table.HeaderCell>Revision</Table.HeaderCell>
                <Table.HeaderCell>Status</Table.HeaderCell>
                <Table.HeaderCell />
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {procedures.map((item) => (
                <Table.Row key={item.id}>
                  <Table.Cell>{item.code}{item.safetyCritical ? ' (safety critical)' : ''}</Table.Cell>
                  <Table.Cell>{item.title}</Table.Cell>
                  <Table.Cell>r{item.revision}</Table.Cell>
                  <Table.Cell><StatusBadge color={statusColor[item.status]}>{item.status.replace('_', ' ')}</StatusBadge></Table.Cell>
                  <Table.Cell className="text-right">
                    <Button type="button" size="small" variant="secondary" onClick={() => onOpen(item.id)}>Open</Button>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        ) : null}
      </Container>
      {awaiting.length > 0 ? (
        <Container className="flex flex-col gap-3 p-6">
          <Heading level="h3">Waiting for your countersign</Heading>
          {awaiting.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-ui-border-base p-3">
              <Text size="small">{item.procedureCode} r{item.revision} · by {item.executedBy} · step {item.progress.state === 'AWAITING_COSIGN' ? item.progress.stepKey : ''}</Text>
              <Button type="button" size="small" variant="secondary" onClick={() => onRun(item.id)}>Review</Button>
            </div>
          ))}
        </Container>
      ) : null}
      {feedback.length > 0 ? (
        <Container className="flex flex-col gap-3 p-6">
          <Heading level="h3">Field feedback</Heading>
          {feedback.map((item) => (
            <form key={item.id} onSubmit={(event) => resolve(event, item)} className="flex flex-col gap-2 rounded-lg border border-ui-border-base p-3">
              <Text size="small" weight="plus">{item.procedureCode} r{item.revision} · step {item.stepKey} · {item.raisedBy}, {formatDate(item.raisedAt)}</Text>
              <Text size="small">{item.text}</Text>
              <div className="flex gap-2">
                <Input name="note" size="small" placeholder="What changed or why not" required aria-label="Resolution note" />
                <Button type="submit" size="small" variant="secondary">Resolve</Button>
              </div>
            </form>
          ))}
          <ActionError error={actionError} />
        </Container>
      ) : null}
    </div>
  );
}

// ─── Authoring ──────────────────────────────────────────────────────────────────────────────────────────

type Link = 'FOLLOWING' | 'END' | string;
interface EditableStep {
  key: string; title: string; instruction: string; gate: SopStepV1['gate']['type']; unit: string; min: string; max: string;
  question: string; dualSignoff: boolean; next: Link; onYes: Link; onNo: Link;
}

const linkOf = (value: string | null | undefined): Link => (value === undefined ? 'FOLLOWING' : value === null ? 'END' : value);
const linkValue = (link: Link): string | null | undefined => (link === 'FOLLOWING' ? undefined : link === 'END' ? null : link);

function toEditable(step: SopStepV1): EditableStep {
  return {
    key: step.key, title: step.title, instruction: step.instruction, gate: step.gate.type,
    unit: step.gate.type === 'READING' ? step.gate.unit : '', min: step.gate.type === 'READING' && step.gate.min !== undefined ? String(step.gate.min) : '',
    max: step.gate.type === 'READING' && step.gate.max !== undefined ? String(step.gate.max) : '',
    question: step.gate.type === 'DECISION' ? step.gate.question : '', dualSignoff: step.dualSignoff,
    next: linkOf(step.next), onYes: linkOf(step.onYes), onNo: linkOf(step.onNo),
  };
}

function toStep(step: EditableStep): Record<string, unknown> {
  const gate = step.gate === 'READING'
    ? { type: 'READING', unit: step.unit, ...(step.min ? { min: Number(step.min) } : {}), ...(step.max ? { max: Number(step.max) } : {}) }
    : step.gate === 'DECISION' ? { type: 'DECISION', question: step.question } : { type: step.gate };
  const links: Record<string, unknown> = {};
  for (const name of step.gate === 'DECISION' ? (['next', 'onYes', 'onNo'] as const) : (['next'] as const)) {
    const value = linkValue(step[name]);
    if (value !== undefined) links[name] = value;
  }
  return { key: step.key, title: step.title, instruction: step.instruction, gate, dualSignoff: step.dualSignoff, ...links };
}

const blankStep = (index: number): EditableStep => ({
  key: `step-${index + 1}`, title: '', instruction: '', gate: 'CONFIRM', unit: '', min: '', max: '', question: '', dualSignoff: false,
  next: 'FOLLOWING', onYes: 'FOLLOWING', onNo: 'FOLLOWING',
});

function ProcedureEditor({ procedure, onDone }: { procedure?: SopProcedureV1; onDone: (id?: string) => void }) {
  const [code, setCode] = useState(procedure?.code ?? '');
  const [title, setTitle] = useState(procedure?.title ?? '');
  const [safetyCritical, setSafetyCritical] = useState(procedure?.safetyCritical ?? false);
  const [steps, setSteps] = useState<EditableStep[]>(procedure ? procedure.steps.map(toEditable) : [blankStep(0)]);
  const [error, setError] = useState<CmmsApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const change = (index: number, patch: Partial<EditableStep>) => setSteps(steps.map((step, at) => (at === index ? { ...step, ...patch } : step)));
  const move = (index: number, offset: number) => {
    const target = index + offset;
    if (target < 0 || target >= steps.length) return;
    const next = [...steps];
    [next[index], next[target]] = [next[target]!, next[index]!];
    setSteps(next);
  };
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = { title, safetyCritical, steps: steps.map(toStep) };
      const saved = procedure
        ? await sopApi.update(procedure.id, { ...body, expectedVersion: procedure.version })
        : await sopApi.create({ ...body, code });
      onDone(saved.id);
    } catch (failure) {
      setError(failure as CmmsApiError);
    } finally {
      setBusy(false);
    }
  }
  const linkOptions = (self: string) => (
    <>
      <option value="FOLLOWING">The following step</option>
      <option value="END">End of procedure</option>
      {steps.filter((step) => step.key !== self).map((step) => <option key={step.key} value={step.key}>{step.key}</option>)}
    </>
  );
  return (
    <Container className="p-6">
      <form onSubmit={save} className="flex flex-col gap-4">
        <div className="flex justify-between gap-3">
          <Heading level="h2">{procedure ? `Edit ${procedure.code} r${procedure.revision}` : 'New procedure'}</Heading>
          <Button type="button" size="small" variant="secondary" onClick={() => onDone(procedure?.id)}>Cancel</Button>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Field id="sop-code" label="Code">
            <Input id="sop-code" size="small" value={code} onChange={(event) => setCode(event.target.value)} required disabled={Boolean(procedure)} />
          </Field>
          <Field id="sop-title" label="Title"><Input id="sop-title" size="small" value={title} onChange={(event) => setTitle(event.target.value)} required /></Field>
          <label className="flex items-end gap-2 txt-compact-small">
            <input type="checkbox" checked={safetyCritical} onChange={(event) => setSafetyCritical(event.target.checked)} /> Safety-critical
          </label>
        </div>
        {steps.map((step, index) => (
          <fieldset key={index} className="grid grid-cols-1 gap-3 rounded-lg border border-ui-border-base p-4 md:grid-cols-4">
            <legend className="px-1 txt-compact-small-plus">Step {index + 1}</legend>
            <Field id={`step-key-${index}`} label="Key">
              <Input id={`step-key-${index}`} size="small" value={step.key} onChange={(event) => change(index, { key: event.target.value })} required />
            </Field>
            <Field id={`step-title-${index}`} label="Title" className="md:col-span-2">
              <Input id={`step-title-${index}`} size="small" value={step.title} onChange={(event) => change(index, { title: event.target.value })} required />
            </Field>
            <Field id={`step-gate-${index}`} label="Answer">
              <select id={`step-gate-${index}`} className={selectClass} value={step.gate}
                onChange={(event) => change(index, { gate: event.target.value as EditableStep['gate'] })}>
                {Object.entries(gateLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
            <Field id={`step-instruction-${index}`} label="Instruction" className="md:col-span-4">
              <Textarea id={`step-instruction-${index}`} value={step.instruction} onChange={(event) => change(index, { instruction: event.target.value })} required />
            </Field>
            {step.gate === 'READING' ? (
              <>
                <Field id={`step-unit-${index}`} label="Unit"><Input id={`step-unit-${index}`} size="small" value={step.unit} onChange={(event) => change(index, { unit: event.target.value })} required /></Field>
                <Field id={`step-min-${index}`} label="Minimum"><Input id={`step-min-${index}`} size="small" type="number" step="any" value={step.min} onChange={(event) => change(index, { min: event.target.value })} /></Field>
                <Field id={`step-max-${index}`} label="Maximum"><Input id={`step-max-${index}`} size="small" type="number" step="any" value={step.max} onChange={(event) => change(index, { max: event.target.value })} /></Field>
              </>
            ) : null}
            {step.gate === 'DECISION' ? (
              <>
                <Field id={`step-question-${index}`} label="Question" className="md:col-span-2">
                  <Input id={`step-question-${index}`} size="small" value={step.question} onChange={(event) => change(index, { question: event.target.value })} required />
                </Field>
                <Field id={`step-yes-${index}`} label="If yes">
                  <select id={`step-yes-${index}`} className={selectClass} value={step.onYes} onChange={(event) => change(index, { onYes: event.target.value })}>{linkOptions(step.key)}</select>
                </Field>
                <Field id={`step-no-${index}`} label="If no">
                  <select id={`step-no-${index}`} className={selectClass} value={step.onNo} onChange={(event) => change(index, { onNo: event.target.value })}>{linkOptions(step.key)}</select>
                </Field>
              </>
            ) : (
              <Field id={`step-next-${index}`} label="Then">
                <select id={`step-next-${index}`} className={selectClass} value={step.next} onChange={(event) => change(index, { next: event.target.value })}>{linkOptions(step.key)}</select>
              </Field>
            )}
            <div className="flex flex-wrap items-end gap-2 md:col-span-4">
              <label className="flex items-center gap-2 txt-compact-small">
                <input type="checkbox" checked={step.dualSignoff} onChange={(event) => change(index, { dualSignoff: event.target.checked })} /> Needs a second person’s countersign
              </label>
              <Button type="button" size="small" variant="transparent" onClick={() => move(index, -1)} disabled={index === 0}>Move up</Button>
              <Button type="button" size="small" variant="transparent" onClick={() => move(index, 1)} disabled={index === steps.length - 1}>Move down</Button>
              <Button type="button" size="small" variant="transparent" onClick={() => setSteps(steps.filter((_, at) => at !== index))} disabled={steps.length === 1}>Remove</Button>
            </div>
          </fieldset>
        ))}
        <div className="flex gap-2">
          <Button type="button" size="small" variant="secondary" onClick={() => setSteps([...steps, blankStep(steps.length)])}>Add step</Button>
          <Button type="submit" size="small" isLoading={busy} disabled={busy}>Save draft</Button>
        </div>
        <ActionError error={error} />
      </form>
    </Container>
  );
}

function ProcedureView({ procedureId, can, onBack, onOpen, onRun }: {
  procedureId: string; can: Can; onBack: () => void; onOpen: (id: string) => void; onRun: (id: string) => void;
}) {
  const [procedure, setProcedure] = useState<SopProcedureV1 | null>(null);
  const [images, setImages] = useState<Record<string, string>>({});
  const [durations, setDurations] = useState<SopStepDurationsV1 | null>(null);
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState('');
  const [workOrderId, setWorkOrderId] = useState('');
  const [error, setError] = useState<CmmsApiError | null>(null);
  const [actionError, setActionError] = useState<CmmsApiError | null>(null);
  const load = useCallback(() => {
    setError(null);
    sopApi.procedure(procedureId).then((value) => {
      setProcedure(value);
      for (const key of value.stepImages)
        sopApi.stepImage(value.id, key).then((image) => setImages((current) => ({ ...current, [key]: `data:${image.contentType};base64,${image.base64}` })), () => undefined);
    }, (failure: CmmsApiError) => setError(failure));
    sopApi.durations(procedureId).then(setDurations, () => setDurations(null));
  }, [procedureId]);
  useEffect(load, [load]);
  if (error) return <ErrorState error={error} retry={load} />;
  if (!procedure) return <LoadingState label="Loading the procedure…" />;
  if (editing) return <ProcedureEditor procedure={procedure} onDone={() => { setEditing(false); load(); }} />;
  const act = async (action: 'revise' | 'submit' | 'approve' | 'reject' | 'withdraw') => {
    setActionError(null);
    try {
      const result = await sopApi.lifecycle(procedure.id, action, procedure.version, note.trim() || undefined);
      setNote('');
      if (result.id !== procedure.id) onOpen(result.id);
      else load();
    } catch (failure) {
      setActionError(failure as CmmsApiError);
    }
  };
  const start = async () => {
    setActionError(null);
    try {
      const started = await sopApi.start({ clientOperationId: crypto.randomUUID(), procedureId: procedure.id, ...(workOrderId.trim() ? { workOrderId: workOrderId.trim() } : {}) });
      onRun(started.execution.id);
    } catch (failure) {
      setActionError(failure as CmmsApiError);
    }
  };
  const upload = async (stepKey: string, file: File | undefined) => {
    if (!file) return;
    setActionError(null);
    try {
      const raster = await readRaster(file);
      await sopApi.uploadStepImage(procedure.id, stepKey, { expectedVersion: procedure.version, ...raster });
      load();
    } catch (failure) {
      setActionError(failure as CmmsApiError);
    }
  };
  const draft = procedure.status === 'DRAFT';
  return (
    <Container className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <Heading level="h2">{procedure.code} r{procedure.revision} · {procedure.title}</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Written by {procedure.authoredBy}{procedure.approvedBy ? ` · approved by ${procedure.approvedBy} ${formatDate(procedure.approvedAt)}` : ''}
            {procedure.safetyCritical ? ' · safety-critical' : ''}
          </Text>
          {procedure.reviewNote ? <Text size="small">Review note: {procedure.reviewNote}</Text> : null}
        </div>
        <div className="flex items-start gap-2">
          <StatusBadge color={statusColor[procedure.status]}>{procedure.status.replace('_', ' ')}</StatusBadge>
          <Button type="button" size="small" variant="secondary" onClick={onBack}>Back</Button>
        </div>
      </div>
      <ol className="flex flex-col gap-3">
        {procedure.steps.map((step, index) => (
          <li key={step.key} className="flex flex-col gap-2 rounded-lg border border-ui-border-base p-3 md:flex-row">
            <div className="flex-1">
              <Text size="small" weight="plus">{index + 1}. {step.title} <span className="text-ui-fg-subtle">({step.key} · {gateLabel[step.gate.type]}{step.dualSignoff ? ' · countersign' : ''})</span></Text>
              <Text size="small" className="whitespace-pre-wrap">{step.instruction}</Text>
              {step.gate.type === 'READING' ? <Text size="small" className="text-ui-fg-subtle">Limits {step.gate.min ?? '−∞'} to {step.gate.max ?? '∞'} {step.gate.unit}</Text> : null}
              {step.gate.type === 'DECISION' ? <Text size="small" className="text-ui-fg-subtle">{step.gate.question} Yes → {step.onYes ?? (step.onYes === null ? 'end' : 'following')}; no → {step.onNo ?? (step.onNo === null ? 'end' : 'following')}</Text> : null}
              {draft && can('cmms.sop.author') ? (
                <label className="mt-2 flex items-center gap-2 txt-compact-small">Picture (PNG, JPEG or WebP, up to 300 KB)
                  <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => upload(step.key, event.target.files?.[0])} />
                </label>
              ) : null}
            </div>
            {images[step.key] ? <img src={images[step.key]} alt={`Step ${index + 1}: ${step.title}`} className="max-h-48 rounded-md border border-ui-border-base object-contain" /> : null}
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-end gap-2">
        {draft && can('cmms.sop.author') ? (
          <>
            <Button type="button" size="small" variant="secondary" onClick={() => setEditing(true)}>Edit steps</Button>
            <Button type="button" size="small" onClick={() => act('submit')}>Submit for approval</Button>
          </>
        ) : null}
        {(procedure.status === 'IN_REVIEW' || procedure.status === 'PUBLISHED') && can('cmms.sop.approve') ? (
          <Field id="sop-note" label="Note" className="w-72"><Input id="sop-note" size="small" value={note} onChange={(event) => setNote(event.target.value)} /></Field>
        ) : null}
        {procedure.status === 'IN_REVIEW' && can('cmms.sop.approve') ? (
          <>
            <Button type="button" size="small" onClick={() => act('approve')}>Approve and publish</Button>
            <Button type="button" size="small" variant="secondary" onClick={() => act('reject')}>Return to author</Button>
          </>
        ) : null}
        {procedure.status === 'PUBLISHED' && can('cmms.sop.approve') ? (
          <Button type="button" size="small" variant="danger" onClick={() => act('withdraw')}>Withdraw</Button>
        ) : null}
        {procedure.status === 'PUBLISHED' && can('cmms.sop.author') ? (
          <Button type="button" size="small" variant="secondary" onClick={() => act('revise')}>Start a new revision</Button>
        ) : null}
        {procedure.status === 'PUBLISHED' && can('cmms.sop.execute') ? (
          <>
            <Field id="sop-work-order" label="Work order id (optional)" className="w-80">
              <Input id="sop-work-order" size="small" value={workOrderId} onChange={(event) => setWorkOrderId(event.target.value)} />
            </Field>
            <Button type="button" size="small" onClick={start}>Perform now</Button>
          </>
        ) : null}
      </div>
      <ActionError error={actionError} onReload={load} />
      {durations && durations.executions > 0 ? (
        <div className="flex flex-col gap-2">
          <Heading level="h3">Time per step ({durations.executions} completed)</Heading>
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Step</Table.HeaderCell>
                <Table.HeaderCell>Average</Table.HeaderCell>
                <Table.HeaderCell>Out of limits</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {durations.steps.map((row) => (
                <Table.Row key={row.stepKey}>
                  <Table.Cell>{row.stepKey}</Table.Cell>
                  <Table.Cell>{row.averageSeconds}s over {row.samples}</Table.Cell>
                  <Table.Cell>{row.outOfLimits}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </div>
      ) : null}
    </Container>
  );
}

// ─── Execution ──────────────────────────────────────────────────────────────────────────────────────────

function ExecutionView({ executionId, can, onBack }: { executionId: string; can: Can; onBack: () => void }) {
  const [execution, setExecution] = useState<SopExecutionV1 | null>(null);
  const [procedure, setProcedure] = useState<SopProcedureV1 | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [reading, setReading] = useState('');
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState<CmmsApiError | null>(null);
  const [actionError, setActionError] = useState<CmmsApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    setError(null);
    sopApi.execution(executionId).then((value) => {
      setExecution(value);
      sopApi.procedure(value.procedureId).then(setProcedure, (failure: CmmsApiError) => setError(failure));
    }, (failure: CmmsApiError) => setError(failure));
  }, [executionId]);
  useEffect(load, [load]);
  const currentKey = execution && execution.progress.state !== 'END' ? execution.progress.stepKey : null;
  useEffect(() => {
    setImage(null);
    if (procedure && currentKey && procedure.stepImages.includes(currentKey))
      sopApi.stepImage(procedure.id, currentKey).then((value) => setImage(`data:${value.contentType};base64,${value.base64}`), () => setImage(null));
  }, [procedure, currentKey]);
  if (error) return <ErrorState error={error} retry={load} />;
  if (!execution || !procedure) return <LoadingState label="Loading the execution…" />;
  const step = procedure.steps.find((item) => item.key === currentKey) ?? null;
  const run = async (task: () => Promise<unknown>) => {
    setBusy(true);
    setActionError(null);
    try {
      await task();
      load();
    } catch (failure) {
      setActionError(failure as CmmsApiError);
    } finally {
      setBusy(false);
    }
  };
  const record = (outcome: string, extra: Record<string, unknown> = {}) => run(async () => {
    await sopApi.recordStep(execution.id, { clientOperationId: crypto.randomUUID(), stepKey: currentKey, outcome, recordedAt: new Date().toISOString(), ...extra });
    setReading('');
  });
  return (
    <Container className="flex flex-col gap-4 p-6">
      <div className="flex justify-between gap-3">
        <div>
          <Heading level="h2">{execution.procedureCode} r{execution.revision}</Heading>
          <Text size="small" className="text-ui-fg-subtle">Performed by {execution.executedBy} · started {formatDate(execution.startedAt)}</Text>
        </div>
        <div className="flex items-start gap-2">
          <StatusBadge color={execution.status === 'COMPLETED' ? 'green' : 'blue'}>{execution.status.replace('_', ' ')}</StatusBadge>
          <Button type="button" size="small" variant="secondary" onClick={onBack}>Back</Button>
        </div>
      </div>
      <ol className="flex flex-col gap-1">
        {execution.results.map((result) => (
          <li key={result.sequence} className="txt-compact-small">
            ✓ {result.stepKey}: {result.outcome.replace('_', ' ').toLowerCase()}{result.reading !== null ? ` ${result.reading}` : ''}
            {result.withinLimits === false ? ' — outside limits' : ''}{result.cosignRequired ? (result.cosignedBy ? ` · countersigned by ${result.cosignedBy}` : ' · awaiting countersign') : ''}
          </li>
        ))}
      </ol>
      {execution.progress.state === 'AWAITING_COSIGN' ? (
        <div className="flex flex-col gap-2 rounded-lg border border-ui-border-base p-4">
          <Text size="small">Step {execution.progress.stepKey} needs a second person’s countersign before the procedure continues.</Text>
          {can('cmms.sop.execute') ? (
            <Button type="button" size="small" className="self-start" isLoading={busy} disabled={busy}
              onClick={() => run(() => sopApi.cosign(execution.id, (execution.progress as { stepKey: string }).stepKey))}>Countersign</Button>
          ) : null}
        </div>
      ) : null}
      {execution.status === 'IN_PROGRESS' && execution.progress.state === 'NEXT' && step ? (
        <div className="flex flex-col gap-3 rounded-lg border border-ui-border-strong p-4">
          <Heading level="h3">{step.title}</Heading>
          {image ? <img src={image} alt={step.title} className="max-h-72 self-start rounded-md border border-ui-border-base object-contain" /> : null}
          <Text className="whitespace-pre-wrap">{step.instruction}</Text>
          {step.gate.type === 'NONE' ? <Button type="button" size="small" className="self-start" disabled={busy} onClick={() => record('DONE')}>Done</Button> : null}
          {step.gate.type === 'CONFIRM' ? <Button type="button" size="small" className="self-start" disabled={busy} onClick={() => record('CONFIRMED')}>Confirm</Button> : null}
          {step.gate.type === 'DECISION' ? (
            <div className="flex items-center gap-2">
              <Text size="small" weight="plus">{step.gate.question}</Text>
              <Button type="button" size="small" disabled={busy} onClick={() => record('ANSWER_YES')}>Yes</Button>
              <Button type="button" size="small" variant="secondary" disabled={busy} onClick={() => record('ANSWER_NO')}>No</Button>
            </div>
          ) : null}
          {step.gate.type === 'READING' ? (
            <div className="flex items-end gap-2">
              <Field id="sop-reading" label={`Reading (${step.gate.unit})`} className="w-48">
                <Input id="sop-reading" size="small" type="number" step="any" value={reading} onChange={(event) => setReading(event.target.value)} />
              </Field>
              <Button type="button" size="small" disabled={busy || reading.trim() === '' || !Number.isFinite(Number(reading))}
                onClick={() => record('READING', { reading: Number(reading) })}>Record</Button>
            </div>
          ) : null}
          {step.gate.type === 'PHOTO' ? (
            <label className="flex items-center gap-2 txt-compact-small">Photo (PNG, JPEG or WebP, up to 500 KB)
              <input type="file" accept="image/png,image/jpeg,image/webp" capture="environment" disabled={busy}
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  const raster = await readRaster(file);
                  await record('PHOTO', { photoContentType: raster.contentType, photoBase64: raster.base64 });
                }} />
            </label>
          ) : null}
          {step.dualSignoff ? <Text size="small" className="text-ui-fg-subtle">A second person countersigns this step.</Text> : null}
          <div className="flex gap-2">
            <Input size="small" value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder="Something wrong with this step?" aria-label="Feedback" />
            <Button type="button" size="small" variant="transparent" disabled={!feedback.trim()}
              onClick={() => run(async () => { await sopApi.addFeedback(procedure.id, { stepKey: step.key, text: feedback.trim() }); setFeedback(''); })}>Flag</Button>
          </div>
        </div>
      ) : null}
      {execution.status === 'IN_PROGRESS' && execution.progress.state === 'END' ? (
        <Button type="button" size="small" className="self-start" isLoading={busy} disabled={busy} onClick={() => run(() => sopApi.complete(execution.id))}>Complete procedure</Button>
      ) : null}
      <ActionError error={actionError} onReload={load} />
    </Container>
  );
}
