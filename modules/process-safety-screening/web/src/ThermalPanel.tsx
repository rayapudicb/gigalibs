'use client';

import type { MetadataPanelProps } from '@gigalibs/configuration-react';
import {
  type AddSpeedThermalDataInputV1,
  SPEED_ENTHALPY_SOURCES,
  SPEED_THERMAL_KINDS,
  type SpeedCriteriaSetV1,
  type SpeedEnthalpySource,
  type SpeedLibrarySetV1,
  type SpeedRouteDetailV1,
  type SpeedStepV1,
  type SpeedThermalKind,
  holdsPermission,
} from '@gigalibs/contracts';
import {
  type GateResult,
  type ThermalConditions,
  type ThermalOutcome,
  type ThermalResult,
  runThermal,
} from '@gigalibs/process-safety-engines';
import { useMemo, useState } from 'react';
import { useRoute, useSetsInForce, useSpeedApi, useSpeedText } from './hooks.js';
import type { Translate } from './messages/index.js';
import {
  type LadderMarker,
  engineCriteria,
  engineLibrary,
  labelPositions,
  ladderMarkers,
  shown,
  thermalOf,
  worstClass,
} from './screens-model.js';
import { SpeedApiError } from './speed-api.js';
import { changeReasons, parseNumber } from './workbench-model.js';

// WI-OI-120by (SPEED S5; screen spec §2.4, panel speed.thermal-panel; FR-THM-01 to 12, BRL-05, BRL-06): the cooling-failure
// scenario of each step. The stored result is what the panel shows; while the chemist edits the thermal inputs, the
// panel previews them in the browser with the engine package and the sets in force (NFR-03), and saving stores them,
// after which the server's result replaces the preview.

const input =
  'w-full rounded-md border border-ui-border-base bg-ui-bg-field px-2 py-1 text-sm text-ui-fg-base focus:border-ui-border-interactive focus:outline-none disabled:opacity-60';
const button =
  'rounded-md border border-ui-border-base bg-ui-button-neutral px-2.5 py-1 text-sm text-ui-fg-base hover:bg-ui-button-neutral-hover disabled:opacity-50';
const tile = 'rounded-lg border border-ui-border-base bg-ui-bg-base p-3';
const LEVEL_TONE: Readonly<Record<string, string>> = {
  HIGH: 'text-ui-tag-red-text',
  MEDIUM: 'text-ui-tag-orange-text',
  LOW: 'text-ui-tag-green-text',
  UNKNOWN: 'text-ui-fg-muted',
};
const CLASS_TONE = [
  '',
  'bg-ui-tag-green-bg',
  'bg-ui-tag-green-bg',
  'bg-ui-tag-orange-bg',
  'bg-ui-tag-red-bg',
  'bg-ui-tag-red-bg',
];
// The ladder's lines in the prototype's colours; each line also carries its name and value, so colour is never the only
// signal.
const LADDER_STROKE: Readonly<Record<LadderMarker['key'], string>> = {
  tp: 'stroke-ui-fg-muted',
  mtsr: 'stroke-ui-tag-orange-icon',
  mtsrFull: 'stroke-ui-tag-red-icon',
  mtt: 'stroke-ui-tag-blue-icon',
  td24: 'stroke-ui-tag-purple-icon',
};

interface ThermalInputs {
  readonly processTemperatureC: string;
  readonly maximumTechnicalTemperatureC: string;
  readonly heatCapacityJPerGK: string;
  readonly accumulationPercent: string;
  readonly reactionEnthalpySource: SpeedEnthalpySource | '';
  readonly reactionClassId: string;
}

function savedInputs(step: SpeedStepV1): ThermalInputs {
  const text = (value: number | null | undefined) =>
    value === null || value === undefined ? '' : String(value);
  return {
    processTemperatureC: text(step.conditions?.processTemperatureC),
    maximumTechnicalTemperatureC: text(step.conditions?.maximumTechnicalTemperatureC),
    heatCapacityJPerGK: text(step.conditions?.heatCapacityJPerGK),
    accumulationPercent: text(step.conditions?.accumulationPercent),
    reactionEnthalpySource: step.conditions?.reactionEnthalpySource ?? '',
    reactionClassId: step.conditions?.reactionClassId ?? '',
  };
}

/** The engines' conditions from the inputs and the step's active thermal data, as the server builds them. */
export function conditionsFrom(step: SpeedStepV1, inputs: ThermalInputs): ThermalConditions {
  const active = (kind: SpeedThermalKind) => step.thermalData.find((data) => data.kind === kind);
  const kinetics = active('DECOMPOSITION_KINETICS');
  const measured = active('REACTION_ENTHALPY')?.kJPerMol ?? null;
  const source = inputs.reactionEnthalpySource;
  return {
    processTemperatureC: parseNumber(inputs.processTemperatureC),
    maximumTechnicalTemperatureC: parseNumber(inputs.maximumTechnicalTemperatureC),
    heatCapacityJPerGK: parseNumber(inputs.heatCapacityJPerGK),
    accumulationPercent: parseNumber(inputs.accumulationPercent),
    reactionEnthalpy:
      source === 'MANUAL'
        ? measured === null
          ? null
          : { source: 'MANUAL', kJPerMol: measured }
        : source === 'REACTION_CLASS' && inputs.reactionClassId
          ? { source: 'REACTION_CLASS', reactionClassId: inputs.reactionClassId }
          : source === 'HESS'
            ? { source: 'HESS' }
            : null,
    decomposition:
      kinetics &&
      kinetics.activationEnergyKJPerMol !== null &&
      kinetics.heatReleaseRateWPerKg !== null &&
      kinetics.referenceTemperatureC !== null
        ? {
            activationEnergyKJPerMol: kinetics.activationEnergyKJPerMol,
            heatReleaseRateWPerKg: kinetics.heatReleaseRateWPerKg,
            referenceTemperatureC: kinetics.referenceTemperatureC,
          }
        : null,
    td24EnteredC: active('TD24')?.td24C ?? null,
    dscOnsetC: active('DSC_ONSET')?.onsetC ?? null,
  };
}

export interface ThermalHandlers {
  saveInputs(
    step: SpeedStepV1,
    inputs: ThermalConditions & {
      reactionEnthalpySource: SpeedEnthalpySource | null;
      reactionClassId: string | null;
    },
  ): void;
  addThermalData(
    step: SpeedStepV1,
    data: DistributiveOmit<AddSpeedThermalDataInputV1, 'requestKey' | 'reason'>,
  ): void;
  saveMitigation(step: SpeedStepV1, text: string): void;
}
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export interface ThermalViewProps {
  readonly route: SpeedRouteDetailV1;
  readonly selectedStepId: string | null;
  readonly onSelect: (stepId: string) => void;
  readonly criteria: SpeedCriteriaSetV1 | null;
  readonly library: SpeedLibrarySetV1 | null;
  readonly editable: boolean;
  readonly canAddData: boolean;
  readonly busy: boolean;
  readonly reasons: readonly string[];
  readonly reason: string;
  readonly onReason: (reason: string) => void;
  readonly notice: string | null;
  readonly handlers: ThermalHandlers;
  readonly t: Translate;
}

export function ThermalView(props: ThermalViewProps) {
  const { route, selectedStepId, onSelect, t, editable, reasons, reason, onReason, notice } = props;
  const step =
    route.steps.find((candidate) => candidate.id === selectedStepId) ?? route.steps[0] ?? null;
  return (
    <section aria-label={t('speed.thermal.label')} className="space-y-4">
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
            {t('speed.workbench.step', { position: candidate.position })}
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
      {step ? <StepThermal key={step.id} {...props} step={step} /> : null}
      <AllSteps route={route} onSelect={onSelect} t={t} />
    </section>
  );
}

function StepThermal({
  step,
  criteria,
  library,
  editable,
  canAddData,
  busy,
  handlers,
  t,
}: ThermalViewProps & { readonly step: SpeedStepV1 }) {
  const saved = savedInputs(step);
  const [draft, setDraft] = useState<ThermalInputs>(saved);
  const changed = JSON.stringify(draft) !== JSON.stringify(saved);
  const stored = thermalOf(step);
  const gate = step.latestResult?.outputs['gate'] as GateResult | undefined;
  const preview = useMemo<ThermalOutcome | null>(() => {
    if (!changed || !criteria || !library || gate?.status !== 'OK' || !gate.pass) return null;
    return runThermal(
      gate,
      conditionsFrom(step, draft),
      engineLibrary(library),
      engineCriteria(criteria),
    );
  }, [changed, criteria, library, gate, step, draft]);
  const outcome = preview ?? stored;
  const field = (key: keyof ThermalInputs, label: string) => (
    <label key={key} className="col-span-6 text-sm text-ui-fg-subtle md:col-span-2">
      {label}
      <input
        className={input}
        inputMode="decimal"
        value={draft[key]}
        disabled={!editable || busy}
        onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
      />
    </label>
  );
  const conditions = conditionsFrom(step, draft);
  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold text-ui-fg-base">
        {t('speed.thermal.stepHeading', { position: step.position, name: step.name })}
      </h3>
      <div className="space-y-2 rounded-lg border border-ui-border-base p-3">
        <p className="text-sm font-medium text-ui-fg-base">{t('speed.thermal.inputs')}</p>
        <div className="grid grid-cols-12 items-end gap-2">
          {field('processTemperatureC', t('speed.conditions.processTemperatureC'))}
          {field(
            'maximumTechnicalTemperatureC',
            t('speed.conditions.maximumTechnicalTemperatureC'),
          )}
          {field('heatCapacityJPerGK', t('speed.conditions.heatCapacityJPerGK'))}
          {field('accumulationPercent', t('speed.conditions.accumulationPercent'))}
          <label className="col-span-6 text-sm text-ui-fg-subtle md:col-span-2">
            {t('speed.thermal.dhSource')}
            <select
              className={input}
              value={draft.reactionEnthalpySource}
              disabled={!editable || busy}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  reactionEnthalpySource: event.target.value as SpeedEnthalpySource | '',
                })
              }
            >
              <option value="" />
              {SPEED_ENTHALPY_SOURCES.map((source) => (
                <option key={source} value={source}>
                  {t(`speed.thermal.source.${source}`)}
                </option>
              ))}
            </select>
          </label>
          {draft.reactionEnthalpySource === 'REACTION_CLASS' ? (
            <label className="col-span-6 text-sm text-ui-fg-subtle md:col-span-2">
              {t('speed.thermal.reactionClass')}
              <select
                className={input}
                value={draft.reactionClassId}
                disabled={!editable || busy}
                onChange={(event) => setDraft({ ...draft, reactionClassId: event.target.value })}
              >
                <option value="" />
                {(library?.library.reactionClasses ?? []).map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name ?? entry.id}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        {preview ? (
          <p className="text-xs text-ui-tag-blue-text">{t('speed.thermal.preview')}</p>
        ) : null}
        {editable ? (
          <button
            type="button"
            className={button}
            disabled={busy || !changed}
            onClick={() =>
              handlers.saveInputs(step, {
                ...conditions,
                reactionEnthalpySource: draft.reactionEnthalpySource || null,
                reactionClassId:
                  draft.reactionEnthalpySource === 'REACTION_CLASS'
                    ? draft.reactionClassId || null
                    : null,
              })
            }
          >
            {t('speed.thermal.saveInputs')}
          </button>
        ) : null}
      </div>
      <ThermalResultView outcome={outcome} criteria={criteria} conditions={conditions} t={t} />
      <ThermalData step={step} canAddData={canAddData} busy={busy} handlers={handlers} t={t} />
      {outcome?.status === 'OK' ? (
        <Mitigation
          step={step}
          thermal={outcome}
          editable={editable}
          busy={busy}
          handlers={handlers}
          t={t}
        />
      ) : null}
    </div>
  );
}

function ThermalResultView({
  outcome,
  criteria,
  conditions,
  t,
}: {
  outcome: ThermalOutcome | null;
  criteria: SpeedCriteriaSetV1 | null;
  conditions: ThermalConditions;
  t: Translate;
}) {
  if (!outcome || outcome.status === 'LOCKED')
    return <p className="text-sm text-ui-fg-muted">{t('speed.thermal.locked')}</p>;
  if (outcome.status === 'INVALID')
    return (
      <ul className="list-disc pl-5 text-sm text-ui-tag-red-text">
        {outcome.errors.map((error, index) => (
          <li key={`${error.code}-${index}`}>{t(error.code, error.params)}</li>
        ))}
      </ul>
    );
  if (outcome.status !== 'OK') {
    const reason = (outcome as { reason?: { code: string } }).reason;
    return (
      <p className="text-sm text-ui-fg-subtle">
        {reason ? t(reason.code) : t('DATA_GAP', { missing: outcome.missing })}
      </p>
    );
  }
  const value = (number: number | null, digits: number, key: string) =>
    number === null ? null : t(key, { value: shown(number, digits) ?? '' });
  const accumulation = shown(conditions.accumulationPercent, 0) ?? '—';
  const offset = criteria?.criteria.td24ConservativeOnsetOffsetK ?? '';
  const tiles: {
    key: string;
    label: string;
    main: string | null;
    note: string | null;
    tone?: string;
  }[] = [
    {
      key: 'dh',
      label: t('speed.thermal.dh'),
      main: value(outcome.reactionEnthalpyKJPerMol, 1, 'speed.thermal.dhValue'),
      note: outcome.notComputed
        ? t(outcome.notComputed.code, outcome.notComputed.params)
        : `${outcome.enthalpyIsEstimate ? `${t('speed.thermal.estimate')} · ` : ''}${outcome.reactionEnthalpySource ? t(`speed.thermal.source.${outcome.reactionEnthalpySource}`) : ''}`,
    },
    {
      key: 'heat',
      label: t('speed.thermal.heat'),
      main: value(outcome.heatReleasedKJ, 1, 'speed.thermal.heatValue'),
      note:
        outcome.specificHeatKJPerKg === null
          ? null
          : t('speed.thermal.heatNote', { value: shown(outcome.specificHeatKJPerKg, 1) ?? '' }),
    },
    {
      key: 'dtad',
      label: t('speed.thermal.dtad'),
      main: value(outcome.adiabaticRiseK, 1, 'speed.thermal.kelvin'),
      note: outcome.severity
        ? t('speed.thermal.severity', { value: t(`speed.level.${outcome.severity}`) })
        : null,
      tone: outcome.severity ? LEVEL_TONE[outcome.severity] : undefined,
    },
    {
      key: 'mtsr',
      label: t('speed.thermal.mtsr', { accumulation }),
      main: value(outcome.mtsrC, 1, 'speed.thermal.celsius'),
      note:
        outcome.mtsrFullAccumulationC === null
          ? null
          : t('speed.thermal.mtsrFull', { value: shown(outcome.mtsrFullAccumulationC, 1) ?? '' }),
    },
    {
      key: 'td24',
      label: t('speed.thermal.td24'),
      main:
        outcome.td24C === null
          ? t('speed.thermal.missing')
          : value(outcome.td24C, 1, 'speed.thermal.celsius'),
      note: t(`td24.${outcome.td24Basis}`, { offset }),
      tone:
        outcome.td24Basis === 'CONSERVATIVE_ONSET'
          ? 'text-ui-tag-orange-text'
          : outcome.td24Basis === 'MISSING'
            ? 'text-ui-tag-blue-text'
            : undefined,
    },
    {
      key: 'tmr',
      label: t('speed.thermal.tmr'),
      main: value(outcome.tmrAtMtsrHours, 1, 'speed.thermal.hours'),
      note: t('speed.thermal.probability', { value: t(`speed.level.${outcome.probability}`) }),
      tone: LEVEL_TONE[outcome.probability],
    },
  ];
  const markers = ladderMarkers(
    outcome,
    conditions.processTemperatureC,
    conditions.maximumTechnicalTemperatureC,
  );
  const positions = labelPositions(
    markers.map((marker) => marker.valueC),
    180,
    16,
  );
  const worst = worstClass(outcome);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {tiles.map((item) => (
          <div key={item.key} className={tile}>
            <p className="text-xs text-ui-fg-subtle">{item.label}</p>
            <p
              className={`text-lg font-semibold ${item.main === null ? 'text-ui-fg-muted' : (item.tone ?? 'text-ui-fg-base')}`}
            >
              {item.main ?? '—'}
            </p>
            {item.note ? (
              <p className={`text-xs ${item.tone ?? 'text-ui-fg-muted'}`}>{item.note}</p>
            ) : null}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-12 gap-4">
        <svg
          role="img"
          aria-label={t('speed.thermal.ladder')}
          viewBox="0 -10 220 200"
          className="col-span-12 h-56 md:col-span-4"
        >
          <line x1={60} x2={60} y1={0} y2={180} className="stroke-ui-border-strong" />
          {markers.map((marker, index) => (
            <g key={marker.key}>
              <line
                x1={50}
                x2={70}
                y1={positions[index]}
                y2={positions[index]}
                strokeWidth={3}
                className={LADDER_STROKE[marker.key]}
              />
              <text x={76} y={(positions[index] ?? 0) + 4} className="fill-ui-fg-base text-[11px]">
                {`${t(`speed.thermal.marker.${marker.key}`, { accumulation })}: ${shown(marker.valueC, 1)} °C`}
              </text>
            </g>
          ))}
        </svg>
        <div className="col-span-12 space-y-2 md:col-span-8">
          {[
            {
              label: t('speed.thermal.stripActual', { accumulation }),
              value: outcome.stoesselClass,
            },
            { label: t('speed.thermal.stripFull'), value: outcome.stoesselClassFullAccumulation },
          ].map((strip) => (
            <div key={strip.label}>
              <p className="text-xs text-ui-fg-subtle">{strip.label}</p>
              <div className="grid grid-cols-5 gap-1">
                {[1, 2, 3, 4, 5].map((cell) => (
                  <div
                    key={cell}
                    className={`rounded border px-1 py-1 text-center text-xs ${cell === strip.value ? `border-ui-border-interactive font-semibold text-ui-fg-base ${CLASS_TONE[cell]}` : 'border-ui-border-base text-ui-fg-muted'}`}
                  >
                    {cell === strip.value
                      ? t('speed.thermal.classAssigned', { value: cell })
                      : t('speed.thermal.classCell', { value: cell })}
                  </div>
                ))}
              </div>
            </div>
          ))}
          <p className="text-sm text-ui-fg-base">
            {worst === null ? t('speed.thermal.noClass') : t(`stoessel.${worst}`)}
          </p>
        </div>
      </div>
      <div className="space-y-1">
        <h4 className="text-sm font-semibold text-ui-fg-base">{t('speed.thermal.gas')}</h4>
        {outcome.gases.length === 0 ? (
          <p className="text-sm text-ui-fg-muted">{t('speed.thermal.noGas')}</p>
        ) : (
          <>
            <table className="text-sm">
              <thead>
                <tr className="text-left text-ui-fg-subtle">
                  <th className="pr-4 font-medium">{t('speed.thermal.gasName')}</th>
                  <th className="pr-4 font-medium">{t('speed.thermal.gasMoles')}</th>
                  <th className="font-medium">{t('speed.thermal.gasLitres')}</th>
                </tr>
              </thead>
              <tbody>
                {outcome.gases.map((gas) => (
                  <tr key={`${gas.materialId}-${gas.gasId}`}>
                    <td className="pr-4">{gas.gasId}</td>
                    <td className="pr-4">{shown(gas.moles, 2)}</td>
                    <td>{shown(gas.litresAtStp, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-ui-fg-muted">{t('speed.thermal.gasCompare')}</p>
          </>
        )}
      </div>
    </div>
  );
}

function ThermalData({
  step,
  canAddData,
  busy,
  handlers,
  t,
}: {
  step: SpeedStepV1;
  canAddData: boolean;
  busy: boolean;
  handlers: ThermalHandlers;
  t: Translate;
}) {
  const [kind, setKind] = useState<SpeedThermalKind>('DSC_ONSET');
  const [values, setValues] = useState<Record<string, string>>({});
  const [basis, setBasis] = useState<'MEASURED' | 'LITERATURE'>('MEASURED');
  const [citation, setCitation] = useState('');
  const fields: Record<SpeedThermalKind, string[]> = {
    REACTION_ENTHALPY: ['kJPerMol'],
    DSC_ONSET: ['onsetC'],
    TD24: ['td24C'],
    DECOMPOSITION_KINETICS: [
      'activationEnergyKJPerMol',
      'heatReleaseRateWPerKg',
      'referenceTemperatureC',
    ],
  };
  const labelOf = (name: string) =>
    name === 'activationEnergyKJPerMol'
      ? t('speed.thermal.activationEnergy')
      : name === 'heatReleaseRateWPerKg'
        ? t('speed.thermal.heatReleaseRate')
        : name === 'referenceTemperatureC'
          ? t('speed.thermal.referenceTemperature')
          : t(`speed.thermal.kind.${kind}`);
  const numbers = Object.fromEntries(
    fields[kind].map((name) => [name, parseNumber(values[name] ?? '')]),
  );
  const complete =
    citation.trim() !== '' &&
    Object.values(numbers).every((value) => typeof value === 'number' && !Number.isNaN(value));
  const describe = (data: SpeedStepV1['thermalData'][number]) =>
    data.kind === 'DECOMPOSITION_KINETICS'
      ? `${data.activationEnergyKJPerMol} kJ/mol · ${data.heatReleaseRateWPerKg} W/kg @ ${data.referenceTemperatureC} °C`
      : String(data.kJPerMol ?? data.onsetC ?? data.td24C ?? '');
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold text-ui-fg-base">{t('speed.thermal.data')}</h4>
      {step.thermalData.length === 0 ? (
        <p className="text-sm text-ui-fg-muted">{t('speed.thermal.none')}</p>
      ) : null}
      <ul className="space-y-1 text-sm">
        {step.thermalData.map((data) => (
          <li key={data.id} className="text-ui-fg-base">
            {`${t(`speed.thermal.kind.${data.kind}`)}: ${describe(data)} · ${t(`speed.thermal.basis.${data.basis}`)} · ${data.citation}`}
          </li>
        ))}
      </ul>
      {canAddData ? (
        <div className="grid grid-cols-12 items-end gap-2">
          <label className="col-span-6 text-sm text-ui-fg-subtle md:col-span-3">
            {t('speed.thermal.addData')}
            <select
              className={input}
              value={kind}
              onChange={(event) => setKind(event.target.value as SpeedThermalKind)}
            >
              {SPEED_THERMAL_KINDS.map((option) => (
                <option key={option} value={option}>
                  {t(`speed.thermal.kind.${option}`)}
                </option>
              ))}
            </select>
          </label>
          {fields[kind].map((name) => (
            <label key={name} className="col-span-6 text-sm text-ui-fg-subtle md:col-span-2">
              {labelOf(name)}
              <input
                className={input}
                inputMode="decimal"
                value={values[name] ?? ''}
                onChange={(event) => setValues({ ...values, [name]: event.target.value })}
              />
            </label>
          ))}
          <label className="col-span-6 text-sm text-ui-fg-subtle md:col-span-2">
            <span className="sr-only">{t('speed.thermal.basis.MEASURED')}</span>
            <select
              className={input}
              value={basis}
              onChange={(event) => setBasis(event.target.value as 'MEASURED' | 'LITERATURE')}
            >
              <option value="MEASURED">{t('speed.thermal.basis.MEASURED')}</option>
              <option value="LITERATURE">{t('speed.thermal.basis.LITERATURE')}</option>
            </select>
          </label>
          <label className="col-span-12 text-sm text-ui-fg-subtle md:col-span-3">
            {t('speed.thermal.citation')}
            <input
              className={input}
              value={citation}
              onChange={(event) => setCitation(event.target.value)}
            />
          </label>
          <button
            type="button"
            className={`${button} col-span-12 md:col-span-2`}
            disabled={busy || !complete}
            onClick={() => {
              handlers.addThermalData(step, {
                kind,
                basis,
                citation: citation.trim(),
                ...numbers,
              } as DistributiveOmit<AddSpeedThermalDataInputV1, 'requestKey' | 'reason'>);
              setValues({});
              setCitation('');
            }}
          >
            {t('speed.thermal.addData')}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Mitigation({
  step,
  thermal,
  editable,
  busy,
  handlers,
  t,
}: {
  step: SpeedStepV1;
  thermal: ThermalResult;
  editable: boolean;
  busy: boolean;
  handlers: ThermalHandlers;
  t: Translate;
}) {
  const worst = worstClass(thermal);
  const [text, setText] = useState(step.mitigation?.text ?? '');
  if (worst === null || worst < 4) return null;
  const mitigation = step.mitigation;
  return (
    <div className="space-y-2 rounded-lg border border-ui-tag-red-border bg-ui-tag-red-bg p-3">
      <p className="text-sm font-semibold text-ui-tag-red-text">
        {t('speed.thermal.mitigationTitle', { value: worst })}
      </p>
      {mitigation ? (
        <p className="text-sm text-ui-fg-base">
          {t('speed.thermal.mitigationRecorded', {
            user: mitigation.recordedBy,
            text: mitigation.text,
          })}{' '}
          <span
            className={mitigation.acceptedBy ? 'text-ui-tag-green-text' : 'text-ui-tag-orange-text'}
          >
            {mitigation.acceptedBy && mitigation.acceptedAt
              ? t('speed.thermal.accepted', {
                  user: mitigation.acceptedBy,
                  time: new Date(mitigation.acceptedAt).toLocaleString(),
                })
              : t('speed.thermal.awaitingAcceptance')}
          </span>
        </p>
      ) : null}
      {editable ? (
        <>
          <textarea
            className={input}
            rows={3}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
          <button
            type="button"
            className={button}
            disabled={busy || text.trim() === '' || text === mitigation?.text}
            onClick={() => handlers.saveMitigation(step, text.trim())}
          >
            {t('speed.thermal.mitigationSave')}
          </button>
        </>
      ) : (
        <p className="text-xs text-ui-fg-subtle">{t('speed.thermal.mitigationHelp')}</p>
      )}
    </div>
  );
}

function AllSteps({
  route,
  onSelect,
  t,
}: { route: SpeedRouteDetailV1; onSelect: (stepId: string) => void; t: Translate }) {
  return (
    <div className="space-y-1">
      <h4 className="text-sm font-semibold text-ui-fg-base">{t('speed.thermal.allSteps')}</h4>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-ui-fg-subtle">
            <th className="pr-2 font-medium">{t('speed.ob.step')}</th>
            <th className="pr-2 font-medium">{t('speed.thermal.name')}</th>
            <th className="pr-2 font-medium">{t('speed.thermal.dtad')}</th>
            <th className="pr-2 font-medium">{t('speed.thermal.mtsrColumn')}</th>
            <th className="pr-2 font-medium">{t('speed.thermal.td24')}</th>
            <th className="pr-2 font-medium">{t('speed.thermal.td24Source')}</th>
            <th className="font-medium">{t('speed.thermal.class')}</th>
          </tr>
        </thead>
        <tbody>
          {route.steps.map((step) => {
            const thermal = thermalOf(step);
            const ok = thermal?.status === 'OK' ? thermal : null;
            return (
              <tr key={step.id} className="border-t border-ui-border-base">
                <td className="pr-2">{step.position}</td>
                <td className="pr-2">
                  <button
                    type="button"
                    className="text-ui-fg-interactive hover:underline"
                    onClick={() => onSelect(step.id)}
                  >
                    {step.name}
                  </button>
                </td>
                <td className="pr-2">{shown(ok?.adiabaticRiseK, 1) ?? '—'}</td>
                <td className="pr-2">{shown(ok?.mtsrC, 1) ?? '—'}</td>
                <td className="pr-2">{shown(ok?.td24C, 1) ?? '—'}</td>
                <td className="pr-2">{ok ? t(`td24.${ok.td24Basis}`, { offset: '' }) : '—'}</td>
                <td>
                  {ok
                    ? `${ok.stoesselClass ?? '—'} / ${ok.stoesselClassFullAccumulation ?? '—'}`
                    : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** The registered panel `speed.thermal-panel`. */
export function ThermalPanel({ record, props, permissions }: MetadataPanelProps) {
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
  const draft = route.status === 'DRAFT';
  const chosen = reason || reasons[0] || '';
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
  const handlers: ThermalHandlers = {
    saveInputs: (step, inputs) =>
      run(() =>
        api.replaceConditions(
          step.id,
          step.conditions?.version ?? 0,
          {
            processTemperatureC: inputs.processTemperatureC,
            maximumTechnicalTemperatureC: inputs.maximumTechnicalTemperatureC,
            heatCapacityJPerGK: inputs.heatCapacityJPerGK,
            accumulationPercent: inputs.accumulationPercent,
            reactionEnthalpySource: inputs.reactionEnthalpySource,
            reactionClassId: inputs.reactionClassId,
          },
          chosen,
        ),
      ),
    addThermalData: (step, data) => run(() => api.addThermalData(step.id, data, chosen)),
    saveMitigation: (step, text) =>
      run(() => api.replaceMitigation(step.id, step.mitigation?.version ?? 0, text, chosen)),
  };
  return (
    <ThermalView
      route={route}
      selectedStepId={selected}
      onSelect={setSelected}
      criteria={sets.criteria}
      library={sets.library}
      editable={draft && holdsPermission(permissions, 'speed.routes.write') && reasons.length > 0}
      canAddData={
        draft && holdsPermission(permissions, 'speed.thermal-data.write') && reasons.length > 0
      }
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
