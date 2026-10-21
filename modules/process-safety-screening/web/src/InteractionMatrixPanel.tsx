'use client';

import type { MetadataPanelProps } from '@gigalibs/configuration-react';
import {
  type SpeedLibrarySetV1,
  type SpeedRouteDetailV1,
  type SpeedStepV1,
  holdsPermission,
} from '@gigalibs/contracts';
import { useMemo, useState } from 'react';
import { useRoute, useSetsInForce, useSpeedApi, useSpeedText } from './hooks.js';
import type { Translate } from './messages/index.js';
import { SpeedApiError } from './speed-api.js';
import { changeReasons } from './workbench-model.js';

// WI-OI-120bz (SPEED S6; screen spec §2.4, panel speed.interaction-matrix; FR-HAZ-01 to 06, BRL-04): every pair of a
// step's materials matched against the library's rules, the findings most severe first with the library's own finding
// text and citation, a documented control for each High finding, and the statement that the absence of a finding is not
// proof of safety. Colour is never the only signal: every cell and badge carries its letter or word.

type Severity = 'High' | 'Medium' | 'Low';
const RANK: Readonly<Record<Severity, number>> = { High: 3, Medium: 2, Low: 1 };
const TONE: Readonly<Record<Severity, string>> = {
  High: 'border-ui-tag-red-border bg-ui-tag-red-bg text-ui-tag-red-text',
  Medium: 'border-ui-tag-orange-border bg-ui-tag-orange-bg text-ui-tag-orange-text',
  Low: 'border-ui-tag-blue-border bg-ui-tag-blue-bg text-ui-tag-blue-text',
};
const input =
  'w-full rounded-md border border-ui-border-base bg-ui-bg-field px-2 py-1 text-sm text-ui-fg-base focus:border-ui-border-interactive focus:outline-none';
const button =
  'rounded-md border border-ui-border-base bg-ui-button-neutral px-2.5 py-1 text-sm text-ui-fg-base hover:bg-ui-button-neutral-hover disabled:opacity-50';

interface Finding {
  readonly materialAId: string;
  readonly materialBId: string;
  readonly ruleId: string;
  readonly severity: Severity;
  readonly citation: string;
  readonly reviewed: boolean;
}

interface Screen {
  readonly status: string;
  readonly findings: readonly Finding[];
  readonly notes: readonly { materialId: string; noteKey: string; citation: string }[];
  readonly unclassifiedMaterialIds: readonly string[];
  readonly libraryVersion: string;
}

export function screenOf(step: SpeedStepV1): Screen | null {
  const screen = step.latestResult?.outputs['interactions'] as Screen | undefined;
  return screen?.status === 'OK' ? screen : null;
}

export function highCount(step: SpeedStepV1): number {
  return screenOf(step)?.findings.filter((finding) => finding.severity === 'High').length ?? 0;
}

export interface InteractionHandlers {
  documentControl(step: SpeedStepV1, finding: Finding, text: string): void;
  linkSubstance(substanceId: string, libraryMaterialId: string): void;
}

export interface InteractionMatrixViewProps {
  readonly route: SpeedRouteDetailV1;
  readonly selectedStepId: string | null;
  readonly onSelect: (stepId: string) => void;
  readonly library: SpeedLibrarySetV1 | null;
  readonly editable: boolean;
  readonly canLink: boolean;
  readonly busy: boolean;
  readonly reasons: readonly string[];
  readonly reason: string;
  readonly onReason: (reason: string) => void;
  readonly notice: string | null;
  readonly handlers: InteractionHandlers;
  readonly t: Translate;
}

export function InteractionMatrixView(props: InteractionMatrixViewProps) {
  const { route, selectedStepId, onSelect, editable, reasons, reason, onReason, notice, t } = props;
  const step =
    route.steps.find((candidate) => candidate.id === selectedStepId) ?? route.steps[0] ?? null;
  return (
    <section aria-label={t('speed.haz.label')} className="space-y-4">
      <div role="tablist" className="flex flex-wrap gap-1">
        {route.steps.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            role="tab"
            aria-selected={candidate.id === step?.id}
            onClick={() => onSelect(candidate.id)}
            className={`rounded-full border px-3 py-1 text-sm ${candidate.id === step?.id ? 'border-ui-border-interactive bg-ui-bg-base text-ui-fg-base' : 'border-ui-border-base text-ui-fg-subtle'}`}
          >
            {t('speed.haz.pill', { position: candidate.position, count: highCount(candidate) })}
          </button>
        ))}
      </div>
      {editable ? (
        <label className="block max-w-sm text-sm text-ui-fg-subtle">
          {t('speed.workbench.reason')}
          <select
            className={input}
            value={reason}
            onChange={(event) => onReason(event.target.value)}
          >
            {reasons.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {notice ? (
        <p role="alert" className="text-sm text-ui-tag-red-text">
          {t(notice, { status: notice })}
        </p>
      ) : null}
      {step ? <StepInteractions key={step.id} {...props} step={step} /> : null}
      <div className="rounded-lg border border-ui-tag-orange-border bg-ui-tag-orange-bg p-3 text-sm text-ui-tag-orange-text">
        <strong>{t('speed.haz.statement')}</strong> {t('speed.haz.statementDetail')}
      </div>
    </section>
  );
}

function StepInteractions({
  step,
  library,
  editable,
  canLink,
  busy,
  handlers,
  t,
}: InteractionMatrixViewProps & { readonly step: SpeedStepV1 }) {
  const screen = screenOf(step);
  if (!screen) return <p className="text-sm text-ui-fg-muted">{t('speed.haz.notComputed')}</p>;
  const materials = step.materials;
  const nameOf = (id: string) => materials.find((m) => m.id === id)?.substanceName ?? id;
  const pairKey = (a: string, b: string) => [a, b].sort().join(':');
  const byPair = new Map(
    screen.findings.map((finding) => [pairKey(finding.materialAId, finding.materialBId), finding]),
  );
  const findings = [...screen.findings].sort((a, b) => RANK[b.severity] - RANK[a.severity]);
  const rules = new Map((library?.library.rules ?? []).map((rule) => [rule.id, rule]));
  const libraryNotes = new Map(
    (library?.library.materials ?? []).map((entry) => [entry.id, entry]),
  );
  const unclassified = materials.filter((m) => screen.unclassifiedMaterialIds.includes(m.id));
  const anchor = (finding: Finding) =>
    `speed-finding-${step.id}-${pairKey(finding.materialAId, finding.materialBId).replace(':', '-')}`;
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-ui-fg-base">
          {t('speed.haz.matrix', { position: step.position })}
        </h4>
        <div className="overflow-x-auto">
          <table className="text-xs">
            <thead>
              <tr>
                <th />
                {materials.map((m, column) => (
                  <th
                    key={m.id}
                    scope="col"
                    className="px-1 font-medium text-ui-fg-subtle"
                    title={m.substanceName}
                  >
                    {column + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {materials.map((row, rowIndex) => (
                <tr key={row.id}>
                  <th
                    scope="row"
                    className="pr-2 text-left font-medium text-ui-fg-subtle"
                  >{`${rowIndex + 1}. ${row.substanceName}`}</th>
                  {materials.map((column) => {
                    if (column.id === row.id)
                      return (
                        <td key={column.id} className="h-7 w-7 text-center text-ui-fg-muted">
                          ·
                        </td>
                      );
                    const finding = byPair.get(pairKey(row.id, column.id));
                    if (!finding)
                      return (
                        <td key={column.id} className="h-7 w-7 border border-ui-border-base" />
                      );
                    return (
                      <td key={column.id} className="h-7 w-7 p-0">
                        <a
                          href={`#${anchor(finding)}`}
                          aria-label={t('speed.haz.cell', {
                            a: row.substanceName,
                            b: column.substanceName,
                            severity: t(`speed.severity.${finding.severity}`),
                          })}
                          className={`flex h-7 w-7 items-center justify-center rounded border font-semibold ${TONE[finding.severity]}`}
                        >
                          {t(`speed.severity.short.${finding.severity}`)}
                        </a>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-ui-fg-muted">{t('speed.haz.legend')}</p>
        {unclassified.length > 0 ? (
          <div className="space-y-1">
            <p className="text-sm text-ui-tag-blue-text">
              {t('speed.haz.unclassified', {
                names: unclassified.map((m) => m.substanceName).join(', '),
              })}
            </p>
            {canLink && library
              ? unclassified.map((material) => (
                  <LinkPicker
                    key={material.id}
                    name={material.substanceName}
                    substanceId={material.substanceId}
                    library={library}
                    busy={busy}
                    handlers={handlers}
                    t={t}
                  />
                ))
              : null}
          </div>
        ) : null}
      </div>
      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-ui-fg-base">{t('speed.haz.findings')}</h4>
        {findings.length === 0 ? (
          <p className="text-sm text-ui-fg-muted">{t('speed.haz.none')}</p>
        ) : null}
        {findings.map((finding) => {
          const rule = rules.get(finding.ruleId);
          const control = step.controls.find(
            (candidate) =>
              pairKey(candidate.materialAId, candidate.materialBId) ===
              pairKey(finding.materialAId, finding.materialBId),
          );
          return (
            <article
              key={anchor(finding)}
              id={anchor(finding)}
              tabIndex={-1}
              className="space-y-1 rounded-lg border border-ui-border-base p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded border px-1.5 text-xs ${TONE[finding.severity]}`}>
                  {t(`speed.severity.${finding.severity}`)}
                </span>
                <span className="text-sm font-medium text-ui-fg-base">
                  {t('speed.haz.pair', {
                    a: nameOf(finding.materialAId),
                    b: nameOf(finding.materialBId),
                  })}
                </span>
                <span className="rounded border border-ui-border-base px-1.5 text-xs text-ui-fg-subtle">
                  {finding.ruleId}
                </span>
              </div>
              {rule?.finding ? <p className="text-sm text-ui-fg-base">{rule.finding}</p> : null}
              <p className="text-xs text-ui-fg-muted">
                {t('speed.haz.citation', {
                  citation: finding.citation,
                  version: screen.libraryVersion,
                  status: t(finding.reviewed ? 'speed.haz.reviewed' : 'speed.haz.unreviewed'),
                })}
              </p>
              {finding.severity === 'High' ? (
                <Control
                  step={step}
                  finding={finding}
                  prefill={rule?.control ?? ''}
                  control={control ?? null}
                  editable={editable}
                  busy={busy}
                  handlers={handlers}
                  pair={t('speed.haz.pair', {
                    a: nameOf(finding.materialAId),
                    b: nameOf(finding.materialBId),
                  })}
                  t={t}
                />
              ) : null}
            </article>
          );
        })}
      </div>
      {screen.notes.length > 0 ? (
        <div className="space-y-1">
          <h4 className="text-sm font-semibold text-ui-fg-base">{t('speed.haz.notes')}</h4>
          {screen.notes.map((note) => (
            <p key={note.materialId} className="text-sm text-ui-fg-base">
              {t('speed.haz.note', {
                material: nameOf(note.materialId),
                note: libraryNotes.get(note.noteKey)?.note ?? note.noteKey,
                citation: note.citation,
              })}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Control({
  step,
  finding,
  prefill,
  control,
  editable,
  busy,
  handlers,
  pair,
  t,
}: {
  step: SpeedStepV1;
  finding: Finding;
  prefill: string;
  control: SpeedStepV1['controls'][number] | null;
  editable: boolean;
  busy: boolean;
  handlers: InteractionHandlers;
  pair: string;
  t: Translate;
}) {
  const [text, setText] = useState(control?.text ?? prefill);
  return (
    <div className="space-y-1">
      {control ? (
        <p className="text-sm">
          <span className="mr-2 rounded border border-ui-tag-green-border bg-ui-tag-green-bg px-1.5 text-xs text-ui-tag-green-text">
            {t('speed.haz.documented')}
          </span>
          <span className="text-ui-fg-base">
            {t('speed.haz.documentedBy', {
              text: control.text,
              user: control.documentedBy,
              time: new Date(control.documentedAt).toLocaleString(),
            })}
          </span>
        </p>
      ) : (
        <p className="text-sm text-ui-tag-red-text">{t('speed.haz.notDocumented')}</p>
      )}
      {editable ? (
        <>
          <textarea
            aria-label={t('speed.haz.controlLabel', { pair })}
            className={input}
            rows={2}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
          <button
            type="button"
            className={button}
            disabled={busy || text.trim() === '' || text === control?.text}
            onClick={() => handlers.documentControl(step, finding, text.trim())}
          >
            {t('speed.haz.document')}
          </button>
        </>
      ) : null}
    </div>
  );
}

function LinkPicker({
  name,
  substanceId,
  library,
  busy,
  handlers,
  t,
}: {
  name: string;
  substanceId: string;
  library: SpeedLibrarySetV1;
  busy: boolean;
  handlers: InteractionHandlers;
  t: Translate;
}) {
  const [choice, setChoice] = useState('');
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="text-sm text-ui-fg-subtle">
        {t('speed.haz.linkMaterial', { name })}
        <select
          className={input}
          value={choice}
          onChange={(event) => setChoice(event.target.value)}
        >
          <option value="" />
          {library.library.materials.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name ? `${entry.name} (${entry.id})` : entry.id}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className={button}
        disabled={busy || choice === ''}
        onClick={() => handlers.linkSubstance(substanceId, choice)}
      >
        {t('speed.haz.link')}
      </button>
    </div>
  );
}

/** The registered panel `speed.interaction-matrix`. */
export function InteractionMatrixPanel({ record, props, permissions }: MetadataPanelProps) {
  const t = useSpeedText();
  const api = useSpeedApi();
  const { route, failed, reload } = useRoute(api, String(record['id'] ?? ''), record['version']);
  const sets = useSetsInForce(api);
  const reasons = useMemo(() => changeReasons(props['changeReasons']), [props]);
  const [reason, setReason] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  if (failed)
    return (
      <p role="alert" className="text-sm text-ui-fg-error">
        {t('speed.workbench.loadFailed')}
      </p>
    );
  if (!route || !sets)
    return <div aria-busy="true" className="h-40 animate-pulse rounded-lg bg-ui-bg-subtle" />;
  const chosen = reason || reasons[0] || '';
  const draft = route.status === 'DRAFT' && reasons.length > 0;
  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setNotice(null);
    try {
      await work();
      await reload();
    } catch (error) {
      setNotice(error instanceof SpeedApiError ? error.code : 'SPEED_REQUEST_FAILED');
      if (error instanceof SpeedApiError && (error.status === 409 || error.status === 412))
        await reload().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  };
  const handlers: InteractionHandlers = {
    documentControl: (step, finding, text) => {
      const existing = step.controls.find(
        (control) =>
          control.materialAId === finding.materialAId &&
          control.materialBId === finding.materialBId,
      );
      return run(() =>
        api.documentControl(
          step.id,
          existing?.version ?? 0,
          finding.materialAId,
          finding.materialBId,
          text,
          chosen,
        ),
      );
    },
    linkSubstance: (substanceId, libraryMaterialId) =>
      run(() => api.linkSubstance(substanceId, libraryMaterialId, chosen)),
  };
  return (
    <InteractionMatrixView
      route={route}
      selectedStepId={selected}
      onSelect={setSelected}
      library={sets.library}
      editable={draft && holdsPermission(permissions, 'speed.routes.write')}
      canLink={draft && holdsPermission(permissions, 'speed.substances.write')}
      busy={busy}
      reasons={reasons}
      reason={chosen}
      onReason={setReason}
      notice={notice}
      handlers={handlers}
      t={t}
    />
  );
}
