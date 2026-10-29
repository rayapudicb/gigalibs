'use client';

import type { MetadataPanelProps } from '@gigalibs/configuration-react';
import {
  SPEED_MATERIAL_ROLES,
  type SpeedMaterialRole,
  type SpeedRouteDetailV1,
  type SpeedStepV1,
  type SpeedSubstanceV1,
} from '@gigalibs/contracts';
import {
  WRITEUP_UNITS,
  type WriteupFinding,
  type WriteupReagent,
  parseWriteup,
  recogniseReagents,
} from '@gigalibs/process-safety-engines';
import { useEffect, useState } from 'react';
import { useRoute, useSpeedApi, useSpeedText } from './hooks.js';
import { type Translate, knowsCode } from './messages/index.js';
import { SpeedApiError } from './speed-api.js';

// WI-OI-120cc (SPEED S8; screen spec §2.4, panel speed.writeup-parser; FR-INP-07, 08; D8): read a lab write-up or patent
// text in the browser with the deterministic parser, confirm each value, then apply the confirmed temperature as Tp or
// add the confirmed reagents to the step. Nothing is saved until the chemist applies it, with the dictionary's reason.

const input =
  'w-full rounded-md border border-ui-border-base bg-ui-bg-field px-2 py-1 text-sm text-ui-fg-base focus:border-ui-border-interactive focus:outline-none';
const button =
  'rounded-md border border-ui-border-base bg-ui-button-neutral px-2.5 py-1 text-sm text-ui-fg-base hover:bg-ui-button-neutral-hover disabled:opacity-50';

export interface ParsedFinding extends WriteupFinding {
  readonly confirmed: boolean;
  /** The chemist's value, as typed; starts as the parser's. */
  readonly edited: string;
}

export interface ParsedReagent extends WriteupReagent {
  readonly confirmed: boolean;
  readonly role: SpeedMaterialRole;
}

export interface WriteupParserViewProps {
  readonly route: SpeedRouteDetailV1;
  readonly stepId: string;
  readonly text: string;
  readonly findings: readonly ParsedFinding[] | null;
  readonly reagents: readonly ParsedReagent[];
  readonly substances: readonly SpeedSubstanceV1[];
  readonly busy: boolean;
  readonly notice: string | null;
  readonly t: Translate;
  readonly on: {
    step(stepId: string): void;
    text(text: string): void;
    extract(): void;
    confirmFinding(index: number, confirmed: boolean): void;
    editFinding(index: number, value: string): void;
    confirmReagent(index: number, confirmed: boolean): void;
    role(index: number, role: SpeedMaterialRole): void;
    useTemperature(): void;
    addMaterials(): void;
  };
}

/** The first confirmed temperature, as typed, when it is a number. */
export function confirmedTemperature(findings: readonly ParsedFinding[] | null): number | null {
  const found = (findings ?? []).find(
    (finding) => finding.type === 'TEMPERATURE' && finding.confirmed,
  );
  if (!found) return null;
  const value = Number(found.edited);
  return found.edited.trim() !== '' && Number.isFinite(value) ? value : null;
}

export function WriteupParserView({
  route,
  stepId,
  text,
  findings,
  reagents,
  substances,
  busy,
  notice,
  t,
  on,
}: WriteupParserViewProps) {
  const nameOf = (id: string) => substances.find((substance) => substance.id === id)?.name ?? id;
  const temperature = confirmedTemperature(findings);
  const confirmedReagents = reagents.filter((reagent) => reagent.confirmed);
  return (
    <section aria-label={t('speed.writeup.label')} className="space-y-4">
      <h3 className="text-base font-semibold text-ui-fg-base">{t('speed.writeup.heading')}</h3>
      <div className="grid gap-3 md:grid-cols-[16rem_1fr]">
        <label className="space-y-1 text-sm text-ui-fg-subtle">
          <span>{t('speed.writeup.step')}</span>
          <select
            className={input}
            value={stepId}
            onChange={(event) => on.step(event.target.value)}
          >
            {route.steps.map((step) => (
              <option key={step.id} value={step.id}>
                {t('speed.writeup.stepOption', { position: step.position, name: step.name })}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm text-ui-fg-subtle">
          <span>{t('speed.writeup.text')}</span>
          <textarea
            className={`${input} min-h-32`}
            value={text}
            onChange={(event) => on.text(event.target.value)}
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={button}
          disabled={busy || text.trim() === ''}
          onClick={on.extract}
        >
          {t('speed.writeup.extract')}
        </button>
        <p className="text-xs text-ui-fg-muted">{t('speed.writeup.note')}</p>
      </div>
      {notice ? (
        <p
          role="alert"
          className="rounded-md border border-ui-tag-red-border bg-ui-tag-red-bg p-2 text-sm text-ui-tag-red-text"
        >
          {knowsCode(notice) ? t(notice) : t('SPEED_REQUEST_FAILED', { status: notice })}
        </p>
      ) : null}
      {findings === null || findings.length === 0 ? (
        <p className="text-sm text-ui-fg-muted">{t('speed.writeup.empty')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ui-fg-subtle">
                {['confirm', 'type', 'found', 'value'].map((column) => (
                  <th key={column} className="pr-3 font-medium">
                    {t(`speed.writeup.${column}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {findings.map((finding, index) => (
                <tr
                  key={`${finding.type}-${finding.start}`}
                  className="border-t border-ui-border-base align-top"
                >
                  <td className="pr-3">
                    <input
                      type="checkbox"
                      aria-label={t('speed.writeup.confirmOne', { found: finding.found })}
                      checked={finding.confirmed}
                      onChange={(event) => on.confirmFinding(index, event.target.checked)}
                    />
                  </td>
                  <td className="pr-3 text-ui-fg-base">
                    {t(`speed.writeup.type.${finding.type}`)}
                  </td>
                  <td className="pr-3 text-ui-fg-subtle">{finding.found}</td>
                  <td className="pr-3">
                    {finding.type === 'DOSING' ? (
                      <span className="text-ui-fg-muted">—</span>
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <input
                          className={`${input} w-28`}
                          inputMode="decimal"
                          aria-label={t('speed.writeup.valueOf', { found: finding.found })}
                          value={finding.edited}
                          onChange={(event) => on.editFinding(index, event.target.value)}
                        />
                        <span className="text-ui-fg-subtle">{WRITEUP_UNITS[finding.type]}</span>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-ui-fg-base">{t('speed.writeup.reagents')}</h4>
        {findings === null ? null : reagents.length === 0 ? (
          <p className="text-sm text-ui-fg-muted">{t('speed.writeup.noReagents')}</p>
        ) : (
          <ul className="space-y-1">
            {reagents.map((reagent, index) => (
              <li key={reagent.substanceId} className="flex flex-wrap items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  aria-label={t('speed.writeup.confirmOne', { found: nameOf(reagent.substanceId) })}
                  checked={reagent.confirmed}
                  onChange={(event) => on.confirmReagent(index, event.target.checked)}
                />
                <span className="text-ui-fg-base">{nameOf(reagent.substanceId)}</span>
                <span className="text-ui-fg-muted">“{reagent.found}”</span>
                <select
                  className={`${input} w-40`}
                  aria-label={t('speed.writeup.roleOf', { name: nameOf(reagent.substanceId) })}
                  value={reagent.role}
                  onChange={(event) => on.role(index, event.target.value as SpeedMaterialRole)}
                >
                  {SPEED_MATERIAL_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {t(`speed.role.${role}`)}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={button}
          disabled={busy || temperature === null}
          onClick={on.useTemperature}
        >
          {t('speed.writeup.useTemperature')}
        </button>
        <button
          type="button"
          className={button}
          disabled={busy || confirmedReagents.length === 0}
          onClick={on.addMaterials}
        >
          {t('speed.writeup.addMaterials')}
        </button>
      </div>
    </section>
  );
}

/** The registered panel `speed.writeup-parser`. */
export function WriteupParserPanel({ record, props, refresh }: MetadataPanelProps) {
  const t = useSpeedText();
  const api = useSpeedApi();
  const routeId = String(record['id'] ?? '');
  const { route, failed, reload } = useRoute(api, routeId, record['version']);
  const [substances, setSubstances] = useState<SpeedSubstanceV1[]>([]);
  const [stepId, setStepId] = useState('');
  const [text, setText] = useState('');
  const [findings, setFindings] = useState<ParsedFinding[] | null>(null);
  const [reagents, setReagents] = useState<ParsedReagent[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const reason = typeof props['applyReason'] === 'string' ? props['applyReason'] : '';

  useEffect(() => {
    let live = true;
    api.activeSubstances().then(
      (loaded) => live && setSubstances(loaded),
      () => live && setSubstances([]),
    );
    return () => {
      live = false;
    };
  }, [api]);
  const step: SpeedStepV1 | undefined =
    route?.steps.find((candidate) => candidate.id === stepId) ?? route?.steps[0];

  const run = async (work: (target: SpeedStepV1) => Promise<unknown>) => {
    if (!step) return;
    setBusy(true);
    setNotice(null);
    try {
      await work(step);
      await reload();
      refresh?.();
    } catch (error) {
      setNotice(error instanceof SpeedApiError ? error.code : 'SPEED_REQUEST_FAILED');
    } finally {
      setBusy(false);
    }
  };

  if (failed)
    return (
      <p role="alert" className="text-sm text-ui-fg-error">
        {t('speed.workbench.loadFailed')}
      </p>
    );
  if (!route)
    return <div aria-busy="true" className="h-40 animate-pulse rounded-lg bg-ui-bg-subtle" />;
  return (
    <WriteupParserView
      route={route}
      stepId={step?.id ?? ''}
      text={text}
      findings={findings}
      reagents={reagents}
      substances={substances}
      busy={busy || !step || reason === ''}
      notice={notice}
      t={t}
      on={{
        step: setStepId,
        text: setText,
        extract: () => {
          setFindings(
            parseWriteup(text).map((finding) => ({
              ...finding,
              confirmed: false,
              edited: finding.value === null ? '' : String(finding.value),
            })),
          );
          setReagents(
            recogniseReagents(
              text,
              substances.map((substance) => ({
                id: substance.id,
                name: substance.name,
                formula: substance.formula,
                casNumber: substance.casNumber,
              })),
            ).map((reagent) => ({ ...reagent, confirmed: false, role: 'Reactant' })),
          );
        },
        confirmFinding: (index, confirmed) =>
          setFindings(
            (current) =>
              current?.map((finding, at) => (at === index ? { ...finding, confirmed } : finding)) ??
              null,
          ),
        editFinding: (index, value) =>
          setFindings(
            (current) =>
              current?.map((finding, at) =>
                at === index ? { ...finding, edited: value } : finding,
              ) ?? null,
          ),
        confirmReagent: (index, confirmed) =>
          setReagents((current) =>
            current.map((reagent, at) => (at === index ? { ...reagent, confirmed } : reagent)),
          ),
        role: (index, role) =>
          setReagents((current) =>
            current.map((reagent, at) => (at === index ? { ...reagent, role } : reagent)),
          ),
        useTemperature: () => {
          const value = confirmedTemperature(findings);
          if (value === null) return;
          void run((target) => {
            const c = target.conditions;
            return api.replaceConditions(
              target.id,
              c?.version ?? 0,
              {
                processTemperatureC: value,
                maximumTechnicalTemperatureC: c?.maximumTechnicalTemperatureC ?? null,
                heatCapacityJPerGK: c?.heatCapacityJPerGK ?? null,
                accumulationPercent: c?.accumulationPercent ?? null,
                reactionEnthalpySource: c?.reactionEnthalpySource ?? null,
                reactionClassId: c?.reactionClassId ?? null,
              },
              reason,
            );
          });
        },
        addMaterials: () =>
          void run(async (target) => {
            for (const reagent of reagents.filter((candidate) => candidate.confirmed))
              await api.addMaterial(
                target.id,
                { substanceId: reagent.substanceId, role: reagent.role },
                reason,
              );
            setReagents((current) => current.map((reagent) => ({ ...reagent, confirmed: false })));
          }),
      }}
    />
  );
}
