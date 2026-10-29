'use client';

import type { MetadataPanelProps } from '@gigalibs/configuration-react';
import type { SpeedCriteriaSetV1 } from '@gigalibs/contracts';
import { useEffect, useState } from 'react';
import { useSpeedText } from './hooks.js';
import { type Translate, knowsCode } from './messages/index.js';
import { SPEED_API, SpeedApiError } from './speed-api.js';

// WI-OI-120by (SPEED S5; screen spec §3.2, panel speed.criteria-values): every value of a criteria set with its citation,
// by name (WI-OI-120ce) with the engine's own key beside it.

function leaves(value: unknown, path: string[] = []): [string, number][] {
  if (typeof value === 'number') return [[path.join('.'), value]];
  if (value && typeof value === 'object')
    return Object.entries(value).flatMap(([key, child]) => leaves(child, [...path, key]));
  return [];
}

export function CriteriaValuesView({ set, t }: { set: SpeedCriteriaSetV1; t: Translate }) {
  return (
    <table aria-label={t('speed.criteria.label')} className="w-full text-sm">
      <thead>
        <tr className="text-left text-ui-fg-subtle">
          <th className="pr-2 font-medium">{t('speed.criteria.name')}</th>
          <th className="pr-2 font-medium">{t('speed.criteria.key')}</th>
          <th className="pr-2 font-medium">{t('speed.criteria.value')}</th>
          <th className="font-medium">{t('speed.criteria.citation')}</th>
        </tr>
      </thead>
      <tbody>
        {leaves(set.criteria).map(([key, value]) => (
          <tr key={key} className="border-t border-ui-border-base">
            <td className="pr-2 text-ui-fg-base">
              {knowsCode(`speed.criteria.path.${key}`) ? t(`speed.criteria.path.${key}`) : key}
            </td>
            <td className="pr-2 font-mono text-xs text-ui-fg-subtle">{key}</td>
            <td className="pr-2">{value}</td>
            <td className="text-ui-fg-subtle">{set.citations[key] ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The registered panel `speed.criteria-values`, drawn for a criteria set record. */
export function CriteriaValuesPanel({ record }: MetadataPanelProps) {
  const t = useSpeedText();
  const [set, setSet] = useState<SpeedCriteriaSetV1 | null>(null);
  const [failed, setFailed] = useState(false);
  const id = String(record['id'] ?? '');
  useEffect(() => {
    let live = true;
    fetch(`${SPEED_API}/criteria-sets/${id}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })
      .then(async (response) => {
        if (!response.ok) throw new SpeedApiError(response.status, 'SPEED_REQUEST_FAILED', '');
        return (await response.json()) as SpeedCriteriaSetV1;
      })
      .then(
        (loaded) => live && setSet(loaded),
        () => live && setFailed(true),
      );
    return () => {
      live = false;
    };
  }, [id]);
  if (failed)
    return (
      <p role="alert" className="text-sm text-ui-fg-error">
        {t('speed.workbench.loadFailed')}
      </p>
    );
  if (!set)
    return <div aria-busy="true" className="h-20 animate-pulse rounded-lg bg-ui-bg-subtle" />;
  return <CriteriaValuesView set={set} t={t} />;
}
