'use client';

import {
  type SpeedCriteriaSetV1,
  type SpeedLibrarySetV1,
  holdsPermission,
} from '@gigalibs/contracts';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { CriteriaValuesView } from './CriteriaValuesPanel.js';
import { LibraryEntriesView, type LibraryKind } from './LibraryEntriesPanel.js';
import { useSpeedApi, useSpeedText } from './hooks.js';
import { type Translate, knowsCode } from './messages/index.js';
import {
  type PackKind,
  STARTER_PACKS,
  type StarterPack,
  packCounts,
  parsePackFile,
} from './packs.js';
import { SpeedApiError, type SpeedPackBody } from './speed-api.js';

// WI-OI-120ce: the Library and Criteria pages as the prototype shows them: the set in force first, with its entries,
// then (for SPEED administrators) the pack import, then every imported version in the metadata window, where "Put in
// force" stays a window action with its confirmation and reason.

const card = 'space-y-3 rounded-lg border border-ui-border-base bg-ui-bg-base p-4';
const button =
  'rounded-md border border-ui-border-base bg-ui-button-neutral px-2.5 py-1 text-sm text-ui-fg-base hover:bg-ui-button-neutral-hover disabled:opacity-50';
const LIBRARY_KINDS: readonly LibraryKind[] = [
  'MATERIALS',
  'RULES',
  'REACTION_CLASSES',
  'ENERGETIC_GROUPS',
];
export const MANAGE = 'speed.settings.manage';

function ReviewBadge({ reviewed, t }: { reviewed: boolean; t: Translate }) {
  return (
    <span
      className={`rounded border px-1.5 text-xs ${reviewed ? 'border-ui-tag-green-border bg-ui-tag-green-bg text-ui-tag-green-text' : 'border-ui-tag-blue-border bg-ui-tag-blue-bg text-ui-tag-blue-text'}`}
    >
      {t(reviewed ? 'speed.library.reviewed' : 'speed.library.unreviewed')}
    </span>
  );
}

export interface InForceViewProps {
  readonly kind: PackKind;
  readonly set: SpeedCriteriaSetV1 | SpeedLibrarySetV1 | null;
  readonly libraryKind: LibraryKind;
  readonly onLibraryKind: (kind: LibraryKind) => void;
  readonly t: Translate;
}

/** The set in force with its entries, or why there is none. */
export function InForceView({ kind, set, libraryKind, onLibraryKind, t }: InForceViewProps) {
  return (
    <section aria-label={t(`speed.inForce.title.${kind}`)} className={card}>
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold text-ui-fg-base">
            {t(`speed.inForce.title.${kind}`)}
          </h2>
          {set ? <ReviewBadge reviewed={set.reviewStatus === 'APPROVED'} t={t} /> : null}
        </div>
        {set ? (
          <p className="text-sm text-ui-fg-subtle">
            {t('speed.inForce.version', { version: set.versionLabel, source: set.source })}
          </p>
        ) : (
          <p className="text-sm text-ui-tag-blue-text">{t(`speed.inForce.none.${kind}`)}</p>
        )}
      </header>
      {set && 'library' in set ? (
        <>
          <div role="tablist" className="flex flex-wrap gap-1 border-b border-ui-border-base">
            {LIBRARY_KINDS.map((option) => (
              <button
                key={option}
                type="button"
                role="tab"
                aria-selected={option === libraryKind}
                className={`border-b-2 px-3 py-1.5 text-sm ${option === libraryKind ? 'border-ui-fg-base font-semibold text-ui-fg-base' : 'border-transparent text-ui-fg-subtle hover:text-ui-fg-base'}`}
                onClick={() => onLibraryKind(option)}
              >
                {t(`speed.inForce.kind.${option}`)}
              </button>
            ))}
          </div>
          <div className="overflow-x-auto">
            <LibraryEntriesView set={set} kind={libraryKind} t={t} />
          </div>
        </>
      ) : null}
      {set && 'criteria' in set ? <CriteriaValuesView set={set} t={t} /> : null}
      <p className="text-xs text-ui-fg-muted">{t('speed.inForce.history')}</p>
    </section>
  );
}

export interface PackImportViewProps {
  readonly kind: PackKind;
  readonly starters: readonly StarterPack[];
  readonly file: { readonly name: string; readonly body: SpeedPackBody } | null;
  readonly busy: boolean;
  readonly notice: { readonly tone: 'ok' | 'error'; readonly text: string } | null;
  readonly t: Translate;
  readonly on: {
    importPack(body: SpeedPackBody): void;
    chooseFile(file: File): void;
  };
}

function PackLine({ kind, body, t }: { kind: PackKind; body: SpeedPackBody; t: Translate }) {
  return (
    <div className="min-w-0">
      <p className="text-sm font-medium text-ui-fg-base">{body.versionLabel}</p>
      <p className="text-xs text-ui-fg-subtle">{body.source}</p>
      <p className="text-xs text-ui-fg-muted">
        {t(`speed.packs.counts.${kind}`, packCounts(kind, body))}
      </p>
    </div>
  );
}

/** The pack import (SPEED administrators): a starter pack shipped with SPEED, or a pack file. */
export function PackImportView({ kind, starters, file, busy, notice, t, on }: PackImportViewProps) {
  return (
    <section aria-label={t('speed.packs.title')} className={card}>
      <header className="space-y-1">
        <h2 className="text-base font-semibold text-ui-fg-base">{t('speed.packs.title')}</h2>
        <p className="text-sm text-ui-fg-subtle">{t('speed.packs.note')}</p>
      </header>
      {starters.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-ui-fg-base">{t('speed.packs.starter')}</h3>
          {starters.map((pack) => (
            <div
              key={pack.key}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-ui-border-base p-3"
            >
              <PackLine kind={kind} body={pack.body} t={t} />
              <div className="flex items-center gap-2">
                <ReviewBadge reviewed={false} t={t} />
                <button
                  type="button"
                  className={button}
                  disabled={busy}
                  onClick={() => on.importPack(pack.body)}
                >
                  {t(busy ? 'speed.packs.importing' : 'speed.packs.import')}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-ui-fg-base">{t('speed.packs.fromFile')}</h3>
        <label className="block text-sm text-ui-fg-subtle">
          <span className="sr-only">{t('speed.packs.chooseFile')}</span>
          <input
            type="file"
            accept="application/json,.json"
            disabled={busy}
            className="text-sm text-ui-fg-base"
            onChange={(event) => {
              const chosen = event.target.files?.[0];
              if (chosen) on.chooseFile(chosen);
              event.target.value = '';
            }}
          />
        </label>
        {file ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-ui-border-base p-3">
            <PackLine kind={kind} body={file.body} t={t} />
            <button
              type="button"
              className={button}
              disabled={busy}
              onClick={() => on.importPack(file.body)}
            >
              {t(busy ? 'speed.packs.importing' : 'speed.packs.import')}
            </button>
          </div>
        ) : null}
      </div>
      {notice ? (
        <p
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className={`rounded-md border p-2 text-sm ${notice.tone === 'error' ? 'border-ui-tag-red-border bg-ui-tag-red-bg text-ui-tag-red-text' : 'border-ui-tag-green-border bg-ui-tag-green-bg text-ui-tag-green-text'}`}
        >
          {notice.text}
        </p>
      ) : null}
    </section>
  );
}

/** The Library or Criteria page: the set in force, the import (administrators), then the window of every version. */
export function SetsPage({
  kind,
  permissions,
  children,
}: {
  kind: PackKind;
  permissions: readonly string[];
  children: (refresh: number, changed: () => void) => ReactNode;
}) {
  const t = useSpeedText();
  const api = useSpeedApi();
  const [set, setSet] = useState<SpeedCriteriaSetV1 | SpeedLibrarySetV1 | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [libraryKind, setLibraryKind] = useState<LibraryKind>('MATERIALS');
  const [file, setFile] = useState<PackImportViewProps['file']>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<PackImportViewProps['notice']>(null);
  const [refresh, setRefresh] = useState(0);
  const load = useCallback(async () => {
    const sets = await api.setsInForce();
    setSet(kind === 'criteria' ? sets.criteria : sets.library);
    setLoaded(true);
  }, [api, kind]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reload after an import or a window change.
  useEffect(() => {
    load().catch(() => setLoaded(true));
  }, [load, refresh]);
  const manages = holdsPermission(permissions, MANAGE);
  return (
    <div className="space-y-6 p-6">
      {loaded ? (
        <InForceView
          kind={kind}
          set={set}
          libraryKind={libraryKind}
          onLibraryKind={setLibraryKind}
          t={t}
        />
      ) : (
        <div aria-busy="true" className="h-24 animate-pulse rounded-lg bg-ui-bg-subtle" />
      )}
      {manages ? (
        <PackImportView
          kind={kind}
          starters={STARTER_PACKS.filter((pack) => pack.kind === kind)}
          file={file}
          busy={busy}
          notice={notice}
          t={t}
          on={{
            chooseFile: (chosen) => {
              setNotice(null);
              chosen.text().then((text) => {
                const parsed = parsePackFile(kind, text);
                if (parsed.ok) setFile({ name: chosen.name, body: parsed.body });
                else {
                  setFile(null);
                  setNotice({
                    tone: 'error',
                    text: t('speed.packs.invalidFile', {
                      kind: t(`speed.packs.kind.${kind}`),
                      detail: parsed.detail,
                    }),
                  });
                }
              });
            },
            importPack: (body) => {
              setBusy(true);
              setNotice(null);
              api.importPack(kind, body).then(
                (imported) => {
                  setBusy(false);
                  setFile(null);
                  setNotice({
                    tone: 'ok',
                    text: t('speed.packs.imported', { version: imported.versionLabel }),
                  });
                  setRefresh((value) => value + 1);
                },
                (error: unknown) => {
                  setBusy(false);
                  const code = error instanceof SpeedApiError ? error.code : 'SPEED_REQUEST_FAILED';
                  setNotice({
                    tone: 'error',
                    text: knowsCode(code)
                      ? t(code)
                      : t('SPEED_REQUEST_FAILED', { status: String(code) }),
                  });
                },
              );
            },
          }}
        />
      ) : null}
      {children(refresh, () => {
        load().catch(() => undefined);
      })}
    </div>
  );
}
