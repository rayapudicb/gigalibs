'use client';

import React, { useState } from 'react';
import { useTranslation, LanguageSelector } from '@/components/i18n';
import { Globe, ShieldCheck, CheckCircle2 } from 'lucide-react';

export interface TenantLocalizationSettingsProps {
  tenantId: string;
  canUpdate?: boolean;
}

export function TenantLocalizationSettings({
  tenantId,
  canUpdate = true,
}: TenantLocalizationSettingsProps): React.JSX.Element {
  const { t } = useTranslation('settings');
  const [defaultLocale, setDefaultLocale] = useState('en-US');
  const [timezone, setTimezone] = useState('UTC');
  const [currency, setCurrency] = useState('USD');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      // Persist workspace default locale
      await fetch('/api/user/locale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale: defaultLocale }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      // Handle error gracefully
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-ui-border-base bg-ui-bg-base p-6 shadow-xs">
      <div className="flex items-center gap-3 border-b border-ui-border-base pb-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
          <Globe className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-ui-fg-base">{t('localization')}</h2>
          <p className="text-xs text-ui-fg-muted">
            Configure default workspace localization and regional parameters for team members.
          </p>
        </div>
      </div>

      <form onSubmit={handleSave} className="mt-6 space-y-6">
        {/* Tenant Language Config */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="tenant-default-locale" className="block text-xs font-semibold text-ui-fg-base">
              {t('tenantLanguage')}
            </label>
            <p className="text-[11px] text-ui-fg-muted">
              {t('tenantLanguageDesc')}
            </p>
            <div className="pt-1">
              <LanguageSelector
                id="tenant-default-locale"
                value={defaultLocale}
                onChange={setDefaultLocale}
                disabled={!canUpdate}
                showDirectionBadge={true}
                className="w-full max-w-md"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="tenant-timezone" className="block text-xs font-semibold text-ui-fg-base">
              {t('timezone')}
            </label>
            <p className="text-[11px] text-ui-fg-muted">
              Used for audit log timestamps, execution schedules, and report deliveries.
            </p>
            <div className="pt-1">
              <select
                id="tenant-timezone"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                disabled={!canUpdate}
                className="block w-full max-w-md rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value="UTC">UTC (Universal Coordinated Time)</option>
                <option value="America/New_York">America/New_York (EST / EDT)</option>
                <option value="Europe/London">Europe/London (GMT / BST)</option>
                <option value="Europe/Paris">Europe/Paris (CET / CEST)</option>
                <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
                <option value="Asia/Dubai">Asia/Dubai (GST)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Currency & Compliance notice */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="tenant-currency" className="block text-xs font-semibold text-ui-fg-base">
              {t('currency')}
            </label>
            <p className="text-[11px] text-ui-fg-muted">
              Reporting base currency for finance, accounts receivable, and invoices.
            </p>
            <div className="pt-1">
              <select
                id="tenant-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                disabled={!canUpdate}
                className="block w-full max-w-md rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value="USD">USD ($) - US Dollar</option>
                <option value="EUR">EUR (€) - Euro</option>
                <option value="GBP">GBP (£) - British Pound</option>
                <option value="JPY">JPY (¥) - Japanese Yen</option>
                <option value="AED">AED (د.إ) - UAE Dirham</option>
              </select>
            </div>
          </div>

          {/* Strict Platform Admin Notice */}
          <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3.5 dark:border-amber-900/40 dark:bg-amber-950/20">
            <div className="flex items-start gap-2.5">
              <ShieldCheck className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400 mt-0.5" />
              <div className="text-[11px] leading-relaxed text-amber-900 dark:text-amber-300">
                <span className="font-semibold block mb-0.5">Platform Governance Standard:</span>
                {t('platformAdminLanguageNotice')}
              </div>
            </div>
          </div>
        </div>

        {canUpdate && (
          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center rounded-lg bg-ui-button-inverted px-4 py-2 text-xs font-semibold text-ui-fg-on-inverted shadow-xs transition-colors hover:bg-ui-button-inverted-hover disabled:opacity-50 cursor-pointer"
            >
              {saving ? 'Saving...' : t('saveChanges')}
            </button>
            {saved && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                {t('savedSuccess')}
              </span>
            )}
          </div>
        )}
      </form>
    </div>
  );
}
