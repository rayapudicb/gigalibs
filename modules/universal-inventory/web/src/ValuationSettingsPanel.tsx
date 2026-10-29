'use client';

import type { OrgValuationSettingV1 } from '@gigalibs/contracts';
import { type FormEvent, useState } from 'react';

const BASE = '/api/universal-inventory/v1/valuation-settings';
const METHOD_LABELS = {
  STANDARD: 'Standard cost',
  FIFO: 'FIFO',
  MOVING_AVERAGE: 'Weighted average',
} as const;

async function parseResponse(response: Response): Promise<OrgValuationSettingV1> {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body && typeof body === 'object' && 'message' in body
      ? String((body as { message: unknown }).message) : `Valuation setting request failed (${response.status}).`;
    throw new Error(message);
  }
  return body as OrgValuationSettingV1;
}

export function ValuationSettingsPanel() {
  const [orgUnitId, setOrgUnitId] = useState('');
  const [method, setMethod] = useState<keyof typeof METHOD_LABELS>('STANDARD');
  const [financeCostProfileId, setFinanceCostProfileId] = useState('');
  const [setting, setSetting] = useState<OrgValuationSettingV1 | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    if (!orgUnitId.trim()) return;
    setBusy(true); setError(null); setMessage(null); setSetting(null);
    try {
      const response = await fetch(`${BASE}?orgUnitId=${encodeURIComponent(orgUnitId.trim())}`, {
        credentials: 'include', cache: 'no-store',
      });
      const value = await parseResponse(response);
      setSetting(value);
      setMethod(value.valuationMethod);
      setFinanceCostProfileId(value.financeCostProfileId ?? '');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the valuation setting.');
    } finally { setBusy(false); }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(null); setMessage(null);
    try {
      const response = await fetch(BASE, {
        method: 'PUT', credentials: 'include', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          orgUnitId: orgUnitId.trim(), valuationMethod: method,
          financeCostProfileId: financeCostProfileId.trim(),
        }),
      });
      const value = await parseResponse(response);
      setSetting(value);
      setMessage(`Saved for organization ${value.orgUnitId}. New receipts use this Finance profile.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the valuation setting.');
    } finally { setBusy(false); }
  }

  const inputClass = 'w-full rounded-md border border-ui-border-base bg-ui-bg-field px-3 py-2 text-ui-fg-base';
  return (
    <section className="max-w-xl space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-ui-fg-base">Organization valuation</h2>
        <p className="text-sm text-ui-fg-subtle">Assign an active Finance cost profile to the owning organization. Finance checks that its method matches before posting each receipt.</p>
      </div>
      <form className="space-y-4" onSubmit={(event) => void save(event)}>
        <label className="block text-sm text-ui-fg-subtle">Organization unit ID
          <input className={inputClass} value={orgUnitId} onChange={(event) => { setOrgUnitId(event.target.value); setSetting(null); }} required maxLength={64} />
        </label>
        <button type="button" disabled={busy || !orgUnitId.trim()} onClick={() => void load()} className="rounded-md border border-ui-border-base px-3 py-2 text-sm text-ui-fg-base disabled:opacity-50">Load current setting</button>
        <label className="block text-sm text-ui-fg-subtle">Valuation method
          <select className={inputClass} value={method} onChange={(event) => setMethod(event.target.value as keyof typeof METHOD_LABELS)}>
            {Object.entries(METHOD_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="block text-sm text-ui-fg-subtle">Finance cost profile ID
          <input className={inputClass} value={financeCostProfileId} onChange={(event) => setFinanceCostProfileId(event.target.value)} required aria-describedby="finance-profile-help" />
        </label>
        <p id="finance-profile-help" className="text-xs text-ui-fg-subtle">Use the ID of an active cost profile in Finance with the same method. Receipts stop before stock posting when this mapping is absent.</p>
        {error ? <p role="alert" className="text-sm text-ui-fg-error">{error}</p> : null}
        {message ? <p role="status" className="text-sm text-ui-fg-base">{message}</p> : null}
        <button type="submit" disabled={busy} className="rounded-md bg-ui-button-inverted px-4 py-2 text-sm font-medium text-ui-fg-on-inverted disabled:opacity-50">{busy ? 'Saving…' : 'Save valuation setting'}</button>
      </form>
      {setting ? <p className="text-xs text-ui-fg-subtle">Last updated by {setting.updatedBy} on {new Date(setting.updatedAt).toLocaleString()}.</p> : null}
    </section>
  );
}
