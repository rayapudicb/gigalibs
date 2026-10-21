'use client';

import type { MetadataPanelProps } from '@gigalibs/configuration-react';
import type { SpeedRouteDetailV1 } from '@gigalibs/contracts';
import { useRoute, useSpeedApi, useSpeedText } from './hooks.js';
import type { Translate } from './messages/index.js';
import { greenOf, shown } from './screens-model.js';

// WI-OI-120by (SPEED S5; screen spec §2.4, panel speed.green-scorecard; FR-GRN-01 to 04, BP-01 §4.B): the route roll-up,
// each step's metrics and the process mass intensity by stream, from the stored results.

const tile = 'rounded-lg border border-ui-border-base bg-ui-bg-base p-3';
const STREAMS = ['reactantsG', 'additivesG', 'solventsG', 'workUpG'] as const;
const STREAM_FILL = [
  'fill-ui-tag-blue-icon',
  'fill-ui-tag-orange-icon',
  'fill-ui-tag-green-icon',
  'fill-ui-tag-red-icon',
];
const STREAM_BG = [
  'bg-ui-tag-blue-icon',
  'bg-ui-tag-orange-icon',
  'bg-ui-tag-green-icon',
  'bg-ui-tag-red-icon',
];

export function GreenScorecardView({
  route,
  showStreams,
  t,
}: { route: SpeedRouteDetailV1; showStreams: boolean; t: Translate }) {
  const rollup = route.rollup as
    | {
        status: 'OK';
        processMassIntensity: number;
        eFactor: number;
        atomEconomyPercent: number;
        overallYieldPercent: number;
        carriedMaterialIds: string[];
      }
    | { status: 'BLOCKED'; blockedStepIndex: number }
    | null;
  const ok = rollup?.status === 'OK' ? rollup : null;
  const tiles = [
    { key: 'pmi', value: shown(ok?.processMassIntensity, 2) },
    { key: 'eFactor', value: shown(ok?.eFactor, 2) },
    { key: 'ae', value: ok ? `${shown(ok.atomEconomyPercent, 1)} %` : null },
    { key: 'yield', value: ok ? `${shown(ok.overallYieldPercent, 1)} %` : null },
  ];
  const carried = ok
    ? route.steps.flatMap((step) =>
        step.materials
          .filter((m) => ok.carriedMaterialIds.includes(m.id))
          .map((m) => m.substanceName),
      )
    : [];
  const rows = route.steps.map((step) => ({ step, green: greenOf(step) }));
  const bars = rows.flatMap(({ step, green }) =>
    green?.status === 'OK' && green.productG > 0
      ? [
          {
            step,
            perKg: STREAMS.map((stream) => green.byStream[stream] / green.productG),
            pmi: green.processMassIntensity,
          },
        ]
      : [],
  );
  const widest = Math.max(
    1,
    ...bars.map((bar) => bar.perKg.reduce((sum, value) => sum + value, 0)),
  );
  return (
    <section aria-label={t('speed.green.label')} className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map((item) => (
          <div key={item.key} className={tile}>
            <p className="text-xs text-ui-fg-subtle">{t(`speed.green.${item.key}`)}</p>
            <p
              className={`text-xl font-semibold ${item.value === null ? 'text-ui-fg-muted' : 'text-ui-fg-base'}`}
            >
              {item.value ?? '—'}
            </p>
            <p className="text-xs text-ui-fg-muted">{t(`speed.green.${item.key}Note`)}</p>
          </div>
        ))}
      </div>
      {rollup?.status === 'BLOCKED' ? (
        <p className="text-sm text-ui-tag-orange-text">
          {t('speed.green.blocked', { position: rollup.blockedStepIndex + 1 })}
        </p>
      ) : null}
      <div className="space-y-1">
        <h4 className="text-sm font-semibold text-ui-fg-base">{t('speed.green.stepMetrics')}</h4>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-ui-fg-subtle">
              {[
                'step',
                'name',
                'stepAe',
                'stepYield',
                'rme',
                'stepPmi',
                'e',
                'eNoWater',
                'solvent',
              ].map((column) => (
                <th key={column} className="pr-2 font-medium">
                  {t(`speed.green.${column}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ step, green }) => (
              <tr key={step.id} className="border-t border-ui-border-base">
                <td className="pr-2">{step.position}</td>
                <td className="pr-2">{step.name}</td>
                <td className="pr-2">
                  {green && green.status !== 'LOCKED' ? shown(green.atomEconomyPercent, 1) : '—'}
                </td>
                {green?.status === 'OK' ? (
                  <>
                    <td className="pr-2">{shown(green.yieldPercent, 1)}</td>
                    <td className="pr-2">{shown(green.reactionMassEfficiencyPercent, 1)}</td>
                    <td className="pr-2">{shown(green.processMassIntensity, 2)}</td>
                    <td className="pr-2">{shown(green.eFactor, 2)}</td>
                    <td className="pr-2">{shown(green.eFactorExcludingWater, 2)}</td>
                    <td>{shown(green.solventIntensity, 2)}</td>
                  </>
                ) : (
                  <td colSpan={6} className="text-ui-fg-muted">
                    {green?.status === 'NO_PRODUCT_MASS' ? t('speed.green.noProductMass') : '—'}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {carried.length > 0 ? (
          <p className="text-xs text-ui-fg-muted">
            {t('speed.green.carried', { list: carried.join(', ') })}
          </p>
        ) : null}
      </div>
      {showStreams && bars.length > 0 ? (
        <div className="space-y-2">
          <svg
            role="img"
            aria-label={t('speed.green.streams')}
            viewBox={`0 0 520 ${bars.length * 26}`}
            className="w-full max-w-2xl"
          >
            {bars.map((bar, row) => {
              let x = 60;
              return (
                <g key={bar.step.id}>
                  <text x={0} y={row * 26 + 15} className="fill-ui-fg-subtle text-[11px]">
                    {t('speed.workbench.step', { position: bar.step.position })}
                  </text>
                  {bar.perKg.map((value, index) => {
                    const width = (value / widest) * 400;
                    const rect = (
                      <rect
                        key={STREAMS[index]}
                        x={x}
                        y={row * 26 + 4}
                        width={width}
                        height={16}
                        className={STREAM_FILL[index]}
                      />
                    );
                    x += width;
                    return rect;
                  })}
                  <text x={x + 4} y={row * 26 + 15} className="fill-ui-fg-base text-[11px]">
                    {shown(bar.pmi, 1)}
                  </text>
                </g>
              );
            })}
          </svg>
          <div className="flex flex-wrap gap-3 text-xs text-ui-fg-subtle">
            {STREAMS.map((stream, index) => (
              <span key={stream} className="inline-flex items-center gap-1">
                <span className={`inline-block h-2.5 w-2.5 rounded-sm ${STREAM_BG[index]}`} />
                {t(`speed.green.stream.${stream}`)}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

/** The registered panel `speed.green-scorecard`. */
export function GreenScorecardPanel({ record, props }: MetadataPanelProps) {
  const t = useSpeedText();
  const api = useSpeedApi();
  const { route, failed } = useRoute(api, String(record['id'] ?? ''), record['version']);
  if (failed)
    return (
      <p role="alert" className="text-sm text-ui-fg-error">
        {t('speed.workbench.loadFailed')}
      </p>
    );
  if (!route)
    return <div aria-busy="true" className="h-40 animate-pulse rounded-lg bg-ui-bg-subtle" />;
  return <GreenScorecardView route={route} showStreams={props['showStreams'] === true} t={t} />;
}
