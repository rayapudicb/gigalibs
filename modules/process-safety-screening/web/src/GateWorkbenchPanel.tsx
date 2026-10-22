'use client';

import type { LookupOption, MetadataPanelProps } from '@gigalibs/configuration-react';
import {
  SPEED_EQUATION_ROLES,
  SPEED_MATERIAL_ROLES,
  type SpeedMaterialRole,
  type SpeedMessageV1,
  type SpeedRouteDetailV1,
  type SpeedStepMaterialV1,
  type SpeedStepV1,
  holdsPermission,
} from '@gigalibs/contracts';
import { type KeyboardEvent, useCallback, useEffect, useId, useMemo, useState } from 'react';
import { announceRouteChange } from './hooks.js';
import { type Translate, knowsCode, speedText } from './messages/index.js';
import { SpeedApiError, createSpeedApi } from './speed-api.js';
import {
  type GateView,
  changeReasons,
  equation,
  gateView,
  materialRows,
  parseNumber,
} from './workbench-model.js';

// WI-OI-120bx (SPEED S4; screen spec §2.4, panel speed.gate-workbench; FR-INP-01 to 06, FR-GATE-01 to 06): the step rail,
// the step with its materials and conditions, and the gate result. Every change goes to the module API with the reason
// chosen from the workspace's list; the server recomputes and stores the result, and the panel shows the stored one.

const input =
  'w-full rounded-md border border-ui-border-base bg-ui-bg-field px-2 py-1 text-sm text-ui-fg-base focus:border-ui-border-interactive focus:outline-none disabled:opacity-60';
const button =
  'rounded-md border border-ui-border-base bg-ui-button-neutral px-2.5 py-1 text-sm text-ui-fg-base hover:bg-ui-button-neutral-hover disabled:opacity-50';
const primary =
  'rounded-md bg-ui-button-inverted px-2.5 py-1 text-sm font-medium text-ui-fg-on-inverted hover:bg-ui-button-inverted-hover disabled:opacity-50';
const TONE: Readonly<Record<GateView['state'], string>> = {
  passed: 'border-ui-tag-green-border bg-ui-tag-green-bg text-ui-tag-green-text',
  blocked: 'border-ui-tag-red-border bg-ui-tag-red-bg text-ui-tag-red-text',
  notComputed: 'border-ui-tag-orange-border bg-ui-tag-orange-bg text-ui-tag-orange-text',
};

const format = (value: number | null, digits: number) =>
  value === null ? '' : value.toLocaleString(undefined, { maximumFractionDigits: digits });

type ConditionKey =
  | 'processTemperatureC'
  | 'maximumTechnicalTemperatureC'
  | 'heatCapacityJPerGK'
  | 'accumulationPercent';
const CONDITIONS: readonly ConditionKey[] = [
  'processTemperatureC',
  'maximumTechnicalTemperatureC',
  'heatCapacityJPerGK',
  'accumulationPercent',
];

export interface WorkbenchHandlers {
  addStep(name: string): void;
  renameStep(step: SpeedStepV1, name: string): void;
  moveStep(step: SpeedStepV1, position: number): void;
  removeStep(step: SpeedStepV1): void;
  addMaterial(
    step: SpeedStepV1,
    material: {
      substanceId: string;
      role: SpeedMaterialRole;
      coefficient?: number;
      massG?: number;
    },
  ): void;
  updateMaterial(
    material: SpeedStepMaterialV1,
    change: { role?: SpeedMaterialRole; coefficient?: number | null; massG?: number | null },
  ): void;
  removeMaterial(material: SpeedStepMaterialV1): void;
  saveConditions(step: SpeedStepV1, values: Record<ConditionKey, number | null>): void;
  searchSubstances(search: string): Promise<readonly LookupOption[]>;
}

export interface GateWorkbenchViewProps {
  readonly route: SpeedRouteDetailV1;
  readonly selectedStepId: string | null;
  readonly onSelect: (stepId: string) => void;
  readonly editable: boolean;
  readonly busy: boolean;
  readonly reasons: readonly string[];
  readonly reason: string;
  readonly onReason: (reason: string) => void;
  readonly notice: {
    readonly code: string;
    readonly issues: readonly SpeedMessageV1[];
    readonly fallback: string;
  } | null;
  readonly warnings: readonly SpeedMessageV1[];
  readonly handlers: WorkbenchHandlers;
  readonly t: Translate;
}

/** A coded message in the catalogue's words. */
function say(t: Translate, message: SpeedMessageV1): string {
  return t(message.code, message.params);
}

export function GateWorkbenchView(props: GateWorkbenchViewProps) {
  const {
    route,
    selectedStepId,
    onSelect,
    editable,
    busy,
    reasons,
    reason,
    onReason,
    notice,
    warnings,
    handlers,
    t,
  } = props;
  const step =
    route.steps.find((candidate) => candidate.id === selectedStepId) ?? route.steps[0] ?? null;
  const onRailKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = route.steps.findIndex((candidate) => candidate.id === step?.id);
    const next = event.key === 'ArrowDown' ? index + 1 : event.key === 'ArrowUp' ? index - 1 : -1;
    const target = route.steps[next];
    if (target) {
      event.preventDefault();
      onSelect(target.id);
    }
  };
  return (
    <section
      aria-label={t('speed.workbench.label')}
      aria-busy={busy}
      className="grid grid-cols-12 gap-4"
    >
      <div className="col-span-12 space-y-2 md:col-span-3">
        <p className="text-xs font-medium text-ui-fg-subtle">{t('speed.workbench.steps')}</p>
        <div
          role="tablist"
          aria-orientation="vertical"
          aria-label={t('speed.workbench.steps')}
          className="space-y-1"
          onKeyDown={onRailKey}
        >
          {route.steps.map((candidate) => {
            const gate = gateView(candidate.latestResult);
            return (
              <button
                key={candidate.id}
                type="button"
                role="tab"
                aria-selected={candidate.id === step?.id}
                tabIndex={candidate.id === step?.id ? 0 : -1}
                onClick={() => onSelect(candidate.id)}
                className={`w-full rounded-md border px-2 py-1.5 text-left text-sm ${candidate.id === step?.id ? 'border-ui-border-interactive bg-ui-bg-base' : 'border-ui-border-base bg-ui-bg-subtle'}`}
              >
                <span className="block font-medium text-ui-fg-base">{`${candidate.position}. ${candidate.name}`}</span>
                <span
                  className={`mt-1 inline-block rounded border px-1.5 text-xs ${TONE[gate.state]}`}
                >
                  {t(`speed.gate.${gate.state}`)}
                </span>
              </button>
            );
          })}
        </div>
        {route.steps.length === 0 ? (
          <p className="text-sm text-ui-fg-muted">{t('speed.workbench.empty')}</p>
        ) : null}
        {editable ? (
          <button
            type="button"
            className={primary}
            disabled={busy}
            onClick={() => handlers.addStep(t('speed.workbench.newStepName'))}
          >
            {t('speed.workbench.addStep')}
          </button>
        ) : (
          <p className="text-sm text-ui-fg-muted">{t('speed.workbench.readOnly')}</p>
        )}
      </div>
      <div className="col-span-12 space-y-4 md:col-span-9">
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
          <div
            role="alert"
            className="rounded-md border border-ui-tag-red-border bg-ui-tag-red-bg p-2 text-sm text-ui-tag-red-text"
          >
            <p>
              {knowsCode(notice.code)
                ? t(notice.code)
                : notice.fallback || t('SPEED_REQUEST_FAILED', { status: notice.code })}
            </p>
            {notice.issues.length > 0 ? (
              <ul className="list-disc pl-5">
                {notice.issues.map((issue, index) => (
                  <li key={`${issue.code}-${index}`}>{say(t, issue)}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        {step ? <StepEditor key={step.id} {...props} step={step} warnings={warnings} /> : null}
      </div>
    </section>
  );
}

function StepEditor({
  step,
  route,
  editable,
  busy,
  handlers,
  t,
  warnings,
}: GateWorkbenchViewProps & { readonly step: SpeedStepV1 }) {
  const [name, setName] = useState(step.name);
  const written = equation(step);
  const gate = gateView(step.latestResult);
  const rows = materialRows(step);
  const result = step.latestResult;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-64 flex-1 text-sm text-ui-fg-subtle">
          {t('speed.workbench.stepName')}
          <input
            className={input}
            value={name}
            disabled={!editable || busy}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        {editable ? (
          <>
            <button
              type="button"
              className={button}
              disabled={busy || name.trim() === '' || name === step.name}
              onClick={() => handlers.renameStep(step, name.trim())}
            >
              {t('speed.workbench.rename')}
            </button>
            <button
              type="button"
              className={button}
              disabled={busy || step.position === 1}
              onClick={() => handlers.moveStep(step, step.position - 1)}
            >
              {t('speed.workbench.moveUp')}
            </button>
            <button
              type="button"
              className={button}
              disabled={busy || step.position === route.steps.length}
              onClick={() => handlers.moveStep(step, step.position + 1)}
            >
              {t('speed.workbench.moveDown')}
            </button>
            <button
              type="button"
              className={button}
              disabled={busy}
              onClick={() => handlers.removeStep(step)}
            >
              {t('speed.workbench.removeStep')}
            </button>
          </>
        ) : null}
      </div>
      {written ? (
        <p className="text-sm text-ui-fg-base">
          <span className="text-ui-fg-subtle">{`${t('speed.workbench.equation')}: `}</span>
          <span className="font-mono">
            <FormulaText text={`${written.left} → ${written.right}`} />
          </span>
        </p>
      ) : null}
      <div
        aria-live="polite"
        className="space-y-2 rounded-lg border border-ui-border-base bg-ui-bg-base p-3"
      >
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-ui-fg-base">{t('speed.gate.title')}</h3>
          <span className={`rounded border px-1.5 text-xs ${TONE[gate.state]}`}>
            {t(`speed.gate.${gate.state}`)}
          </span>
        </div>
        {gate.gap ? <p className="text-sm text-ui-fg-subtle">{say(t, gate.gap)}</p> : null}
        {gate.issues.length + gate.warnings.length > 0 ? (
          <ul className="list-disc pl-5 text-sm text-ui-fg-base">
            {[...gate.issues, ...gate.warnings].map((issue, index) => (
              <li key={`${issue.code}-${index}`}>{say(t, issue)}</li>
            ))}
          </ul>
        ) : null}
        {gate.balance.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="text-sm">
              <tbody>
                <tr className="text-left text-ui-fg-subtle">
                  <th scope="row" className="pr-4 font-medium">
                    {t('speed.gate.element')}
                  </th>
                  {gate.balance.map((row) => (
                    <th key={row.element} scope="col" className="pr-4 font-mono font-medium">
                      {row.element}
                    </th>
                  ))}
                </tr>
                {(['in', 'out'] as const).map((side) => (
                  <tr key={side}>
                    <th scope="row" className="pr-4 text-left font-medium text-ui-fg-subtle">
                      {t(`speed.gate.${side}`)}
                    </th>
                    {gate.balance.map((row) => (
                      <td
                        key={row.element}
                        className={`pr-4 ${row.balanced ? 'text-ui-fg-base' : 'text-ui-tag-red-text'}`}
                      >
                        {format(side === 'in' ? row.inAtoms : row.outAtoms, 3)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {gate.extentMol !== null ? (
          <p className="text-sm text-ui-fg-base">
            {t('speed.gate.extent', {
              extent: format(gate.extentMol, 4),
              material:
                step.materials.find((m) => m.id === gate.limitingMaterialId)?.substanceName ?? '',
            })}
          </p>
        ) : null}
        {result ? (
          <p className="text-xs text-ui-fg-muted">
            {t('speed.result.versions', {
              time: new Date(result.computedAt).toLocaleString(),
              engine: result.engineVersion,
              criteria: result.criteriaVersion ?? '—',
              review: t(
                result.criteriaReviewed ? 'speed.result.reviewed' : 'speed.result.unreviewed',
              ),
              elements: result.elementsVersion,
            })}
          </p>
        ) : null}
      </div>
      <MaterialsGrid
        step={step}
        rows={rows}
        editable={editable}
        busy={busy}
        handlers={handlers}
        t={t}
      />
      <Conditions
        step={step}
        editable={editable}
        busy={busy}
        handlers={handlers}
        t={t}
        warnings={warnings}
      />
    </div>
  );
}

/** A formula or equation with element counts as subscripts (C7H5FO → C₇H₅FO); coefficients stay full size. */
export function FormulaText({ text }: { readonly text: string }) {
  const parts = text.split(/(?<=[A-Za-z)\]])(\d+)/);
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: the parts of one fixed string, never reordered.
          <sub key={index}>{part}</sub>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: the parts of one fixed string, never reordered.
          <span key={index}>{part}</span>
        ),
      )}
    </>
  );
}

function MaterialsGrid({
  step,
  rows,
  editable,
  busy,
  handlers,
  t,
}: {
  step: SpeedStepV1;
  rows: ReturnType<typeof materialRows>;
  editable: boolean;
  busy: boolean;
  handlers: WorkbenchHandlers;
  t: Translate;
}) {
  const [search, setSearch] = useState('');
  const [options, setOptions] = useState<readonly LookupOption[]>([]);
  const [substanceId, setSubstanceId] = useState('');
  const [role, setRole] = useState<SpeedMaterialRole>('Reactant');
  const [coefficient, setCoefficient] = useState('');
  const [mass, setMass] = useState('');
  useEffect(() => {
    if (!editable || search.trim().length < 2) return;
    let live = true;
    handlers.searchSubstances(search.trim()).then(
      (found) => live && setOptions(found),
      () => live && setOptions([]),
    );
    return () => {
      live = false;
    };
  }, [editable, handlers, search]);
  const equationRole = SPEED_EQUATION_ROLES.includes(role);
  const add = () => {
    const nu = parseNumber(coefficient);
    const grams = parseNumber(mass);
    handlers.addMaterial(step, {
      substanceId,
      role,
      ...(equationRole && typeof nu === 'number' ? { coefficient: nu } : {}),
      ...(role !== 'By-product' && typeof grams === 'number' ? { massG: grams } : {}),
    });
    setSubstanceId('');
    setSearch('');
    setCoefficient('');
    setMass('');
  };
  const roleChange = (material: SpeedStepMaterialV1, next: SpeedMaterialRole) =>
    handlers.updateMaterial(material, {
      role: next,
      ...(SPEED_EQUATION_ROLES.includes(next) ? {} : { coefficient: null }),
      ...(next === 'By-product' ? { massG: null } : {}),
    });
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-ui-fg-base">{t('speed.materials.title')}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-ui-fg-muted">{t('speed.materials.none')}</p>
      ) : null}
      {rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ui-fg-subtle">
                {[
                  'role',
                  'substance',
                  'formula',
                  'coefficient',
                  'mass',
                  'molarMass',
                  'moles',
                  'equivalents',
                ].map((column) => (
                  <th key={column} className="pr-2 font-medium">
                    {t(`speed.materials.${column}`)}
                  </th>
                ))}
                {editable ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ material, moles, equivalents }) => (
                <tr key={material.id} className="border-t border-ui-border-base">
                  <td className="pr-2">
                    <select
                      className={`${input} min-w-[8.5rem]`}
                      aria-label={t('speed.materials.role')}
                      value={material.role}
                      disabled={!editable || busy}
                      onChange={(event) =>
                        roleChange(material, event.target.value as SpeedMaterialRole)
                      }
                    >
                      {SPEED_MATERIAL_ROLES.map((option) => (
                        <option key={option} value={option}>
                          {t(`speed.role.${option}`)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="pr-2 text-ui-fg-base">{material.substanceName}</td>
                  <td className="pr-2 font-mono text-ui-fg-base">{material.formula}</td>
                  <td className="pr-2">
                    <NumberCell
                      label={t('speed.materials.coefficient')}
                      value={material.coefficient}
                      disabled={!editable || busy || !SPEED_EQUATION_ROLES.includes(material.role)}
                      onCommit={(value) =>
                        handlers.updateMaterial(material, { coefficient: value })
                      }
                    />
                  </td>
                  <td className="pr-2">
                    <NumberCell
                      label={t('speed.materials.mass')}
                      value={material.massG}
                      disabled={!editable || busy || material.role === 'By-product'}
                      onCommit={(value) => handlers.updateMaterial(material, { massG: value })}
                    />
                  </td>
                  <td className="pr-2 text-ui-fg-subtle">{format(material.molarMassGPerMol, 3)}</td>
                  <td className="pr-2 text-ui-fg-subtle">{format(moles, 4)}</td>
                  <td className="pr-2 text-ui-fg-subtle">{format(equivalents, 3)}</td>
                  {editable ? (
                    <td>
                      <button
                        type="button"
                        className={button}
                        disabled={busy}
                        onClick={() => handlers.removeMaterial(material)}
                      >
                        {t('speed.materials.remove')}
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {editable ? (
        <div className="grid grid-cols-12 items-end gap-2">
          <label className="col-span-12 text-sm text-ui-fg-subtle md:col-span-4">
            {t('speed.materials.substance')}
            <input
              className={input}
              list={`speed-substances-${step.id}`}
              placeholder={t('speed.materials.searchSubstance')}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setSubstanceId(
                  options.find((option) => option.label === event.target.value)?.value ?? '',
                );
              }}
            />
            <datalist id={`speed-substances-${step.id}`}>
              {options.map((option) => (
                <option key={option.value} value={option.label} />
              ))}
            </datalist>
          </label>
          <label className="col-span-4 text-sm text-ui-fg-subtle md:col-span-3">
            {t('speed.materials.role')}
            <select
              className={input}
              value={role}
              onChange={(event) => setRole(event.target.value as SpeedMaterialRole)}
            >
              {SPEED_MATERIAL_ROLES.map((option) => (
                <option key={option} value={option}>
                  {t(`speed.role.${option}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="col-span-4 text-sm text-ui-fg-subtle md:col-span-1">
            {t('speed.materials.coefficient')}
            <input
              className={input}
              inputMode="decimal"
              value={coefficient}
              disabled={!equationRole}
              onChange={(event) => setCoefficient(event.target.value)}
            />
          </label>
          <label className="col-span-4 text-sm text-ui-fg-subtle md:col-span-2">
            {t('speed.materials.mass')}
            <input
              className={input}
              inputMode="decimal"
              value={mass}
              disabled={role === 'By-product'}
              onChange={(event) => setMass(event.target.value)}
            />
          </label>
          <button
            type="button"
            className={`${primary} col-span-12 whitespace-nowrap md:col-span-2`}
            disabled={busy || substanceId === ''}
            onClick={add}
          >
            {t('speed.materials.add')}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function NumberCell({
  label,
  value,
  disabled,
  onCommit,
}: {
  label: string;
  value: number | null;
  disabled: boolean;
  onCommit: (value: number | null) => void;
}) {
  const [text, setText] = useState(value === null ? '' : String(value));
  useEffect(() => setText(value === null ? '' : String(value)), [value]);
  const commit = () => {
    const parsed = parseNumber(text);
    if (parsed !== null && Number.isNaN(parsed))
      return setText(value === null ? '' : String(value));
    if (parsed !== value) onCommit(parsed);
  };
  return (
    <input
      className={input}
      aria-label={label}
      inputMode="decimal"
      value={text}
      disabled={disabled}
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => event.key === 'Enter' && commit()}
    />
  );
}

function Conditions({
  step,
  editable,
  busy,
  handlers,
  t,
  warnings,
}: {
  step: SpeedStepV1;
  editable: boolean;
  busy: boolean;
  handlers: WorkbenchHandlers;
  t: Translate;
  warnings: readonly SpeedMessageV1[];
}) {
  const initial = useCallback(
    () =>
      Object.fromEntries(
        CONDITIONS.map((key) => [
          key,
          step.conditions?.[key] === null || step.conditions === null
            ? ''
            : String(step.conditions[key]),
        ]),
      ),
    [step.conditions],
  );
  const [draft, setDraft] = useState<Record<string, string>>(initial);
  useEffect(() => setDraft(initial()), [initial]);
  const values = Object.fromEntries(
    CONDITIONS.map((key) => [key, parseNumber(draft[key] ?? '')]),
  ) as Record<ConditionKey, number | null>;
  const invalid = Object.values(values).some((value) => value !== null && Number.isNaN(value));
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-ui-fg-base">{t('speed.conditions.title')}</h3>
      <div className="grid grid-cols-12 items-end gap-2">
        {CONDITIONS.map((key) => (
          <label key={key} className="col-span-6 text-sm text-ui-fg-subtle md:col-span-3">
            {t(`speed.conditions.${key}`)}
            <input
              className={input}
              inputMode="decimal"
              value={draft[key] ?? ''}
              disabled={!editable || busy}
              onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
            />
          </label>
        ))}
      </div>
      {warnings.length > 0 ? (
        <ul className="list-disc pl-5 text-sm text-ui-tag-orange-text">
          {warnings.map((warning, index) => (
            <li key={`${warning.code}-${index}`}>{say(t, warning)}</li>
          ))}
        </ul>
      ) : null}
      {editable ? (
        <button
          type="button"
          className={button}
          disabled={busy || invalid}
          onClick={() => handlers.saveConditions(step, values)}
        >
          {t('speed.conditions.save')}
        </button>
      ) : null}
    </div>
  );
}

/** The registered panel `speed.gate-workbench`: loads the route, saves every change through the module API. */
export function GateWorkbenchPanel({
  record,
  props,
  client,
  permissions,
  refresh,
}: MetadataPanelProps) {
  const t = useMemo(
    () =>
      speedText(
        typeof document === 'undefined' ? 'en-US' : document.documentElement.lang || 'en-US',
      ),
    [],
  );
  const api = useMemo(() => createSpeedApi(), []);
  const reasons = useMemo(() => changeReasons(props['changeReasons']), [props]);
  const routeId = String(record['id'] ?? '');
  const [route, setRoute] = useState<SpeedRouteDetailV1 | null>(null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [reason, setReason] = useState(reasons[0] ?? '');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<GateWorkbenchViewProps['notice']>(null);
  const [warnings, setWarnings] = useState<readonly SpeedMessageV1[]>([]);
  const source = useId();

  const load = useCallback(async () => {
    const loaded = await api.route(routeId);
    setRoute(loaded);
    return loaded;
  }, [api, routeId]);
  useEffect(() => {
    load().catch(() => setFailed(true));
  }, [load]);

  const run = useCallback(
    async (
      work: () => Promise<
        { step?: SpeedStepV1; warnings?: readonly SpeedMessageV1[] } | SpeedRouteDetailV1
      >,
    ) => {
      setBusy(true);
      setNotice(null);
      try {
        const outcome = await work();
        setWarnings('warnings' in outcome && outcome.warnings ? outcome.warnings : []);
        if ('step' in outcome && outcome.step) setSelected(outcome.step.id);
        await load();
        // WI-OI-120ce: the summary tiles and the route's own fields (step counts) follow the change.
        announceRouteChange(routeId, source);
        refresh?.();
      } catch (error) {
        if (error instanceof SpeedApiError) {
          setNotice({ code: error.code, issues: error.issues, fallback: error.message });
          if (error.status === 409 || error.status === 412) await load().catch(() => undefined);
        } else {
          setNotice({ code: 'SPEED_REQUEST_FAILED', issues: [], fallback: '' });
        }
      } finally {
        setBusy(false);
      }
    },
    [load, refresh, routeId, source],
  );

  const handlers = useMemo<WorkbenchHandlers>(
    () => ({
      addStep: (name) => run(() => api.addStep(routeId, name, reason)),
      renameStep: (step, name) => run(() => api.renameStep(step.id, step.version, name, reason)),
      moveStep: (step, position) =>
        run(() => api.moveStep(step.id, step.version, position, reason)),
      removeStep: (step) => run(() => api.removeStep(step.id, step.version, reason)),
      addMaterial: (step, material) => run(() => api.addMaterial(step.id, material, reason)),
      updateMaterial: (material, change) =>
        run(() => api.updateMaterial(material.id, material.version, change, reason)),
      removeMaterial: (material) =>
        run(() => api.removeMaterial(material.id, material.version, reason)),
      saveConditions: (step, values) =>
        run(() => api.replaceConditions(step.id, step.conditions?.version ?? 0, values, reason)),
      searchSubstances: (search) => client.lookup('speed-substances', { search }),
    }),
    [api, client, reason, routeId, run],
  );

  if (failed)
    return (
      <p role="alert" className="text-sm text-ui-fg-error">
        {t('speed.workbench.loadFailed')}
      </p>
    );
  if (!route)
    return <div aria-busy="true" className="h-40 animate-pulse rounded-lg bg-ui-bg-subtle" />;
  return (
    <GateWorkbenchView
      route={route}
      selectedStepId={selected}
      onSelect={setSelected}
      editable={
        route.status === 'DRAFT' &&
        holdsPermission(permissions, 'speed.routes.write') &&
        reasons.length > 0
      }
      busy={busy}
      reasons={reasons}
      reason={reason}
      onReason={setReason}
      notice={notice}
      warnings={warnings}
      handlers={handlers}
      t={t}
    />
  );
}
