'use client';

import type { MetadataPanelProps } from '@gigalibs/configuration-react';
import type { SpeedLibrarySetV1 } from '@gigalibs/contracts';
import { type ReactNode, useEffect, useState } from 'react';
import { useSpeedApi, useSpeedText } from './hooks.js';
import type { Translate } from './messages/index.js';
import { shown } from './screens-model.js';

// WI-OI-120bz (SPEED S6; screen spec §3.1, panel speed.library-entries): one kind of entry of a library set, read-only in
// R1, with each entry's citation and review status. The placement's `kind` prop chooses which.

export type LibraryKind = 'MATERIALS' | 'RULES' | 'REACTION_CLASSES' | 'ENERGETIC_GROUPS';

function Status({ reviewed, t }: { reviewed: boolean; t: Translate }) {
  return (
    <span
      className={`rounded border px-1.5 text-xs ${reviewed ? 'border-ui-tag-green-border bg-ui-tag-green-bg text-ui-tag-green-text' : 'border-ui-tag-blue-border bg-ui-tag-blue-bg text-ui-tag-blue-text'}`}
    >
      {t(reviewed ? 'speed.library.reviewed' : 'speed.library.unreviewed')}
    </span>
  );
}

function Table({
  columns,
  rows,
  t,
}: { columns: readonly string[]; rows: readonly (readonly ReactNode[])[]; t: Translate }) {
  if (rows.length === 0)
    return <p className="text-sm text-ui-fg-muted">{t('speed.library.empty')}</p>;
  return (
    <table aria-label={t('speed.library.label')} className="w-full text-sm">
      <thead>
        <tr className="text-left text-ui-fg-subtle">
          {columns.map((column) => (
            <th key={column} className="pr-2 font-medium">
              {t(`speed.library.${column}`)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((cells, row) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: the rows of an immutable set keep their order.
          <tr key={row} className="border-t border-ui-border-base align-top">
            {cells.map((cell, column) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed columns.
              <td key={column} className="pr-2 py-1">
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function LibraryEntriesView({
  set,
  kind,
  t,
}: { set: SpeedLibrarySetV1; kind: LibraryKind; t: Translate }) {
  const library = set.library;
  const table =
    kind === 'MATERIALS' ? (
      <Table
        t={t}
        columns={['id', 'name', 'cas', 'formula', 'classes', 'note', 'citation', 'status']}
        rows={library.materials.map((entry) => [
          entry.id,
          entry.name ?? '',
          entry.casNumber ?? '',
          entry.formula ?? '',
          entry.classes.join(', '),
          entry.note ?? '',
          entry.citation,
          <Status key="status" reviewed={entry.reviewed} t={t} />,
        ])}
      />
    ) : kind === 'RULES' ? (
      <Table
        t={t}
        columns={[
          'rule',
          'pairClasses',
          'severity',
          'findingControl',
          'test',
          'citation',
          'status',
        ]}
        rows={library.rules.map((entry) => [
          entry.id,
          `${entry.classA} × ${entry.classB}`,
          t(`speed.severity.${entry.severity}`),
          [entry.finding, entry.control].filter(Boolean).join(' · '),
          entry.recommendedTest ? t(`stage2.test.${entry.recommendedTest}`) : '',
          entry.citation,
          <Status key="status" reviewed={entry.reviewed} t={t} />,
        ])}
      />
    ) : kind === 'REACTION_CLASSES' ? (
      <Table
        t={t}
        columns={['id', 'reactionClass', 'typicalDh', 'citation', 'flag', 'status']}
        rows={library.reactionClasses.map((entry) => [
          entry.id,
          entry.name ?? '',
          shown(entry.typicalReactionEnthalpyKJPerMol, 1) ?? '',
          entry.citation,
          t('speed.library.estimate'),
          <Status key="status" reviewed={entry.reviewed} t={t} />,
        ])}
      />
    ) : (
      <Table
        t={t}
        columns={['id', 'name', 'citation', 'status']}
        rows={library.energeticGroups.map((entry) => [
          entry.id,
          entry.name ?? '',
          entry.citation,
          <Status key="status" reviewed={entry.reviewed} t={t} />,
        ])}
      />
    );
  return (
    <div className="space-y-2">
      {table}
      <p className="text-xs text-ui-fg-muted">{t('speed.library.changeControl')}</p>
    </div>
  );
}

/** The registered panel `speed.library-entries`, drawn for a library set record. */
export function LibraryEntriesPanel({ record, props }: MetadataPanelProps) {
  const t = useSpeedText();
  const api = useSpeedApi();
  const [set, setSet] = useState<SpeedLibrarySetV1 | null>(null);
  const [failed, setFailed] = useState(false);
  const id = String(record['id'] ?? '');
  useEffect(() => {
    let live = true;
    api.librarySet(id).then(
      (loaded) => live && setSet(loaded),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [api, id]);
  if (failed)
    return (
      <p role="alert" className="text-sm text-ui-fg-error">
        {t('speed.workbench.loadFailed')}
      </p>
    );
  if (!set)
    return <div aria-busy="true" className="h-20 animate-pulse rounded-lg bg-ui-bg-subtle" />;
  return <LibraryEntriesView set={set} kind={props['kind'] as LibraryKind} t={t} />;
}
