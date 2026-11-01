'use client';

import {
  CALIBRATION_APPROVAL_STATEMENT,
  CALIBRATION_REJECTION_STATEMENT,
  CALIBRATION_TECHNICIAN_STATEMENT,
  type CalibrationCertificateV1,
  type CalibrationDriftV1,
  type CalibrationInstrumentBundleV1,
  type CalibrationInstrumentV1,
  type CalibrationPointResultV1,
  type CalibrationProfileV1,
  type CalibrationRecordV1,
  type CalibrationStandardV1,
  type CmmsAssetV1,
  calibrationNominal,
  evaluateCalibrationPoint,
  holdsPermission,
} from '@gigalibs/contracts';
import { Badge, Button, Container, Heading, Input, StatusBadge, Table, Text, Textarea } from '@medusajs/ui';
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { type CmmsApiError, cmmsApi } from '../api';
import { calibrationApi } from '../calibration-api';
import { ActionError, EmptyState, ErrorState, Field, LoadingState, formatDate, optionalText, selectClass } from './CmmsShared';

// WI-OI-134 M-CAL. Every figure comes from CMMS calibration records; the live checks in the capture form use the same
// function the server uses to recompute each point, so what the technician sees is what CMMS stores.

type Tab = 'instruments' | 'records' | 'profiles' | 'standards';
const TABS: ReadonlyArray<{ key: Tab; label: string }> = [
  { key: 'instruments', label: 'Instruments due' },
  { key: 'records', label: 'Records & approval' },
  { key: 'profiles', label: 'Profiles' },
  { key: 'standards', label: 'Master standards' },
];
const dueColor = { NEVER: 'grey', OVERDUE: 'red', DUE_SOON: 'orange', CURRENT: 'green' } as const;
const dueLabel = { NEVER: 'Never calibrated', OVERDUE: 'Overdue', DUE_SOON: 'Due soon', CURRENT: 'Current' } as const;
const resultColor = { PASS: 'green', ADJUSTED: 'blue', FAIL: 'red' } as const;
const statusColor = { SUBMITTED: 'orange', APPROVED: 'green', REJECTED: 'grey' } as const;

function useLoad<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<CmmsApiError | null>(null);
  const reload = useCallback(() => {
    setError(null);
    load().then(setData, (failure: CmmsApiError) => setError(failure));
  }, [load]);
  useEffect(reload, [reload]);
  return { data, error, reload };
}

export function CmmsCalibration({ permissions = [] }: { permissions?: readonly string[] }) {
  const [tab, setTab] = useState<Tab>('instruments');
  const can = useCallback((permission: string) => holdsPermission(permissions, permission), [permissions]);
  return (
    <div className="flex flex-col gap-4">
      <nav className="flex gap-2 overflow-x-auto" aria-label="Calibration views">
        {TABS.map((item) => (
          <Button key={item.key} type="button" size="small" variant={tab === item.key ? 'primary' : 'secondary'}
            aria-pressed={tab === item.key} onClick={() => setTab(item.key)}>
            {item.label}
          </Button>
        ))}
      </nav>
      {tab === 'instruments' ? <Instruments canExecute={can('cmms.calibration.execute')} /> : null}
      {tab === 'records' ? <Records canApprove={can('cmms.calibration.approve')} /> : null}
      {tab === 'profiles' ? <Profiles canManage={can('cmms.calibration.manage')} canPublish={can('cmms.calibration.publish')} /> : null}
      {tab === 'standards' ? <Standards canManage={can('cmms.calibration.manage')} /> : null}
    </div>
  );
}

// ─── Instruments due ───────────────────────────────────────────────────────────────────────────────────

function Instruments({ canExecute }: { canExecute: boolean }) {
  const load = useCallback(() => calibrationApi.instruments(), []);
  const { data, error, reload } = useLoad(load);
  const [capture, setCapture] = useState<CalibrationInstrumentV1 | null>(null);
  const [drift, setDrift] = useState<CalibrationInstrumentV1 | null>(null);
  if (error) return <ErrorState error={error} retry={reload} />;
  if (!data) return <LoadingState label="Loading instruments…" />;
  if (capture)
    return <CaptureForm instrument={capture} onClose={(changed) => { setCapture(null); if (changed) reload(); }} />;
  return (
    <Container className="p-0">
      <div className="p-6">
        <Heading level="h2">Instruments due for calibration</Heading>
        <Text size="small" className="mt-1 text-ui-fg-subtle">
          Instruments with a published calibration profile, ordered by next due date.
        </Text>
      </div>
      {data.items.length === 0 ? (
        <div className="px-6 pb-6">
          <EmptyState title="No calibrated instruments yet" text="Draft a calibration profile for an instrument and have a metrology lead publish it." />
        </div>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Instrument</Table.HeaderCell>
              <Table.HeaderCell>Status</Table.HeaderCell>
              <Table.HeaderCell>Due</Table.HeaderCell>
              <Table.HeaderCell>Last result</Table.HeaderCell>
              <Table.HeaderCell>Awaiting approval</Table.HeaderCell>
              <Table.HeaderCell />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {data.items.map((item) => (
              <Table.Row key={item.assetId}>
                <Table.Cell>
                  <Text size="small" weight="plus">{item.assetTag}</Text>
                  <Text size="xsmall" className="text-ui-fg-subtle">{item.assetName} · profile r{item.profileRevision}</Text>
                </Table.Cell>
                <Table.Cell><Badge size="2xsmall">{item.assetStatus}</Badge></Table.Cell>
                <Table.Cell>
                  <StatusBadge color={dueColor[item.dueState]}>{dueLabel[item.dueState]}</StatusBadge>
                  <Text size="xsmall" className="text-ui-fg-subtle">{item.nextDueAt ? formatDate(item.nextDueAt) : '—'}</Text>
                </Table.Cell>
                <Table.Cell>
                  {item.lastResult ? <StatusBadge color={resultColor[item.lastResult]}>{item.lastResult}</StatusBadge> : '—'}
                </Table.Cell>
                <Table.Cell>{item.awaitingApproval}</Table.Cell>
                <Table.Cell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button type="button" size="small" variant="secondary" onClick={() => setDrift(drift?.assetId === item.assetId ? null : item)}>
                      Drift
                    </Button>
                    {canExecute ? (
                      <Button type="button" size="small" onClick={() => setCapture(item)}>Calibrate</Button>
                    ) : null}
                  </div>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}
      {drift ? <DriftPanel instrument={drift} /> : null}
    </Container>
  );
}

function DriftPanel({ instrument }: { instrument: CalibrationInstrumentV1 }) {
  const load = useCallback(() => calibrationApi.drift(instrument.assetId), [instrument.assetId]);
  const { data, error, reload } = useLoad<CalibrationDriftV1>(load);
  if (error) return <div className="p-6"><ErrorState error={error} retry={reload} /></div>;
  if (!data) return <LoadingState label="Loading drift…" />;
  const nominals = [...new Set(data.series.flatMap((entry) => entry.points.map((point) => point.nominalPercent)))].sort((a, b) => a - b);
  return (
    <div className="border-t border-ui-border-base p-6">
      <Heading level="h3">As-found drift: {instrument.assetTag}</Heading>
      <Text size="small" className="mt-1 text-ui-fg-subtle">
        As-found error in percent of output span at each test point, from approved calibrations in the last five years.
      </Text>
      {data.series.length === 0 ? (
        <Text size="small" className="mt-3">No approved calibrations yet.</Text>
      ) : (
        <Table className="mt-3">
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Calibrated</Table.HeaderCell>
              <Table.HeaderCell>Result</Table.HeaderCell>
              {nominals.map((nominal) => <Table.HeaderCell key={nominal}>{nominal}%</Table.HeaderCell>)}
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {data.series.map((entry) => (
              <Table.Row key={entry.recordId}>
                <Table.Cell>{formatDate(entry.completedAt)}</Table.Cell>
                <Table.Cell><StatusBadge color={resultColor[entry.overallResult]}>{entry.overallResult}</StatusBadge></Table.Cell>
                {nominals.map((nominal) => {
                  const point = entry.points.find((candidate) => candidate.nominalPercent === nominal);
                  return <Table.Cell key={nominal}>{point ? `${point.asFoundErrorPercentSpan}%` : '—'}</Table.Cell>;
                })}
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}
    </div>
  );
}

// ─── Capture ───────────────────────────────────────────────────────────────────────────────────────────

type Cells = Record<number, { measured: string; applied: string }>;

function evaluateCells(bundle: CalibrationInstrumentBundleV1, phase: 'AS_FOUND' | 'AS_LEFT', cells: Cells) {
  return bundle.profile.definition.testPoints.map((_, position) => {
    const cell = cells[position];
    const measured = cell?.measured.trim() ? Number(cell.measured) : Number.NaN;
    const applied = cell?.applied.trim() ? Number(cell.applied) : undefined;
    if (!Number.isFinite(measured) || (applied !== undefined && !Number.isFinite(applied))) return null;
    return evaluateCalibrationPoint(bundle.profile.definition, phase, position, measured, applied);
  });
}

function PointGrid({ bundle, phase, cells, onChange }: {
  bundle: CalibrationInstrumentBundleV1; phase: 'AS_FOUND' | 'AS_LEFT'; cells: Cells; onChange: (cells: Cells) => void;
}) {
  const definition = bundle.profile.definition;
  const results = evaluateCells(bundle, phase, cells);
  const label = phase === 'AS_FOUND' ? 'As found' : 'As left';
  return (
    <Table>
      <Table.Header>
        <Table.Row>
          <Table.HeaderCell>Point</Table.HeaderCell>
          <Table.HeaderCell>Applied ({definition.inputUnit})</Table.HeaderCell>
          <Table.HeaderCell>Expected ({definition.outputUnit})</Table.HeaderCell>
          <Table.HeaderCell>{label} ({definition.outputUnit})</Table.HeaderCell>
          <Table.HeaderCell>Error</Table.HeaderCell>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {definition.testPoints.map((percent, position) => {
          const nominal = calibrationNominal(definition, percent);
          const result = results[position];
          const cell = cells[position] ?? { measured: '', applied: '' };
          return (
            <Table.Row key={position}>
              <Table.Cell>{percent}%</Table.Cell>
              <Table.Cell>
                <Input aria-label={`${label} applied input at ${percent}%`} inputMode="decimal" size="small" placeholder={String(nominal.input)}
                  value={cell.applied} onChange={(event) => onChange({ ...cells, [position]: { ...cell, applied: event.target.value } })} />
              </Table.Cell>
              <Table.Cell>{result ? result.expectedOutput : nominal.output}</Table.Cell>
              <Table.Cell>
                <Input aria-label={`${label} reading at ${percent}%`} inputMode="decimal" size="small" value={cell.measured}
                  onChange={(event) => onChange({ ...cells, [position]: { ...cell, measured: event.target.value } })} />
              </Table.Cell>
              <Table.Cell>
                {result ? (
                  <StatusBadge color={result.withinTolerance ? 'green' : 'red'}>
                    {result.errorPercentSpan}% · {result.withinTolerance ? 'Pass' : 'Fail'}
                  </StatusBadge>
                ) : '—'}
              </Table.Cell>
            </Table.Row>
          );
        })}
      </Table.Body>
    </Table>
  );
}

function CaptureForm({ instrument, onClose }: { instrument: CalibrationInstrumentV1; onClose: (changed: boolean) => void }) {
  const load = useCallback(() => calibrationApi.bundle(instrument.assetId), [instrument.assetId]);
  const { data: bundle, error, reload } = useLoad(load);
  const [operationId] = useState(() => crypto.randomUUID());
  const [startedAt] = useState(() => new Date().toISOString());
  const [standards, setStandards] = useState<string[]>([]);
  const [asFound, setAsFound] = useState<Cells>({});
  const [asLeft, setAsLeft] = useState<Cells | null>(null);
  const [notes, setNotes] = useState('');
  const [attested, setAttested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<CmmsApiError | null>(null);
  const [saved, setSaved] = useState<CalibrationRecordV1 | null>(null);

  const foundResults = useMemo(() => (bundle ? evaluateCells(bundle, 'AS_FOUND', asFound) : []), [bundle, asFound]);
  const leftResults = useMemo(() => (bundle && asLeft ? evaluateCells(bundle, 'AS_LEFT', asLeft) : []), [bundle, asLeft]);
  if (error) return <ErrorState error={error} retry={reload} />;
  if (!bundle) return <LoadingState label="Loading the calibration profile…" />;
  if (saved) return <RecordDetail record={saved} canApprove={false} onBack={() => onClose(true)} />;

  const foundComplete = foundResults.every((result) => result !== null);
  const leftComplete = !asLeft || leftResults.every((result) => result !== null);
  const foundFails = foundComplete && foundResults.some((result) => result && !result.withinTolerance);
  const toPoints = (cells: Cells) => bundle.profile.definition.testPoints.map((_, position) => ({
    position, measuredOutput: Number(cells[position]!.measured),
    ...(cells[position]!.applied.trim() ? { appliedInput: Number(cells[position]!.applied) } : {}),
  }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!bundle) return;
    setBusy(true);
    setActionError(null);
    try {
      const result = await calibrationApi.submit({
        clientOperationId: operationId, assetId: instrument.assetId, profileId: bundle.profile.id,
        profileRevision: bundle.profile.revision, standardIds: standards, startedAt, completedAt: new Date().toISOString(),
        asFound: toPoints(asFound), ...(asLeft ? { asLeft: toPoints(asLeft) } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}), statement: CALIBRATION_TECHNICIAN_STATEMENT,
      });
      setSaved(result.record);
    } catch (failure) {
      setActionError(failure as CmmsApiError);
    } finally {
      setBusy(false);
    }
  }

  const usable = bundle.standards.filter((standard) => standard.usable);
  return (
    <Container className="p-6">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Heading level="h2">Calibrate {instrument.assetTag}</Heading>
            <Text size="small" className="text-ui-fg-subtle">
              {bundle.profile.definition.inputLrv}–{bundle.profile.definition.inputUrv} {bundle.profile.definition.inputUnit} →{' '}
              {bundle.profile.definition.outputLrv}–{bundle.profile.definition.outputUrv} {bundle.profile.definition.outputUnit} ·
              tolerance ±{bundle.profile.definition.toleranceValue}
              {bundle.profile.definition.toleranceMode === 'PERCENT_SPAN' ? '% of span' : ` ${bundle.profile.definition.outputUnit}`} ·
              profile r{bundle.profile.revision}
            </Text>
            {bundle.profile.definition.procedure ? (
              <Text size="small" className="mt-2 whitespace-pre-line">{bundle.profile.definition.procedure}</Text>
            ) : null}
          </div>
          <Button type="button" size="small" variant="secondary" onClick={() => onClose(false)}>Cancel</Button>
        </div>
        <Field id="calibration-standards" label="Master standards used">
          {usable.length === 0 ? (
            <Text size="small" className="text-ui-fg-error">No master standard in your scope is within its certificate.</Text>
          ) : (
            <div className="flex flex-col gap-1" id="calibration-standards">
              {usable.map((standard) => (
                <label key={standard.id} className="flex items-center gap-2 txt-compact-small">
                  <input type="checkbox" checked={standards.includes(standard.id)}
                    onChange={(event) => setStandards(event.target.checked ? [...standards, standard.id] : standards.filter((value) => value !== standard.id))} />
                  {standard.code} · {standard.name} · certificate {standard.certificateNumber} valid to {standard.validUntil}
                </label>
              ))}
            </div>
          )}
        </Field>
        <Heading level="h3">As found</Heading>
        <PointGrid bundle={bundle} phase="AS_FOUND" cells={asFound} onChange={setAsFound} />
        {foundFails && !asLeft ? (
          <div className="flex flex-wrap items-center gap-3">
            <Text size="small" className="text-ui-fg-error">Out of tolerance. Adjust the instrument and record as-left readings, or submit as failed.</Text>
            <Button type="button" size="small" variant="secondary" onClick={() => setAsLeft({})}>Record as-left readings</Button>
          </div>
        ) : null}
        {asLeft ? (
          <>
            <div className="flex items-center justify-between">
              <Heading level="h3">As left</Heading>
              <Button type="button" size="small" variant="transparent" onClick={() => setAsLeft(null)}>Remove as-left</Button>
            </div>
            <PointGrid bundle={bundle} phase="AS_LEFT" cells={asLeft} onChange={setAsLeft} />
          </>
        ) : null}
        <Field id="calibration-notes" label="Notes (optional)">
          <Textarea id="calibration-notes" value={notes} maxLength={2000} onChange={(event) => setNotes(event.target.value)} />
        </Field>
        <label className="flex items-start gap-2 txt-compact-small">
          <input type="checkbox" checked={attested} onChange={(event) => setAttested(event.target.checked)} />
          {CALIBRATION_TECHNICIAN_STATEMENT}
        </label>
        <Text size="xsmall" className="text-ui-fg-subtle">
          CMMS recomputes every point. A failed instrument is taken out of service and a corrective work order is raised.
        </Text>
        <ActionError error={actionError} />
        <div>
          <Button type="submit" isLoading={busy}
            disabled={busy || !attested || standards.length === 0 || !foundComplete || !leftComplete}>
            Submit calibration
          </Button>
        </div>
      </form>
    </Container>
  );
}

// ─── Records and approval ──────────────────────────────────────────────────────────────────────────────

function Records({ canApprove }: { canApprove: boolean }) {
  const [status, setStatus] = useState<string>('SUBMITTED');
  const load = useCallback(() => calibrationApi.records(status ? { status } : {}), [status]);
  const { data, error, reload } = useLoad(load);
  const [open, setOpen] = useState<CalibrationRecordV1 | null>(null);
  if (open) return <RecordDetail record={open} canApprove={canApprove} onBack={() => { setOpen(null); reload(); }} />;
  return (
    <Container className="p-0">
      <div className="flex flex-wrap items-end justify-between gap-3 p-6">
        <div>
          <Heading level="h2">Calibration records</Heading>
          <Text size="small" className="text-ui-fg-subtle">Records awaiting approval come first; open one to review it.</Text>
        </div>
        <Field id="calibration-status" label="Status" className="w-48">
          <select id="calibration-status" className={selectClass} value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="SUBMITTED">Awaiting approval</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
            <option value="">All</option>
          </select>
        </Field>
      </div>
      {error ? <div className="px-6 pb-6"><ErrorState error={error} retry={reload} /></div> : null}
      {!error && !data ? <LoadingState label="Loading calibration records…" /> : null}
      {data && data.items.length === 0 ? (
        <div className="px-6 pb-6"><EmptyState title="No records" text="Nothing matches this status." /></div>
      ) : null}
      {data && data.items.length > 0 ? (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Instrument</Table.HeaderCell>
              <Table.HeaderCell>Calibrated</Table.HeaderCell>
              <Table.HeaderCell>Technician</Table.HeaderCell>
              <Table.HeaderCell>Result</Table.HeaderCell>
              <Table.HeaderCell>Status</Table.HeaderCell>
              <Table.HeaderCell />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {data.items.map((record) => (
              <Table.Row key={record.id}>
                <Table.Cell>{record.assetTag}</Table.Cell>
                <Table.Cell>{formatDate(record.completedAt)}</Table.Cell>
                <Table.Cell>{record.technician}</Table.Cell>
                <Table.Cell>
                  <StatusBadge color={resultColor[record.overallResult]}>{record.overallResult}</StatusBadge>
                  {record.impactReviewRequired ? <Badge size="2xsmall" color="orange" className="ml-2">Impact review</Badge> : null}
                </Table.Cell>
                <Table.Cell><StatusBadge color={statusColor[record.status]}>{record.status}</StatusBadge></Table.Cell>
                <Table.Cell className="text-right">
                  <Button type="button" size="small" variant="secondary" onClick={() => setOpen(record)}>Open</Button>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      ) : null}
    </Container>
  );
}

function PointsTable({ points, unit }: { points: readonly CalibrationPointResultV1[]; unit: string }) {
  return (
    <Table>
      <Table.Header>
        <Table.Row>
          <Table.HeaderCell>Phase</Table.HeaderCell>
          <Table.HeaderCell>Point</Table.HeaderCell>
          <Table.HeaderCell>Applied</Table.HeaderCell>
          <Table.HeaderCell>Expected ({unit})</Table.HeaderCell>
          <Table.HeaderCell>Measured ({unit})</Table.HeaderCell>
          <Table.HeaderCell>Error</Table.HeaderCell>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {points.map((point) => (
          <Table.Row key={`${point.phase}-${point.position}`}>
            <Table.Cell>{point.phase === 'AS_FOUND' ? 'As found' : 'As left'}</Table.Cell>
            <Table.Cell>{point.nominalPercent}%</Table.Cell>
            <Table.Cell>{point.appliedInput}</Table.Cell>
            <Table.Cell>{point.expectedOutput}</Table.Cell>
            <Table.Cell>{point.measuredOutput}</Table.Cell>
            <Table.Cell>
              <StatusBadge color={point.withinTolerance ? 'green' : 'red'}>{point.errorPercentSpan}% of span</StatusBadge>
            </Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </Table>
  );
}

function RecordDetail({ record: initial, canApprove, onBack }: { record: CalibrationRecordV1; canApprove: boolean; onBack: () => void }) {
  const [record, setRecord] = useState(initial);
  const [note, setNote] = useState('');
  const [attested, setAttested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<CmmsApiError | null>(null);
  const [certificate, setCertificate] = useState<CalibrationCertificateV1 | null>(null);

  async function decide(decision: 'APPROVE' | 'REJECT') {
    setBusy(true);
    setActionError(null);
    try {
      setRecord(await calibrationApi.decide(record.id, {
        decision, expectedVersion: record.version, ...(note.trim() ? { note: note.trim() } : {}),
        statement: decision === 'APPROVE' ? CALIBRATION_APPROVAL_STATEMENT : CALIBRATION_REJECTION_STATEMENT,
      }));
    } catch (failure) {
      setActionError(failure as CmmsApiError);
    } finally {
      setBusy(false);
    }
  }
  async function openCertificate() {
    setActionError(null);
    try {
      setCertificate(await calibrationApi.certificate(record.id));
    } catch (failure) {
      setActionError(failure as CmmsApiError);
    }
  }
  if (certificate) return <Certificate certificate={certificate} onBack={() => setCertificate(null)} />;

  return (
    <Container className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Heading level="h2">{record.assetTag} · {formatDate(record.completedAt)}</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {record.assetName} · technician {record.technician} · profile r{record.profileRevision}
          </Text>
        </div>
        <Button type="button" size="small" variant="secondary" onClick={onBack}>Back</Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <StatusBadge color={statusColor[record.status]}>{record.status}</StatusBadge>
        <StatusBadge color={resultColor[record.overallResult]}>Result {record.overallResult}</StatusBadge>
        <Badge size="2xsmall">As found {record.asFoundResult}</Badge>
        {record.asLeftResult ? <Badge size="2xsmall">As left {record.asLeftResult}</Badge> : null}
      </div>
      {record.impactReviewRequired ? (
        <Text size="small" className="text-ui-fg-error">
          As found out of tolerance: review product made with this instrument since its last calibration.
        </Text>
      ) : null}
      {record.overallResult === 'FAIL' ? (
        <Text size="small">
          Corrective work order raised{record.assetTakenOffline ? '; the instrument was taken out of service' : ''}.
        </Text>
      ) : null}
      <PointsTable points={record.points} unit={record.definition.outputUnit} />
      <div>
        <Text size="small" weight="plus">Standards</Text>
        {record.standards.map((standard) => (
          <Text key={standard.id} size="small">
            {standard.code} · {standard.name} · certificate {standard.certificateNumber} valid to {standard.validUntil}
          </Text>
        ))}
      </div>
      {record.notes ? <Text size="small">Notes: {record.notes}</Text> : null}
      <Text size="xsmall" className="break-all text-ui-fg-subtle">Record SHA-256 {record.recordSha256}</Text>
      {record.decidedBy ? (
        <Text size="small">
          {record.status === 'APPROVED' ? 'Approved' : 'Rejected'} by {record.decidedBy} on {formatDate(record.decidedAt)}
          {record.decisionNote ? `: ${record.decisionNote}` : ''}
        </Text>
      ) : null}
      {record.status === 'SUBMITTED' && canApprove ? (
        <div className="flex flex-col gap-3 rounded-lg border border-ui-border-base p-4">
          <Field id="calibration-decision-note" label="Decision note (required to reject)">
            <Textarea id="calibration-decision-note" value={note} maxLength={2000} onChange={(event) => setNote(event.target.value)} />
          </Field>
          <label className="flex items-start gap-2 txt-compact-small">
            <input type="checkbox" checked={attested} onChange={(event) => setAttested(event.target.checked)} />
            I reviewed this record and its standards. Approving records: “{CALIBRATION_APPROVAL_STATEMENT}”
          </label>
          <div className="flex gap-2">
            <Button type="button" size="small" isLoading={busy} disabled={busy || !attested} onClick={() => decide('APPROVE')}>Approve</Button>
            <Button type="button" size="small" variant="danger" disabled={busy || !attested || !note.trim()} onClick={() => decide('REJECT')}>
              Reject
            </Button>
          </div>
          <Text size="xsmall" className="text-ui-fg-subtle">You cannot decide a calibration you performed.</Text>
        </div>
      ) : null}
      {record.status === 'APPROVED' ? (
        <div><Button type="button" size="small" variant="secondary" onClick={openCertificate}>Certificate</Button></div>
      ) : null}
      <ActionError error={actionError} />
    </Container>
  );
}

function Certificate({ certificate, onBack }: { certificate: CalibrationCertificateV1; onBack: () => void }) {
  const { record } = certificate;
  return (
    <Container className="flex flex-col gap-3 p-6">
      <div className="flex justify-between gap-3 print:hidden">
        <Button type="button" size="small" variant="secondary" onClick={onBack}>Back</Button>
        <Button type="button" size="small" onClick={() => window.print()}>Print</Button>
      </div>
      <Heading level="h1">Calibration certificate {certificate.certificateNumber}</Heading>
      <Text size="small">
        Instrument {record.assetTag} ({record.assetName}) · calibrated {formatDate(record.completedAt)} · issued {formatDate(certificate.issuedAt)}
      </Text>
      <Text size="small">
        Range {record.definition.inputLrv}–{record.definition.inputUrv} {record.definition.inputUnit} → {record.definition.outputLrv}–
        {record.definition.outputUrv} {record.definition.outputUnit}; tolerance ±{record.definition.toleranceValue}
        {record.definition.toleranceMode === 'PERCENT_SPAN' ? '% of span' : ` ${record.definition.outputUnit}`}; result {record.overallResult}
      </Text>
      <PointsTable points={record.points} unit={record.definition.outputUnit} />
      {record.standards.map((standard) => (
        <Text key={standard.id} size="small">
          Standard {standard.code} · {standard.name} · certificate {standard.certificateNumber} valid to {standard.validUntil}
        </Text>
      ))}
      <Text size="small">Performed by {record.technician}: “{record.technicianStatement}”</Text>
      <Text size="small">Approved by {record.decidedBy} on {formatDate(record.decidedAt)}: “{record.decisionStatement}”</Text>
      <Text size="xsmall" className="break-all text-ui-fg-subtle">Record SHA-256 {record.recordSha256}</Text>
      <Text size="xsmall" className="text-ui-fg-subtle">{certificate.disclaimer}</Text>
    </Container>
  );
}

// ─── Profiles ──────────────────────────────────────────────────────────────────────────────────────────

function profileInput(form: FormData) {
  return {
    inputLrv: Number(form.get('inputLrv')), inputUrv: Number(form.get('inputUrv')), inputUnit: String(form.get('inputUnit') ?? ''),
    outputLrv: Number(form.get('outputLrv')), outputUrv: Number(form.get('outputUrv')), outputUnit: String(form.get('outputUnit') ?? ''),
    transfer: String(form.get('transfer')), toleranceMode: String(form.get('toleranceMode')),
    toleranceValue: Number(form.get('toleranceValue')),
    testPoints: String(form.get('testPoints') ?? '').split(',').map((value) => Number(value.trim())).filter((value) => value.toString() !== 'NaN'),
    intervalDays: Number(form.get('intervalDays')),
    ...(optionalText(form.get('procedure')) ? { procedure: optionalText(form.get('procedure')) } : {}),
  };
}

function ProfileFields({ profile }: { profile?: CalibrationProfileV1 }) {
  const definition = profile?.definition;
  const field = (name: string, label: string, value: string | number | undefined, inputMode: 'decimal' | 'text' = 'decimal') => (
    <Field id={`profile-${name}`} label={label}>
      <Input id={`profile-${name}`} name={name} defaultValue={value === undefined ? '' : String(value)} inputMode={inputMode} required size="small" />
    </Field>
  );
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {field('inputLrv', 'Input lower value', definition?.inputLrv ?? 0)}
      {field('inputUrv', 'Input upper value', definition?.inputUrv)}
      {field('inputUnit', 'Input unit', definition?.inputUnit, 'text')}
      {field('outputLrv', 'Output lower value', definition?.outputLrv ?? 4)}
      {field('outputUrv', 'Output upper value', definition?.outputUrv ?? 20)}
      {field('outputUnit', 'Output unit', definition?.outputUnit ?? 'mA', 'text')}
      <Field id="profile-transfer" label="Transfer function">
        <select id="profile-transfer" name="transfer" className={selectClass} defaultValue={definition?.transfer ?? 'LINEAR'}>
          <option value="LINEAR">Linear</option>
          <option value="SQUARE_ROOT">Square root (flow)</option>
        </select>
      </Field>
      <Field id="profile-toleranceMode" label="Tolerance">
        <select id="profile-toleranceMode" name="toleranceMode" className={selectClass} defaultValue={definition?.toleranceMode ?? 'PERCENT_SPAN'}>
          <option value="PERCENT_SPAN">Percent of span</option>
          <option value="ABSOLUTE">Absolute (output units)</option>
        </select>
      </Field>
      {field('toleranceValue', 'Tolerance (±)', definition?.toleranceValue ?? 0.5)}
      {field('testPoints', 'Test points (% of range, comma separated)', definition?.testPoints.join(', ') ?? '0, 25, 50, 75, 100', 'text')}
      {field('intervalDays', 'Interval (days)', definition?.intervalDays ?? 365)}
      <Field id="profile-procedure" label="Procedure (optional)" className="md:col-span-3">
        <Textarea id="profile-procedure" name="procedure" defaultValue={definition?.procedure ?? ''} maxLength={4000} />
      </Field>
    </div>
  );
}

function Profiles({ canManage, canPublish }: { canManage: boolean; canPublish: boolean }) {
  const load = useCallback(() => calibrationApi.profiles(), []);
  const { data, error, reload } = useLoad(load);
  const [editing, setEditing] = useState<CalibrationProfileV1 | 'new' | null>(null);
  const [assets, setAssets] = useState<readonly CmmsAssetV1[]>([]);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<CmmsApiError | null>(null);

  useEffect(() => {
    if (editing !== 'new') return;
    cmmsApi.searchAssets({ pageSize: 100 }).then((page) => setAssets(page.items), (failure: CmmsApiError) => setActionError(failure));
  }, [editing]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setActionError(null);
    try {
      if (editing === 'new') await calibrationApi.createProfile({ assetId: String(form.get('assetId')), ...profileInput(form) });
      else if (editing) await calibrationApi.updateProfile(editing.id, { expectedVersion: editing.version, ...profileInput(form) });
      setEditing(null);
      reload();
    } catch (failure) {
      setActionError(failure as CmmsApiError);
    } finally {
      setBusy(false);
    }
  }
  async function publish(profile: CalibrationProfileV1) {
    setActionError(null);
    try {
      await calibrationApi.publishProfile(profile.id, profile.version);
      reload();
    } catch (failure) {
      setActionError(failure as CmmsApiError);
    }
  }

  if (error) return <ErrorState error={error} retry={reload} />;
  if (!data) return <LoadingState label="Loading calibration profiles…" />;
  if (editing)
    return (
      <Container className="p-6">
        <form onSubmit={save} className="flex flex-col gap-4">
          <Heading level="h2">{editing === 'new' ? 'New calibration profile (draft)' : `Edit draft r${editing.revision}: ${editing.assetTag}`}</Heading>
          {editing === 'new' ? (
            <Field id="profile-asset" label="Instrument">
              <select id="profile-asset" name="assetId" className={selectClass} required defaultValue="">
                <option value="" disabled>Choose an instrument</option>
                {assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.assetTag} · {asset.name}</option>)}
              </select>
            </Field>
          ) : null}
          <ProfileFields profile={editing === 'new' ? undefined : editing} />
          <Text size="xsmall" className="text-ui-fg-subtle">A draft is published by a metrology lead who did not write it.</Text>
          <ActionError error={actionError} onReload={reload} />
          <div className="flex gap-2">
            <Button type="submit" isLoading={busy} disabled={busy}>Save draft</Button>
            <Button type="button" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
          </div>
        </form>
      </Container>
    );
  return (
    <Container className="p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 p-6">
        <div>
          <Heading level="h2">Calibration profiles</Heading>
          <Text size="small" className="text-ui-fg-subtle">Ranges, tolerance and test points per instrument, versioned.</Text>
        </div>
        {canManage ? <Button type="button" size="small" onClick={() => setEditing('new')}>New profile</Button> : null}
      </div>
      <div className="px-6"><ActionError error={actionError} onReload={reload} /></div>
      {data.items.length === 0 ? (
        <div className="px-6 pb-6"><EmptyState title="No profiles" text="Draft a profile for an instrument to start calibrating it." /></div>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Instrument</Table.HeaderCell>
              <Table.HeaderCell>Revision</Table.HeaderCell>
              <Table.HeaderCell>Range</Table.HeaderCell>
              <Table.HeaderCell>Tolerance</Table.HeaderCell>
              <Table.HeaderCell>Interval</Table.HeaderCell>
              <Table.HeaderCell>Status</Table.HeaderCell>
              <Table.HeaderCell />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {data.items.map((profile) => (
              <Table.Row key={profile.id}>
                <Table.Cell>{profile.assetTag}</Table.Cell>
                <Table.Cell>r{profile.revision}</Table.Cell>
                <Table.Cell>
                  {profile.definition.inputLrv}–{profile.definition.inputUrv} {profile.definition.inputUnit} → {profile.definition.outputLrv}–
                  {profile.definition.outputUrv} {profile.definition.outputUnit}
                </Table.Cell>
                <Table.Cell>
                  ±{profile.definition.toleranceValue}{profile.definition.toleranceMode === 'PERCENT_SPAN' ? '%' : ` ${profile.definition.outputUnit}`}
                </Table.Cell>
                <Table.Cell>{profile.definition.intervalDays} d</Table.Cell>
                <Table.Cell>
                  <StatusBadge color={profile.status === 'PUBLISHED' ? 'green' : profile.status === 'DRAFT' ? 'orange' : 'grey'}>{profile.status}</StatusBadge>
                </Table.Cell>
                <Table.Cell className="text-right">
                  {profile.status === 'DRAFT' ? (
                    <div className="flex justify-end gap-2">
                      {canManage ? <Button type="button" size="small" variant="secondary" onClick={() => setEditing(profile)}>Edit</Button> : null}
                      {canPublish ? <Button type="button" size="small" onClick={() => publish(profile)}>Publish</Button> : null}
                    </div>
                  ) : null}
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}
    </Container>
  );
}

// ─── Master standards ──────────────────────────────────────────────────────────────────────────────────

function Standards({ canManage }: { canManage: boolean }) {
  const load = useCallback(() => calibrationApi.standards(), []);
  const { data, error, reload } = useLoad(load);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<CmmsApiError | null>(null);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setActionError(null);
    try {
      await calibrationApi.createStandard({
        code: String(form.get('code')), name: String(form.get('name')), certificateNumber: String(form.get('certificateNumber')),
        issuedBy: String(form.get('issuedBy')), calibratedOn: String(form.get('calibratedOn')), validUntil: String(form.get('validUntil')),
        ...(optionalText(form.get('serialNumber')) ? { serialNumber: optionalText(form.get('serialNumber')) } : {}),
        ...(optionalText(form.get('accuracyStatement')) ? { accuracyStatement: optionalText(form.get('accuracyStatement')) } : {}),
      });
      setCreating(false);
      reload();
    } catch (failure) {
      setActionError(failure as CmmsApiError);
    } finally {
      setBusy(false);
    }
  }
  async function withdraw(standard: CalibrationStandardV1) {
    setActionError(null);
    try {
      await calibrationApi.updateStandard(standard.id, { expectedVersion: standard.version, status: 'WITHDRAWN' });
      reload();
    } catch (failure) {
      setActionError(failure as CmmsApiError);
    }
  }

  if (error) return <ErrorState error={error} retry={reload} />;
  if (!data) return <LoadingState label="Loading master standards…" />;
  return (
    <Container className="p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 p-6">
        <div>
          <Heading level="h2">Master standards</Heading>
          <Text size="small" className="text-ui-fg-subtle">Calibrators and reference equipment with their external certificates.</Text>
        </div>
        {canManage && !creating ? <Button type="button" size="small" onClick={() => setCreating(true)}>Add standard</Button> : null}
      </div>
      {creating ? (
        <form onSubmit={create} className="grid grid-cols-1 gap-3 px-6 pb-6 md:grid-cols-3">
          <Field id="standard-code" label="Code (barcode)"><Input id="standard-code" name="code" required size="small" /></Field>
          <Field id="standard-name" label="Name"><Input id="standard-name" name="name" required size="small" /></Field>
          <Field id="standard-serial" label="Serial number"><Input id="standard-serial" name="serialNumber" size="small" /></Field>
          <Field id="standard-certificate" label="Certificate number"><Input id="standard-certificate" name="certificateNumber" required size="small" /></Field>
          <Field id="standard-issuer" label="Issued by"><Input id="standard-issuer" name="issuedBy" required size="small" /></Field>
          <Field id="standard-accuracy" label="Accuracy"><Input id="standard-accuracy" name="accuracyStatement" size="small" /></Field>
          <Field id="standard-calibrated" label="Calibrated on"><Input id="standard-calibrated" name="calibratedOn" type="date" required size="small" /></Field>
          <Field id="standard-valid" label="Valid until"><Input id="standard-valid" name="validUntil" type="date" required size="small" /></Field>
          <div className="flex items-end gap-2">
            <Button type="submit" size="small" isLoading={busy} disabled={busy}>Save</Button>
            <Button type="button" size="small" variant="secondary" onClick={() => setCreating(false)}>Cancel</Button>
          </div>
        </form>
      ) : null}
      <div className="px-6"><ActionError error={actionError} onReload={reload} /></div>
      {data.items.length === 0 ? (
        <div className="px-6 pb-6"><EmptyState title="No master standards" text="Add the calibrators technicians use, with their certificates." /></div>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Code</Table.HeaderCell>
              <Table.HeaderCell>Name</Table.HeaderCell>
              <Table.HeaderCell>Certificate</Table.HeaderCell>
              <Table.HeaderCell>Valid until</Table.HeaderCell>
              <Table.HeaderCell>State</Table.HeaderCell>
              <Table.HeaderCell />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {data.items.map((standard) => (
              <Table.Row key={standard.id}>
                <Table.Cell>{standard.code}</Table.Cell>
                <Table.Cell>{standard.name}</Table.Cell>
                <Table.Cell>{standard.certificateNumber} · {standard.issuedBy}</Table.Cell>
                <Table.Cell>{standard.validUntil}</Table.Cell>
                <Table.Cell>
                  <StatusBadge color={standard.usable ? 'green' : 'red'}>
                    {standard.status === 'WITHDRAWN' ? 'Withdrawn' : standard.usable ? 'Usable' : 'Certificate expired'}
                  </StatusBadge>
                </Table.Cell>
                <Table.Cell className="text-right">
                  {canManage && standard.status === 'ACTIVE' ? (
                    <Button type="button" size="small" variant="secondary" onClick={() => withdraw(standard)}>Withdraw</Button>
                  ) : null}
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}
    </Container>
  );
}
