'use client';

import type { SpeedOutcomesV1 } from '@gigalibs/contracts';
import { useEffect, useState } from 'react';
import { useSpeedApi, useSpeedText } from './hooks.js';
import type { Translate } from './messages/index.js';

// WI-OI-120cc (SPEED S9b; screen spec §3.4; BRD BO-1 to BO-5): the business outcomes, measured by the module from its
// own records over the routes the member reads. A module page, not a record window (screen spec §1.1). The targets come
// from the page's settings in the module manifest; a measure that meets its target is green, one that does not is orange.

const tile = 'rounded-lg border border-ui-border-base bg-ui-bg-base p-4';
const DOSSIER_SECTIONS = [
  'summary',
  'route',
  'thermal',
  'interactions',
  'actions',
  'stage2',
  'basis',
  'signatures',
];

export interface OutcomeTargets {
  /** BO-2: the median time to screen a route, in hours. */
  readonly screeningHours: number;
  /** BO-3: the share of routes screened before kilo-lab, in percent. */
  readonly screenedPercent: number;
}

const percent = (part: number, whole: number) =>
  whole > 0 ? Math.round((part / whole) * 1000) / 10 : null;
const shown = (value: number | null, digits: number) =>
  value === null
    ? '—'
    : value.toLocaleString('en-US', { maximumFractionDigits: digits, useGrouping: false });

function Tile({
  title,
  value,
  detail,
  met,
}: { title: string; value: string; detail: string; met?: boolean | null }) {
  const tone =
    met === true
      ? 'text-ui-tag-green-text'
      : met === false
        ? 'text-ui-tag-orange-text'
        : 'text-ui-fg-base';
  return (
    <div className={tile}>
      <p className="text-sm font-medium text-ui-fg-subtle">{title}</p>
      <p className={`mt-1 text-2xl font-semibold ${tone}`}>{value}</p>
      <p className="mt-1 text-xs text-ui-fg-muted">{detail}</p>
    </div>
  );
}

export function OutcomesView({
  outcomes,
  targets,
  t,
}: { outcomes: SpeedOutcomesV1; targets: OutcomeTargets; t: Translate }) {
  const { hazards, screening, screened, economy } = outcomes;
  const hazardCount =
    hazards.highInteractions +
    hazards.mediumInteractions +
    hazards.class3OrWorseSteps +
    hazards.gasFormingSteps;
  const hours = screening.medianMinutes === null ? null : screening.medianMinutes / 60;
  const screenedPercent = percent(screened.screened, screened.routes);
  const economyPercent = percent(economy.withEconomy, economy.withDossier);
  return (
    <section aria-label={t('speed.outcomes.title')} className="space-y-6">
      <header>
        <h2 className="text-xl font-semibold text-ui-fg-base">{t('speed.outcomes.title')}</h2>
        <p className="text-sm text-ui-fg-subtle">{t('speed.outcomes.note')}</p>
      </header>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Tile
          title={t('speed.outcomes.bo1')}
          value={String(hazardCount)}
          detail={t('speed.outcomes.bo1Detail', {
            high: hazards.highInteractions,
            medium: hazards.mediumInteractions,
            classes: hazards.class3OrWorseSteps,
            gas: hazards.gasFormingSteps,
          })}
        />
        <Tile
          title={t('speed.outcomes.bo2')}
          value={hours === null ? '—' : t('speed.outcomes.bo2Value', { hours: shown(hours, 1) })}
          detail={t('speed.outcomes.bo2Detail', {
            routes: screening.routesMeasured,
            target: targets.screeningHours,
          })}
          met={hours === null ? null : hours <= targets.screeningHours}
        />
        <Tile
          title={t('speed.outcomes.bo3')}
          value={
            screenedPercent === null
              ? '—'
              : t('speed.outcomes.percent', { value: shown(screenedPercent, 1) })
          }
          detail={t('speed.outcomes.bo3Detail', {
            screened: screened.screened,
            routes: screened.routes,
            target: targets.screenedPercent,
          })}
          met={screenedPercent === null ? null : screenedPercent >= targets.screenedPercent}
        />
        <Tile
          title={t('speed.outcomes.bo4')}
          value={
            economyPercent === null
              ? '—'
              : t('speed.outcomes.percent', { value: shown(economyPercent, 1) })
          }
          detail={t('speed.outcomes.bo4Detail', {
            withEconomy: economy.withEconomy,
            withDossier: economy.withDossier,
          })}
        />
        <Tile
          title={t('speed.outcomes.bo5')}
          value={t('speed.outcomes.bo5Value')}
          detail={t('speed.outcomes.bo5Detail')}
        />
      </div>
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-ui-fg-base">{t('speed.outcomes.portfolio')}</h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Tile
            title={t('speed.outcomes.screenedTile')}
            value={`${screened.screened}/${screened.routes}`}
            detail={t('speed.outcomes.bo3Detail', {
              screened: screened.screened,
              routes: screened.routes,
              target: targets.screenedPercent,
            })}
          />
          <Tile
            title={t('speed.outcomes.worstTile')}
            value={
              outcomes.worstClass === null
                ? '—'
                : t('speed.outcomes.class', { k: outcomes.worstClass })
            }
            detail={t('speed.outcomes.bo1Detail', {
              high: hazards.highInteractions,
              medium: hazards.mediumInteractions,
              classes: hazards.class3OrWorseSteps,
              gas: hazards.gasFormingSteps,
            })}
          />
        </div>
      </div>
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-ui-fg-base">{t('speed.outcomes.receives')}</h3>
        <p className="text-sm text-ui-fg-subtle">{t('speed.outcomes.receivesNote')}</p>
        <ol className="list-inside list-none space-y-1 text-sm text-ui-fg-base">
          {DOSSIER_SECTIONS.map((key) => (
            <li key={key}>{t(`speed.dossier.section.${key}`)}</li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/** The page `/speed/outcomes`. */
export function OutcomesPage({ targets }: { targets: OutcomeTargets }) {
  const t = useSpeedText();
  const api = useSpeedApi();
  const [outcomes, setOutcomes] = useState<SpeedOutcomesV1 | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    api.outcomes().then(
      (loaded) => live && setOutcomes(loaded),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [api]);
  if (failed)
    return (
      <p role="alert" className="text-sm text-ui-fg-error">
        {t('speed.outcomes.loadFailed')}
      </p>
    );
  if (!outcomes)
    return <div aria-busy="true" className="h-40 animate-pulse rounded-lg bg-ui-bg-subtle" />;
  return <OutcomesView outcomes={outcomes} targets={targets} t={t} />;
}
