'use client';

import type { MetadataPanelProps } from '@gigalibs/configuration-react';
import {
  type SpeedCriteriaSetV1,
  type SpeedRouteDetailV1,
  holdsPermission,
} from '@gigalibs/contracts';
import { useMemo, useState } from 'react';
import { useRoute, useSetsInForce, useSpeedApi, useSpeedText } from './hooks.js';
import type { Translate } from './messages/index.js';
import { type ObRowView, obPoints, obRows, shown } from './screens-model.js';
import { SpeedApiError } from './speed-api.js';
import { changeReasons } from './workbench-model.js';

// WI-OI-120by (SPEED S5; screen spec §2.4, panel speed.ob-chart; FR-OB-01 to 06, BRL-02): the oxygen balance of every
// material on one axis with the alert band of the criteria in force, and the table with the energetic-group tags. The
// axis span and ticks are the placement's props (metadata); the band and its citation come from the criteria in force.

const TONE = {
  HIGH: 'border-ui-tag-red-border bg-ui-tag-red-bg text-ui-tag-red-text',
  REVIEW: 'border-ui-tag-orange-border bg-ui-tag-orange-bg text-ui-tag-orange-text',
  LOW: 'border-ui-tag-green-border bg-ui-tag-green-bg text-ui-tag-green-text',
} as const;
const DOT = {
  HIGH: 'fill-ui-tag-red-icon',
  REVIEW: 'fill-ui-tag-orange-icon',
  LOW: 'fill-ui-tag-green-icon',
} as const;
const button =
  'rounded-md border border-ui-border-base bg-ui-button-neutral px-2 py-0.5 text-xs text-ui-fg-base hover:bg-ui-button-neutral-hover disabled:opacity-50';

export interface ObChartViewProps {
  readonly route: SpeedRouteDetailV1;
  readonly criteria: SpeedCriteriaSetV1 | null;
  readonly groups: readonly string[];
  readonly axisMinPercent: number;
  readonly axisMaxPercent: number;
  readonly tickPercent: number;
  readonly showTable: boolean;
  readonly editable: boolean;
  readonly busy: boolean;
  readonly onTags: (row: ObRowView, groups: readonly string[]) => void;
  readonly t: Translate;
}

export function ObChartView(props: ObChartViewProps) {
  const {
    route,
    criteria,
    groups,
    axisMinPercent,
    axisMaxPercent,
    tickPercent,
    showTable,
    editable,
    busy,
    onTags,
    t,
  } = props;
  const rows = obRows(route);
  const points = obPoints(rows);
  const band = criteria?.criteria.oxygenBalanceAlertBandPercent ?? null;
  const citation = criteria?.citations['oxygenBalanceAlertBandPercent.lowerExclusive'] ?? '—';
  const width = 640;
  const x = (percent: number) =>
    ((Math.min(Math.max(percent, axisMinPercent), axisMaxPercent) - axisMinPercent) /
      (axisMaxPercent - axisMinPercent)) *
    width;
  const ticks: number[] = [];
  for (
    let tick = Math.ceil(axisMinPercent / tickPercent) * tickPercent;
    tick <= axisMaxPercent;
    tick += tickPercent
  )
    ticks.push(tick);
  if (rows.length === 0) return <p className="text-sm text-ui-fg-muted">{t('speed.ob.none')}</p>;
  return (
    <section aria-label={t('speed.ob.label')} className="space-y-3">
      <p className="text-sm text-ui-fg-subtle">{t('speed.ob.explainer', { citation })}</p>
      <svg
        role="img"
        aria-label={t('speed.ob.label')}
        viewBox={`-10 0 ${width + 20} 90`}
        className="w-full max-w-3xl"
      >
        {band ? (
          <>
            <rect
              x={x(band.lowerExclusive)}
              y={10}
              width={x(band.upperExclusive) - x(band.lowerExclusive)}
              height={40}
              className="fill-ui-tag-orange-bg"
            />
            <text x={x(band.lowerExclusive)} y={8} className="fill-ui-fg-subtle text-[10px]">
              {t('speed.ob.band', { lower: band.lowerExclusive, upper: band.upperExclusive })}
            </text>
          </>
        ) : null}
        <line x1={0} x2={width} y1={50} y2={50} className="stroke-ui-border-strong" />
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={x(tick)} x2={x(tick)} y1={50} y2={55} className="stroke-ui-border-strong" />
            <text x={x(tick)} y={68} textAnchor="middle" className="fill-ui-fg-muted text-[10px]">
              {tick}
            </text>
          </g>
        ))}
        {points.map((point, index) => (
          <circle
            key={point.formula}
            cx={x(point.percent)}
            cy={40 - (index % 3) * 9}
            r={4}
            className={DOT[point.recommendation]}
          >
            <title>{`${point.names} (${point.formula}): ${shown(point.percent, 1)} %`}</title>
          </circle>
        ))}
      </svg>
      <div className="flex flex-wrap gap-2 text-xs">
        {(['HIGH', 'REVIEW', 'LOW'] as const).map((level) => (
          <span key={level} className={`rounded border px-1.5 ${TONE[level]}`}>
            {t(`speed.ob.legend.${level}`)}
          </span>
        ))}
      </div>
      {showTable ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-ui-fg-subtle">
              {[
                'step',
                'material',
                'formula',
                'molarMass',
                'percent',
                'bandColumn',
                'groups',
                'recommendation',
              ].map((column) => (
                <th key={column} className="pr-2 font-medium">
                  {t(`speed.ob.${column}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <ObRow
                key={row.materialId}
                row={row}
                groups={groups}
                editable={editable}
                busy={busy}
                onTags={onTags}
                t={t}
              />
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}

function ObRow({
  row,
  groups,
  editable,
  busy,
  onTags,
  t,
}: {
  row: ObRowView;
  groups: readonly string[];
  editable: boolean;
  busy: boolean;
  onTags: ObChartViewProps['onTags'];
  t: Translate;
}) {
  const [adding, setAdding] = useState('');
  const result = row.result;
  const applicable = result.status === 'OK';
  const offered = groups.filter((group) => !row.energeticGroups.includes(group));
  return (
    <tr className="border-t border-ui-border-base">
      <td className="pr-2">{row.step.position}</td>
      <td className="pr-2 text-ui-fg-base">{row.name}</td>
      <td className="pr-2 font-mono">{row.formula}</td>
      <td className="pr-2">{shown(row.molarMass, 2)}</td>
      <td className="pr-2">
        {applicable ? shown(result.percent, 1) : t('speed.ob.notApplicable')}
      </td>
      <td className="pr-2">
        {applicable ? (
          <span
            className={`rounded border px-1.5 text-xs ${result.inAlertBand ? TONE.REVIEW : 'border-ui-border-base text-ui-fg-muted'}`}
          >
            {t(result.inAlertBand ? 'speed.ob.inBand' : 'speed.ob.outside')}
          </span>
        ) : null}
      </td>
      <td className="pr-2">
        <div className="flex flex-wrap items-center gap-1">
          {row.energeticGroups.map((group) => (
            <span
              key={group}
              className="inline-flex items-center gap-1 rounded border border-ui-border-base px-1.5 text-xs"
            >
              {group}
              {editable ? (
                <button
                  type="button"
                  className="text-ui-fg-muted hover:text-ui-fg-base"
                  aria-label={t('speed.ob.removeTag', { group })}
                  disabled={busy}
                  onClick={() =>
                    onTags(
                      row,
                      row.energeticGroups.filter((tag) => tag !== group),
                    )
                  }
                >
                  ×
                </button>
              ) : null}
            </span>
          ))}
          {editable && offered.length > 0 ? (
            <>
              <select
                aria-label={t('speed.ob.addTag')}
                className="rounded-md border border-ui-border-base bg-ui-bg-field px-1 text-xs"
                value={adding}
                onChange={(event) => setAdding(event.target.value)}
              >
                <option value="" />
                {offered.map((group) => (
                  <option key={group} value={group}>
                    {group}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={button}
                disabled={busy || adding === ''}
                onClick={() => onTags(row, [...row.energeticGroups, adding])}
              >
                {t('speed.ob.addTag')}
              </button>
            </>
          ) : null}
        </div>
      </td>
      <td className="pr-2">
        {applicable && result.recommendation ? (
          <span className={`rounded border px-1.5 text-xs ${TONE[result.recommendation]}`}>
            {t(`speed.recommendation.${result.recommendation}`)}
          </span>
        ) : null}
      </td>
    </tr>
  );
}

/** The registered panel `speed.ob-chart`. */
export function ObChartPanel({ record, props, permissions }: MetadataPanelProps) {
  const t = useSpeedText();
  const api = useSpeedApi();
  const { route, failed, reload } = useRoute(api, String(record['id'] ?? ''), record['version']);
  const sets = useSetsInForce(api);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reasons = useMemo(() => changeReasons(props['changeReasons']), [props]);
  const [reason, setReason] = useState('');
  if (failed)
    return (
      <p role="alert" className="text-sm text-ui-fg-error">
        {t('speed.workbench.loadFailed')}
      </p>
    );
  if (!route || !sets)
    return <div aria-busy="true" className="h-40 animate-pulse rounded-lg bg-ui-bg-subtle" />;
  const editable =
    route.status === 'DRAFT' &&
    holdsPermission(permissions, 'speed.routes.write') &&
    reasons.length > 0;
  const onTags = async (row: ObRowView, groups: readonly string[]) => {
    setBusy(true);
    setError(null);
    try {
      await api.setEnergeticGroups(
        row.materialId,
        row.materialVersion,
        groups,
        reason || (reasons[0] as string),
      );
      await reload();
    } catch (failure) {
      setError(failure instanceof SpeedApiError ? failure.code : 'SPEED_REQUEST_FAILED');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2">
      {editable ? (
        <label className="block max-w-sm text-sm text-ui-fg-subtle">
          {t('speed.workbench.reason')}
          <select
            className="w-full rounded-md border border-ui-border-base bg-ui-bg-field px-2 py-1 text-sm text-ui-fg-base"
            value={reason || reasons[0]}
            onChange={(event) => setReason(event.target.value)}
          >
            {reasons.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-ui-tag-red-text">
          {t(error, { status: error })}
        </p>
      ) : null}
      <ObChartView
        route={route}
        criteria={sets.criteria}
        groups={sets.library?.library.energeticGroups.map((group) => group.id) ?? []}
        axisMinPercent={Number(props['axisMinPercent'])}
        axisMaxPercent={Number(props['axisMaxPercent'])}
        tickPercent={Number(props['tickPercent'])}
        showTable={props['showTable'] === true}
        editable={editable}
        busy={busy}
        onTags={onTags}
        t={t}
      />
    </div>
  );
}
