'use client';

import type { MetadataPanelProps } from '@gigalibs/configuration-react';
import type { SpeedRouteDetailV1 } from '@gigalibs/contracts';
import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { useRouteChanges } from './hooks.js';
import { type Translate, speedText } from './messages/index.js';
import { highInteractions, routeWorstClass, shown } from './screens-model.js';
import { createSpeedApi } from './speed-api.js';
import { summaryView } from './workbench-model.js';

const WORST_TONE = [
  '',
  'text-ui-tag-green-text',
  'text-ui-tag-green-text',
  'text-ui-tag-orange-text',
  'text-ui-tag-red-text',
  'text-ui-tag-red-text',
];

// WI-OI-120bx/120by/120bz (SPEED S4 to S6; screen spec §2.4, panel speed.route-summary): six tiles in the prototype's
// order, from the stored results. WI-OI-120cc: the data-gap tile counts the dossier model's data gaps, so it always
// agrees with the dossier.

const tile = 'rounded-lg border border-ui-border-base bg-ui-bg-base p-3';

export interface RouteSummaryViewProps {
  readonly route: SpeedRouteDetailV1;
  readonly compact: boolean;
  readonly t: Translate;
  /** The dossier model's data gaps; null while not known (no preview, or steps screened with different sets). */
  readonly dataGaps?: number | null;
}

export function RouteSummaryView({ route, compact, t, dataGaps = null }: RouteSummaryViewProps) {
  const summary = summaryView(route);
  const gateTone = summary.allPass ? 'text-ui-tag-green-text' : 'text-ui-tag-red-text';
  const worst = routeWorstClass(route);
  const high = highInteractions(route);
  const rollup =
    route.rollup?.['status'] === 'OK'
      ? (route.rollup as { processMassIntensity: number; atomEconomyPercent: number })
      : null;
  const tiles: readonly { key: string; value: string | null; tone?: string | undefined }[] = [
    { key: 'gate', value: `${summary.passing}/${summary.steps}`, tone: gateTone },
    {
      key: 'worst',
      value: worst === null ? null : t('speed.summary.class', { value: worst }),
      tone: worst === null ? undefined : WORST_TONE[worst],
    },
    {
      key: 'high',
      value: high.total === 0 && !high.screened ? null : `${high.controlled}/${high.total}`,
      tone: high.controlled < high.total ? 'text-ui-tag-red-text' : 'text-ui-tag-green-text',
    },
    { key: 'pmi', value: rollup ? shown(rollup.processMassIntensity, 2) : null },
    { key: 'ae', value: rollup ? `${shown(rollup.atomEconomyPercent, 1)} %` : null },
    {
      key: 'gaps',
      value: dataGaps === null ? null : String(dataGaps),
      tone: dataGaps !== null && dataGaps > 0 ? 'text-ui-tag-blue-text' : 'text-ui-tag-green-text',
    },
  ];
  return (
    <section
      aria-label={t('speed.summary.label')}
      className={`grid gap-3 ${compact ? 'grid-cols-6' : 'grid-cols-2 md:grid-cols-3 xl:grid-cols-6'}`}
    >
      {tiles.map((item) => (
        <div key={item.key} className={tile}>
          <p className="text-xs text-ui-fg-subtle">{t(`speed.summary.${item.key}`)}</p>
          <p
            className={`${compact ? 'text-base' : 'text-xl'} font-semibold ${item.value === null ? 'text-ui-fg-muted' : (item.tone ?? 'text-ui-fg-base')}`}
          >
            {item.value ?? t('speed.summary.notComputed')}
          </p>
          {compact ? null : (
            <p className="text-xs text-ui-fg-muted">{t(`speed.summary.${item.key}Note`)}</p>
          )}
        </div>
      ))}
    </section>
  );
}

export function RouteSummaryPanel({ record, props }: MetadataPanelProps) {
  const t = useMemo(
    () =>
      speedText(
        typeof document === 'undefined' ? 'en-US' : document.documentElement.lang || 'en-US',
      ),
    [],
  );
  const api = useMemo(() => createSpeedApi(), []);
  const [route, setRoute] = useState<SpeedRouteDetailV1 | null>(null);
  const [dataGaps, setDataGaps] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const routeId = String(record['id'] ?? '');
  const version = record['version'];
  // WI-OI-120ce: the tiles follow every change the route's other panels make.
  const [changes, setChanges] = useState(0);
  const changed = useCallback(() => setChanges((value) => value + 1), []);
  const source = useId();
  useRouteChanges(routeId, source, changed);
  // biome-ignore lint/correctness/useExhaustiveDependencies: another panel's change reloads the tiles.
  useEffect(() => {
    let live = true;
    api.route(routeId).then(
      (loaded) => live && setRoute(loaded),
      () => live && setFailed(true),
    );
    // The same model as the Dossier tab: when it cannot be made, the tile says the gaps are not computed.
    api.dossierPreview(routeId).then(
      (preview) => live && setDataGaps(preview.model.facts?.dataGaps ?? null),
      () => live && setDataGaps(null),
    );
    return () => {
      live = false;
    };
  }, [api, routeId, version, changes]);
  if (failed)
    return (
      <p role="alert" className="text-sm text-ui-fg-error">
        {t('speed.workbench.loadFailed')}
      </p>
    );
  if (!route)
    return <div aria-busy="true" className="h-20 animate-pulse rounded-lg bg-ui-bg-subtle" />;
  return (
    <RouteSummaryView route={route} compact={props['compact'] === true} t={t} dataGaps={dataGaps} />
  );
}
