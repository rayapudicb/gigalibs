'use client';

import type { MetadataPanelProps } from '@gigalibs/configuration-react';
import type { SpeedRouteDetailV1 } from '@gigalibs/contracts';
import { useEffect, useMemo, useState } from 'react';
import { type Translate, speedText } from './messages/index.js';
import { createSpeedApi } from './speed-api.js';
import { summaryView } from './workbench-model.js';

// WI-OI-120bx (SPEED S4; screen spec §2.4, panel speed.route-summary): six tiles in the prototype's order. S4 computes
// the gate; the criticality, interactions, green metrics and data-gap tiles fill as S5 to S7 store those results.

const tile = 'rounded-lg border border-ui-border-base bg-ui-bg-base p-3';

export interface RouteSummaryViewProps {
  readonly route: SpeedRouteDetailV1;
  readonly compact: boolean;
  readonly t: Translate;
}

export function RouteSummaryView({ route, compact, t }: RouteSummaryViewProps) {
  const summary = summaryView(route);
  const gateTone = summary.allPass ? 'text-ui-tag-green-text' : 'text-ui-tag-red-text';
  const tiles: readonly { key: string; value: string | null; tone?: string }[] = [
    { key: 'gate', value: `${summary.passing}/${summary.steps}`, tone: gateTone },
    { key: 'worst', value: null },
    { key: 'high', value: null },
    { key: 'pmi', value: null },
    { key: 'ae', value: null },
    { key: 'gaps', value: null },
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
  const [failed, setFailed] = useState(false);
  const routeId = String(record['id'] ?? '');
  const version = record['version'];
  useEffect(() => {
    let live = true;
    api.route(routeId).then(
      (loaded) => live && setRoute(loaded),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [api, routeId, version]);
  if (failed)
    return (
      <p role="alert" className="text-sm text-ui-fg-error">
        {t('speed.workbench.loadFailed')}
      </p>
    );
  if (!route)
    return <div aria-busy="true" className="h-20 animate-pulse rounded-lg bg-ui-bg-subtle" />;
  return <RouteSummaryView route={route} compact={props['compact'] === true} t={t} />;
}
