'use client';

import type { SetupResponse } from '@/lib/api-types';
import { ApiError, humanError, newIdempotencyKey, requestJson } from '@/lib/browser-api';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { LoadingState } from './feedback';
import { BillingEntitySettings, SeriesSettings } from './settings';

// ─── Wizard (first-time setup) ────────────────────────────────────────────────

function SetupWizard({ onComplete }: { onComplete: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    const data = new FormData(event.currentTarget);
    try {
      await requestJson<SetupResponse>('v1/setup', {
        method: 'POST',
        headers: { 'idempotency-key': newIdempotencyKey() },
        body: JSON.stringify({
          legalName: data.get('legalName'),
          ...(String(data.get('legalIdentifier') ?? '').trim()
            ? { legalIdentifier: data.get('legalIdentifier') }
            : {}),
          defaultCurrency: String(data.get('defaultCurrency')).toUpperCase(),
          locale: data.get('locale'),
          timeZone: data.get('timeZone'),
          invoiceSeriesCode: String(data.get('invoiceSeriesCode')).toUpperCase(),
          invoicePrefix: String(data.get('invoicePrefix')).toUpperCase(),
          invoicePadding: Number(data.get('invoicePadding')),
        }),
      });
      onComplete();
    } catch (caught) {
      setError(humanError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">First-time setup</p>
        <h1>Configure accounts receivable</h1>
        <p>
          Create the legal billing entity and first invoice number series for this tenant.
          These values can be updated at any time after setup.
        </p>
      </div>
      {error ? (
        <div className="notice error" role="alert">{error}</div>
      ) : null}
      <form className="panel form-stack" onSubmit={submit}>
        <fieldset disabled={busy}>
          <legend>Legal billing identity</legend>
          <div className="form-grid">
            <label className="wide">
              Legal name
              <input name="legalName" required minLength={1} maxLength={200} autoComplete="organization" />
            </label>
            <label>
              Legal identifier <span className="optional">Optional</span>
              <input name="legalIdentifier" maxLength={100} />
            </label>
            <label>
              Default currency
              <input name="defaultCurrency" required defaultValue="USD" pattern="[A-Za-z]{3}" maxLength={3} />
            </label>
            <label>
              Locale
              <input name="locale" required defaultValue="en-US" maxLength={35} />
            </label>
            <label>
              Time zone
              <input name="timeZone" required defaultValue="UTC" maxLength={100} />
            </label>
          </div>
        </fieldset>
        <fieldset disabled={busy}>
          <legend>Invoice numbering</legend>
          <div className="form-grid">
            <label>
              Series code
              <input name="invoiceSeriesCode" required defaultValue="STANDARD" pattern="[A-Za-z0-9_-]{1,40}" />
            </label>
            <label>
              Document prefix
              <input name="invoicePrefix" defaultValue="INV-" pattern="[A-Za-z0-9-]{0,20}" />
            </label>
            <label>
              Number padding
              <input name="invoicePadding" required type="number" min={1} max={12} defaultValue={6} />
            </label>
          </div>
        </fieldset>
        <div className="form-actions">
          <button className="button primary" type="submit" disabled={busy}>
            {busy ? 'Configuring…' : 'Configure workspace'}
          </button>
        </div>
      </form>
    </>
  );
}

// ─── Shell — detects setup state, routes to wizard or settings ───────────────

export function SetupForm() {
  const [state, setState] = useState<'loading' | 'needs-setup' | 'configured'>('loading');

  const checkSetup = useCallback(async () => {
    setState('loading');
    try {
      await requestJson('v1/billing-entity');
      setState('configured');
    } catch (caught) {
      // 400 domain error BILLING_ENTITY_NOT_FOUND → first run
      if (caught instanceof ApiError && caught.status === 400) {
        setState('needs-setup');
      } else {
        // Any other error (auth, 500) — still show wizard so user isn't stuck
        setState('needs-setup');
      }
    }
  }, []);

  useEffect(() => {
    void checkSetup();
  }, [checkSetup]);

  if (state === 'loading') return <LoadingState label="Checking workspace…" />;

  if (state === 'needs-setup') {
    return <SetupWizard onComplete={() => setState('configured')} />;
  }

  // Configured — show full settings
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">Workspace settings</p>
        <h1>Accounts receivable settings</h1>
        <p>Manage your billing identity, localization, bank details, and invoice series.</p>
      </div>
      <BillingEntitySettings />
      <SeriesSettings />
    </>
  );
}
