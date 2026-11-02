'use client';

import { codeLabel } from '@gigalibs/web-sdk';

import type { SpeedAuditEntryV1, SpeedAuditPageV1, SpeedRouteV1 } from '@gigalibs/contracts';
import { useCallback, useEffect, useState } from 'react';
import { useSpeedApi, useSpeedText } from './hooks.js';
import { type Translate, knowsCode } from './messages/index.js';
import { type AuditFilters, SpeedApiError, auditCsvUrl } from './speed-api.js';

// WI-OI-120cc (SPEED; screen spec §3.3; FR-AUD-01, 02): the audit trail, a module page like Outcomes: the metadata list
// view has no filters, local-time column or export yet, which this screen needs. One row per changed field; people are
// shown by name through the platform's member lookup. `speed.audit.read-own` members see their own entries only.

const input =
  'rounded-md border border-ui-border-base bg-ui-bg-field px-2 py-1 text-sm text-ui-fg-base focus:border-ui-border-interactive focus:outline-none';
const button =
  'rounded-md border border-ui-border-base bg-ui-button-neutral px-2.5 py-1 text-sm text-ui-fg-base hover:bg-ui-button-neutral-hover disabled:opacity-50';
const MEMBERS_LOOKUP = '/api/control/v1/lookups/workspace-members';
interface LookupBody {
  readonly items?: readonly { readonly value: string; readonly label: string }[];
}

export interface AuditRow {
  readonly key: string;
  readonly entry: SpeedAuditEntryV1;
  readonly field: string | null;
  readonly from: unknown;
  readonly to: unknown;
}

/** One row per changed field; an entry without changes is one row. */
export function auditRows(entries: readonly SpeedAuditEntryV1[]): AuditRow[] {
  return entries.flatMap((entry): AuditRow[] =>
    entry.changes.length
      ? entry.changes.map((change) => ({
          key: `${entry.id}:${change.field}`,
          entry,
          field: change.field,
          from: change.from,
          to: change.to,
        }))
      : [{ key: entry.id, entry, field: null, from: null, to: null }],
  );
}

/** Work SPEED does itself (the dossier worker) is recorded as `system:<name>`; it is not a workspace member. */
export const isSystemActor = (subject: string) => subject.startsWith('system:');

/** A person by name through the member lookup; SPEED's own work by its catalogue label. */
export function actorLabel(
  subject: string,
  names: Readonly<Record<string, string>>,
  t: Translate,
): string {
  if (isSystemActor(subject)) {
    const key = `speed.audit.system.${subject.slice('system:'.length)}`;
    return knowsCode(key) ? t(key) : t('speed.audit.system');
  }
  return names[subject] ?? subject;
}

const shown = (value: unknown) =>
  value === null || value === undefined
    ? '—'
    : typeof value === 'string'
      ? value
      : JSON.stringify(value);

export interface AuditTrailViewProps {
  readonly page: SpeedAuditPageV1 | null;
  readonly routes: readonly SpeedRouteV1[];
  readonly names: Readonly<Record<string, string>>;
  readonly draft: AuditFilters;
  readonly applied: AuditFilters;
  readonly notice: string | null;
  readonly t: Translate;
  readonly on: {
    draft(filters: AuditFilters): void;
    apply(): void;
    clear(): void;
    page(page: number): void;
  };
}

export function AuditTrailView({
  page,
  routes,
  names,
  draft,
  applied,
  notice,
  t,
  on,
}: AuditTrailViewProps) {
  const rows = page ? auditRows(page.items) : [];
  const pages = page ? Math.max(1, Math.ceil(page.total / page.pageSize)) : 1;
  const routeName = (id: string | null) => routes.find((route) => route.id === id)?.name ?? null;
  const set = (key: keyof AuditFilters) => (event: { target: { value: string } }) =>
    on.draft({ ...draft, [key]: event.target.value });
  return (
    <section aria-label={t('speed.audit.title')} className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold text-ui-fg-base">{t('speed.audit.title')}</h2>
        <p className="text-sm text-ui-fg-subtle">{t('speed.audit.note')}</p>
        {page?.ownOnly ? (
          <p className="text-sm text-ui-tag-blue-text">{t('speed.audit.ownOnly')}</p>
        ) : null}
      </header>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          on.apply();
        }}
      >
        <label className="space-y-1 text-sm text-ui-fg-subtle">
          <span className="block">{t('speed.audit.route')}</span>
          <select className={input} value={draft.routeId ?? ''} onChange={set('routeId')}>
            <option value="">{t('speed.audit.anyRoute')}</option>
            {routes.map((route) => (
              <option key={route.id} value={route.id}>
                {route.name}
              </option>
            ))}
          </select>
        </label>
        {page?.ownOnly ? null : (
          <label className="space-y-1 text-sm text-ui-fg-subtle">
            <span className="block">{t('speed.audit.user')}</span>
            <select className={input} value={draft.actor ?? ''} onChange={set('actor')}>
              <option value="">—</option>
              {Object.entries(names).map(([subject, name]) => (
                <option key={subject} value={subject}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="space-y-1 text-sm text-ui-fg-subtle">
          <span className="block">{t('speed.audit.action')}</span>
          <input className={input} value={draft.action ?? ''} onChange={set('action')} />
        </label>
        <label className="space-y-1 text-sm text-ui-fg-subtle">
          <span className="block">{t('speed.audit.from')}</span>
          <input className={input} type="date" value={draft.from ?? ''} onChange={set('from')} />
        </label>
        <label className="space-y-1 text-sm text-ui-fg-subtle">
          <span className="block">{t('speed.audit.to')}</span>
          <input className={input} type="date" value={draft.to ?? ''} onChange={set('to')} />
        </label>
        <button type="submit" className={button}>
          {t('speed.audit.apply')}
        </button>
        <button type="button" className={button} onClick={on.clear}>
          {t('speed.audit.clear')}
        </button>
        {page && !page.ownOnly ? (
          <a
            className="rounded-md border border-ui-border-base px-2.5 py-1 text-sm text-ui-fg-interactive hover:bg-ui-button-neutral-hover"
            href={auditCsvUrl(dayRange(applied))}
            download
          >
            {t('speed.audit.exportCsv')}
          </a>
        ) : null}
      </form>
      {notice ? (
        <p
          role="alert"
          className="rounded-md border border-ui-tag-red-border bg-ui-tag-red-bg p-2 text-sm text-ui-tag-red-text"
        >
          {knowsCode(notice) ? t(notice) : t('SPEED_REQUEST_FAILED', { status: notice })}
        </p>
      ) : null}
      {page === null ? (
        notice ? null : (
          <div aria-busy="true" className="h-40 animate-pulse rounded-lg bg-ui-bg-subtle" />
        )
      ) : rows.length === 0 ? (
        <p className="text-sm text-ui-fg-muted">{t('speed.audit.empty')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ui-fg-subtle">
                {['timeUtc', 'local', 'user', 'action', 'record', 'field', 'change', 'reason'].map(
                  (column) => (
                    <th key={column} className="pr-3 font-medium">
                      {t(`speed.audit.${column}`)}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-t border-ui-border-base align-top">
                  <td className="whitespace-nowrap pr-3 text-ui-fg-base">
                    {row.entry.occurredAt.replace('T', ' ').slice(0, 19)}
                  </td>
                  <td className="whitespace-nowrap pr-3 text-ui-fg-subtle">
                    {new Date(row.entry.occurredAt).toLocaleString()}
                  </td>
                  <td className="pr-3 text-ui-fg-base">{actorLabel(row.entry.actor, names, t)}</td>
                  <td className="pr-3 text-ui-fg-base">{codeLabel(row.entry.action)}</td>
                  <td className="pr-3 text-ui-fg-subtle">
                    {row.entry.entityType}
                    {routeName(row.entry.entityId) ? ` · ${routeName(row.entry.entityId)}` : ''}
                  </td>
                  <td className="pr-3 text-ui-fg-base">{row.field ?? '—'}</td>
                  <td className="pr-3 text-ui-fg-base">
                    {row.field ? `${shown(row.from)} → ${shown(row.to)}` : '—'}
                  </td>
                  <td className="pr-3 text-ui-fg-subtle">{row.entry.reason ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {page ? (
        <div className="flex items-center gap-3 text-sm text-ui-fg-subtle">
          <button
            type="button"
            className={button}
            disabled={page.page <= 1}
            onClick={() => on.page(page.page - 1)}
          >
            {t('speed.audit.previous')}
          </button>
          <span>{t('speed.audit.page', { page: page.page, pages, total: page.total })}</span>
          <button
            type="button"
            className={button}
            disabled={page.page >= pages}
            onClick={() => on.page(page.page + 1)}
          >
            {t('speed.audit.next')}
          </button>
        </div>
      ) : null}
    </section>
  );
}

/** The date inputs as a UTC range: from the start of the first day to the end of the last. */
export function dayRange(filters: AuditFilters): AuditFilters {
  return {
    ...filters,
    ...(filters.from ? { from: `${filters.from}T00:00:00Z` } : {}),
    ...(filters.to ? { to: `${filters.to}T23:59:59.999Z` } : {}),
  };
}

const PAGE_SIZE = 50;

/** The page `/speed/audit`. */
export function AuditTrailPage() {
  const t = useSpeedText();
  const api = useSpeedApi();
  const [draft, setDraft] = useState<AuditFilters>({});
  const [applied, setApplied] = useState<AuditFilters>({});
  const [pageNumber, setPageNumber] = useState(1);
  const [page, setPage] = useState<SpeedAuditPageV1 | null>(null);
  const [routes, setRoutes] = useState<SpeedRouteV1[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    api.routeOptions().then(setRoutes, () => setRoutes([]));
    // The workspace's members, for the user filter and the names in the table.
    fetch(`${MEMBERS_LOOKUP}?limit=200`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    })
      .then((response): Promise<LookupBody> | LookupBody =>
        response.ok ? (response.json() as Promise<LookupBody>) : {},
      )
      .then(
        (body: LookupBody) =>
          setNames((current) => ({
            ...Object.fromEntries((body.items ?? []).map((item) => [item.value, item.label])),
            ...current,
          })),
        () => undefined,
      );
  }, [api]);
  const load = useCallback(async () => {
    setNotice(null);
    try {
      const loaded = await api.auditEvents(dayRange(applied), pageNumber, PAGE_SIZE);
      setPage(loaded);
      // Only workspace members go to the member lookup; it refuses SPEED's own `system:` actors.
      const subjects = [...new Set(loaded.items.map((entry) => entry.actor))].filter(
        (subject) => !(subject in names) && !isSystemActor(subject),
      );
      if (subjects.length) {
        const response = await fetch(
          `${MEMBERS_LOOKUP}?ids=${subjects.map(encodeURIComponent).join(',')}`,
          {
            headers: { Accept: 'application/json' },
            cache: 'no-store',
          },
        );
        const body = response.ok
          ? ((await response.json()) as { items?: { value: string; label: string }[] })
          : {};
        setNames((current) => ({
          ...current,
          ...Object.fromEntries((body.items ?? []).map((item) => [item.value, item.label])),
        }));
      }
    } catch (error) {
      setPage(null);
      setNotice(error instanceof SpeedApiError ? error.code : 'SPEED_REQUEST_FAILED');
    }
  }, [api, applied, pageNumber, names]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reload when the applied filters or the page change.
  useEffect(() => {
    void load();
  }, [applied, pageNumber]);

  return (
    <AuditTrailView
      page={page}
      routes={routes}
      names={names}
      draft={draft}
      applied={applied}
      notice={notice}
      t={t}
      on={{
        draft: setDraft,
        apply: () => {
          setPageNumber(1);
          setApplied(draft);
        },
        clear: () => {
          setDraft({});
          setPageNumber(1);
          setApplied({});
        },
        page: setPageNumber,
      }}
    />
  );
}
