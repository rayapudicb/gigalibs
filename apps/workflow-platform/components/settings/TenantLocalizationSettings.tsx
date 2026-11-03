'use client';

import { LanguageSelector, useTranslation } from '@/components/i18n';
import {
  GENERATED_COUNTRIES,
  GENERATED_CURRENCIES,
  GENERATED_TIME_ZONES,
} from '@gigalibs/contracts';
import { plainRequestError } from '@gigalibs/web-sdk';
import { CheckCircle2, Globe } from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';

// WI-OI-153 slice B (ADR-0038 §2, §5): the workspace profile — country, language, time zone, base currency, first day
// of the week and fiscal year start — read from and saved to the workspace's own settings (versioned), instead of a
// screen that kept time zone and currency in memory and saved the language for the signed-in person only.

export interface TenantLocalizationSettingsProps {
  tenantId: string;
  canUpdate?: boolean;
}

interface Localization {
  readonly defaultLocale: string;
  readonly defaultCurrency: string;
  readonly timezone: string;
  readonly dateFormat: string;
  readonly countryCode?: string;
  readonly weekStart?: number;
  readonly fiscalYearStartMonth?: number;
}

type State =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'ready'; readonly version: number; readonly saved: Localization };

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const field =
  'block w-full max-w-md rounded-md border border-ui-border-base bg-ui-bg-field px-3 py-2 text-sm text-ui-fg-base shadow-xs focus:border-ui-border-interactive focus:outline-none disabled:opacity-60';

/** What the runtime knows of a country: its time zones and first day of the week (suggestions only). */
export function countrySuggestions(countryCode: string): {
  timeZones: string[];
  weekStart?: number;
} {
  try {
    const locale = new Intl.Locale(`und-${countryCode}`).maximize() as Intl.Locale & {
      getTimeZones?: () => string[];
      timeZones?: string[];
      getWeekInfo?: () => { firstDay: number };
      weekInfo?: { firstDay: number };
    };
    const timeZones = locale.getTimeZones?.() ?? locale.timeZones ?? [];
    const week = locale.getWeekInfo?.() ?? locale.weekInfo;
    return { timeZones, ...(week ? { weekStart: week.firstDay } : {}) };
  } catch {
    return { timeZones: [] };
  }
}

/** The settings update a save sends: the profile fields, against the version the screen read (a clash is 409). */
export function localizationPatch(draft: Localization, expectedVersion: number) {
  return {
    expectedVersion,
    localization: {
      defaultLocale: draft.defaultLocale,
      defaultCurrency: draft.defaultCurrency,
      timezone: draft.timezone,
      ...(draft.countryCode ? { countryCode: draft.countryCode } : {}),
      ...(draft.weekStart ? { weekStart: draft.weekStart } : {}),
      ...(draft.fiscalYearStartMonth ? { fiscalYearStartMonth: draft.fiscalYearStartMonth } : {}),
    },
  };
}

export function TenantLocalizationSettings({
  canUpdate = true,
}: TenantLocalizationSettingsProps): React.JSX.Element {
  const { t } = useTranslation('settings');
  const [state, setState] = useState<State>({ status: 'loading' });
  const [draft, setDraft] = useState<Localization | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'saved' | 'error'; text: string } | null>(null);

  async function load() {
    setState({ status: 'loading' });
    try {
      const response = await fetch('/api/control/settings', { cache: 'no-store' });
      const body = (await response.json().catch(() => null)) as {
        version?: number;
        localization?: Localization;
        detail?: string;
      } | null;
      if (!response.ok || !body?.localization || typeof body.version !== 'number') {
        setState({ status: 'error', message: plainRequestError(response.status, body?.detail) });
        return;
      }
      setState({ status: 'ready', version: body.version, saved: body.localization });
      setDraft(body.localization);
    } catch {
      setState({
        status: 'error',
        message: 'The workspace settings could not be loaded. Try again.',
      });
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: loaded once when the screen opens.
  useEffect(() => {
    void load();
  }, []);

  if (state.status === 'error')
    return (
      <div className="rounded-xl border border-ui-border-base bg-ui-bg-base p-6 text-sm text-ui-fg-error">
        {state.message}
      </div>
    );
  if (state.status === 'loading' || !draft)
    return (
      <div className="rounded-xl border border-ui-border-base bg-ui-bg-base p-6 text-sm text-ui-fg-muted">
        Loading the workspace settings…
      </div>
    );

  const set = (patch: Partial<Localization>) =>
    setDraft((current) => (current ? { ...current, ...patch } : current));
  const chooseCountry = (countryCode: string) => {
    if (!countryCode) return set({ countryCode: undefined });
    const suggestion = countrySuggestions(countryCode);
    set({
      countryCode,
      ...(suggestion.timeZones.length === 1 ? { timezone: suggestion.timeZones[0] } : {}),
      ...(suggestion.weekStart ? { weekStart: suggestion.weekStart } : {}),
    });
  };
  const zones: readonly string[] = GENERATED_TIME_ZONES.entries.map((entry) => entry.code);
  const zoneOptions = zones.includes(draft.timezone) ? zones : [draft.timezone, ...zones];
  const suggestedZones = draft.countryCode ? countrySuggestions(draft.countryCode).timeZones : [];

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!draft || state.status !== 'ready') return;
    setSaving(true);
    setNotice(null);
    try {
      const response = await fetch('/api/control/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(localizationPatch(draft, state.version)),
      });
      const body = (await response.json().catch(() => null)) as {
        version?: number;
        localization?: Localization;
        detail?: string;
        message?: string;
      } | null;
      if (response.status === 409) {
        setNotice({
          kind: 'error',
          text: 'Someone else changed these settings. Reload to see their change, then save again.',
        });
        return;
      }
      if (!response.ok || !body?.localization || typeof body.version !== 'number') {
        setNotice({
          kind: 'error',
          text: plainRequestError(response.status, body?.detail ?? body?.message),
        });
        return;
      }
      setState({ status: 'ready', version: body.version, saved: body.localization });
      setDraft(body.localization);
      setNotice({ kind: 'saved', text: t('savedSuccess') });
    } catch {
      setNotice({ kind: 'error', text: 'The settings could not be saved. Try again.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-ui-border-base bg-ui-bg-base p-6 shadow-xs">
      <div className="flex items-center gap-3 border-b border-ui-border-base pb-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-ui-bg-subtle text-ui-fg-subtle">
          <Globe className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-ui-fg-base">{t('localization')}</h2>
          <p className="text-xs text-ui-fg-muted">
            The workspace's country, language, time zone and money settings. Modules use them as
            their defaults.
          </p>
        </div>
      </div>

      <form onSubmit={save} className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
        <label className="space-y-1.5 text-xs font-semibold text-ui-fg-base">
          Country
          <span className="block text-[11px] font-normal text-ui-fg-muted">
            Suggests the time zone and week, and later chooses the country pack (taxes, holidays,
            chart of accounts).
          </span>
          <select
            className={field}
            value={draft.countryCode ?? ''}
            disabled={!canUpdate}
            onChange={(event) => chooseCountry(event.target.value)}
          >
            <option value="">Not set</option>
            {GENERATED_COUNTRIES.entries.map((entry) => (
              <option key={entry.code} value={entry.code}>
                {entry.name}
              </option>
            ))}
          </select>
        </label>

        <div className="space-y-1.5">
          <label
            htmlFor="tenant-default-locale"
            className="block text-xs font-semibold text-ui-fg-base"
          >
            {t('tenantLanguage')}
          </label>
          <p className="text-[11px] text-ui-fg-muted">{t('tenantLanguageDesc')}</p>
          <LanguageSelector
            id="tenant-default-locale"
            value={draft.defaultLocale}
            onChange={(defaultLocale) => set({ defaultLocale })}
            disabled={!canUpdate}
            showDirectionBadge={true}
            className="w-full max-w-md"
          />
        </div>

        <label className="space-y-1.5 text-xs font-semibold text-ui-fg-base">
          {t('timezone')}
          <span className="block text-[11px] font-normal text-ui-fg-muted">
            Used for schedules, shift times, audit timestamps and report deliveries.
            {suggestedZones.length > 1
              ? ` This country has ${suggestedZones.length} time zones; choose the main one.`
              : ''}
          </span>
          <select
            className={field}
            value={draft.timezone}
            disabled={!canUpdate}
            onChange={(event) => set({ timezone: event.target.value })}
          >
            {zoneOptions.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1.5 text-xs font-semibold text-ui-fg-base">
          {t('currency')}
          <span className="block text-[11px] font-normal text-ui-fg-muted">
            The currency the books are kept in; new documents start with it.
          </span>
          <select
            className={field}
            value={draft.defaultCurrency}
            disabled={!canUpdate}
            onChange={(event) => set({ defaultCurrency: event.target.value })}
          >
            {GENERATED_CURRENCIES.entries.map((entry) => (
              <option key={entry.code} value={entry.code}>
                {entry.code} — {entry.name}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1.5 text-xs font-semibold text-ui-fg-base">
          Week starts on
          <select
            className={field}
            value={draft.weekStart ?? ''}
            disabled={!canUpdate}
            onChange={(event) =>
              set({ weekStart: event.target.value ? Number(event.target.value) : undefined })
            }
          >
            <option value="">Not set</option>
            {WEEKDAYS.map((day, index) => (
              <option key={day} value={index + 1}>
                {day}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1.5 text-xs font-semibold text-ui-fg-base">
          Fiscal year starts in
          <select
            className={field}
            value={draft.fiscalYearStartMonth ?? ''}
            disabled={!canUpdate}
            onChange={(event) =>
              set({
                fiscalYearStartMonth: event.target.value ? Number(event.target.value) : undefined,
              })
            }
          >
            <option value="">Not set</option>
            {MONTHS.map((month, index) => (
              <option key={month} value={index + 1}>
                {month}
              </option>
            ))}
          </select>
        </label>

        {canUpdate ? (
          <div className="flex items-center gap-3 md:col-span-2">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center rounded-lg bg-ui-button-inverted px-4 py-2 text-xs font-semibold text-ui-fg-on-inverted shadow-xs transition-colors hover:bg-ui-button-inverted-hover disabled:opacity-50"
            >
              {saving ? 'Saving…' : t('saveChanges')}
            </button>
            {notice ? (
              <span
                role={notice.kind === 'error' ? 'alert' : 'status'}
                className={`inline-flex items-center gap-1.5 text-xs font-medium ${notice.kind === 'saved' ? 'text-ui-tag-green-text' : 'text-ui-fg-error'}`}
              >
                {notice.kind === 'saved' ? <CheckCircle2 className="h-4 w-4" /> : null}
                {notice.text}
              </span>
            ) : null}
          </div>
        ) : null}
      </form>
    </div>
  );
}
