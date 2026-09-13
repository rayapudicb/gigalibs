'use client';

import type { BillingEntity, InvoiceSeries } from '@/lib/api-types';
import { humanError, newIdempotencyKey, requestJson } from '@/lib/browser-api';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { ErrorState, LoadingState } from './feedback';

// ─── Currency / locale helpers ─────────────────────────────────────────────
const CURRENCIES = ['USD', 'EUR', 'GBP', 'AUD', 'CAD', 'INR', 'SGD', 'AED', 'JPY', 'CHF'];
const TAX_ID_TYPES = [
  { value: 'VAT', label: 'VAT Number' },
  { value: 'GST', label: 'GST Number' },
  { value: 'EIN', label: 'EIN (US)' },
  { value: 'ABN', label: 'ABN (AU)' },
  { value: 'GSTIN', label: 'GSTIN (IN)' },
  { value: 'OTHER', label: 'Other' },
];

// ─── Billing Entity Settings ──────────────────────────────────────────────────

export function BillingEntitySettings() {
  const [entity, setEntity] = useState<BillingEntity>();
  const [error, setError] = useState<string>();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();

  const load = useCallback(async () => {
    setError(undefined);
    try {
      const e = await requestJson<BillingEntity>('v1/billing-entity');
      setEntity(e);
    } catch (caught) {
      setError(humanError(caught));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setSaveError(undefined);
    const data = new FormData(event.currentTarget);

    function opt(key: string): string | undefined {
      const v = String(data.get(key) ?? '').trim();
      return v || undefined;
    }

    const body: Record<string, unknown> = {
      legalName: data.get('legalName'),
      defaultCurrency: String(data.get('defaultCurrency')).toUpperCase(),
      locale: data.get('locale'),
      timeZone: data.get('timeZone'),
    };

    // Nullish-able fields
    for (const k of ['legalIdentifier', 'tradingName', 'registrationNumber', 'taxId', 'phone', 'email', 'emailReplyTo', 'website', 'logoUrl', 'invoiceFooterText']) {
      const v = opt(k);
      body[k] = v ?? null;
    }
    if (opt('taxId')) body.taxIdType = opt('taxIdType') ?? null;
    else body.taxIdType = null;

    const paymentTerms = opt('defaultPaymentTermsDays');
    if (paymentTerms) body.defaultPaymentTermsDays = Number(paymentTerms);

    const lateFee = opt('lateFeesBasisPoints');
    if (lateFee !== undefined) body.lateFeesBasisPoints = Number(lateFee);

    // Address
    const addrLine1 = opt('addr_line1');
    const addrCity = opt('addr_city');
    if (addrLine1 || addrCity) {
      body.address = {
        line1: opt('addr_line1'),
        city: opt('addr_city'),
        state: opt('addr_state'),
        postalCode: opt('addr_postal'),
        country: opt('addr_country') || undefined,
      };
    } else {
      body.address = null;
    }

    // Bank details
    const bankName = opt('bank_name');
    if (bankName) {
      body.bankDetails = {
        bankName: opt('bank_name'),
        accountName: opt('bank_acct_name'),
        accountNumber: opt('bank_acct_number'),
        routingNumber: opt('bank_routing'),
        iban: opt('bank_iban'),
        swiftBic: opt('bank_swift'),
        sortCode: opt('bank_sort'),
        bsb: opt('bank_bsb'),
      };
    } else {
      body.bankDetails = null;
    }

    try {
      const updated = await requestJson<BillingEntity>('v1/billing-entity', {
        method: 'PUT',
        headers: { 'if-match': `"${entity?.version}"` },
        body: JSON.stringify(body),
      });
      setEntity(updated);
      setEditing(false);
    } catch (caught) {
      setSaveError(humanError(caught));
    } finally {
      setSaving(false);
    }
  }

  if (!entity && !error) return <LoadingState label="Loading billing entity…" />;
  if (error) return <ErrorState message={error} retry={() => void load()} />;
  if (!entity) return null;

  const addr = entity.address;
  const bank = entity.bankDetails;

  return (
    <>
      <div className="section-heading split">
        <h2>Legal billing identity</h2>
        <button
          className="button secondary small"
          type="button"
          onClick={() => setEditing((v) => !v)}
        >
          {editing ? 'Cancel' : 'Edit'}
        </button>
      </div>

      {saveError ? <p className="notice error">{saveError}</p> : null}

      {editing ? (
        <form className="panel compact-form" onSubmit={handleUpdate}>
          {/* ── Basic ── */}
          <div className="form-section-label">Legal identity</div>
          <div className="form-grid">
            <label>
              Legal name
              <input name="legalName" required maxLength={200} defaultValue={entity.legalName} />
            </label>
            <label>
              Trading name <span className="optional">Optional</span>
              <input name="tradingName" maxLength={200} defaultValue={entity.tradingName ?? ''} />
            </label>
            <label>
              Legal identifier <span className="optional">Optional</span>
              <input name="legalIdentifier" maxLength={100} defaultValue={entity.legalIdentifier ?? ''} />
            </label>
            <label>
              Registration number <span className="optional">Optional</span>
              <input name="registrationNumber" maxLength={100} defaultValue={entity.registrationNumber ?? ''} />
            </label>
            <label>
              Tax ID type <span className="optional">Optional</span>
              <select name="taxIdType" defaultValue={entity.taxIdType ?? ''}>
                <option value="">— None —</option>
                {TAX_ID_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </label>
            <label>
              Tax ID <span className="optional">Optional</span>
              <input name="taxId" maxLength={50} defaultValue={entity.taxId ?? ''} />
            </label>
          </div>

          {/* ── Localisation ── */}
          <div className="form-section-label">Localisation</div>
          <div className="form-grid">
            <label>
              Default currency
              <select name="defaultCurrency" defaultValue={entity.defaultCurrency}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label>
              Locale
              <input name="locale" required maxLength={35} defaultValue={entity.locale} />
            </label>
            <label>
              Time zone
              <input name="timeZone" required maxLength={100} defaultValue={entity.timeZone} />
            </label>
            <label>
              Default payment terms (days)
              <input
                name="defaultPaymentTermsDays"
                type="number" min={0} max={365}
                defaultValue={entity.defaultPaymentTermsDays}
              />
            </label>
            <label>
              Late fees (basis points) <span className="optional">0 = disabled</span>
              <input
                name="lateFeesBasisPoints"
                type="number" min={0} max={5000}
                defaultValue={entity.lateFeesBasisPoints}
              />
            </label>
          </div>

          {/* ── Contact ── */}
          <div className="form-section-label">Contact</div>
          <div className="form-grid">
            <label>
              Email <span className="optional">Optional</span>
              <input name="email" type="email" maxLength={320} defaultValue={entity.email ?? ''} />
            </label>
            <label>
              Reply-to email <span className="optional">Optional</span>
              <input name="emailReplyTo" type="email" maxLength={320} defaultValue={entity.emailReplyTo ?? ''} />
            </label>
            <label>
              Phone <span className="optional">Optional</span>
              <input name="phone" type="tel" maxLength={50} defaultValue={entity.phone ?? ''} />
            </label>
            <label>
              Website <span className="optional">Optional</span>
              <input name="website" maxLength={500} defaultValue={entity.website ?? ''} />
            </label>
            <label>
              Logo URL <span className="optional">Optional</span>
              <input name="logoUrl" maxLength={500} defaultValue={entity.logoUrl ?? ''} />
            </label>
          </div>

          {/* ── Address ── */}
          <div className="form-section-label">Business address</div>
          <div className="form-grid">
            <label className="wide">
              Address line 1
              <input name="addr_line1" maxLength={200} defaultValue={addr?.line1 ?? ''} />
            </label>
            <label>City<input name="addr_city" maxLength={100} defaultValue={addr?.city ?? ''} /></label>
            <label>State / region<input name="addr_state" maxLength={100} defaultValue={addr?.state ?? ''} /></label>
            <label>Postal code<input name="addr_postal" maxLength={20} defaultValue={addr?.postalCode ?? ''} /></label>
            <label>
              Country (ISO 2-letter)
              <input name="addr_country" maxLength={2} pattern="[A-Za-z]{2}" placeholder="US" defaultValue={addr?.country ?? ''} />
            </label>
          </div>

          {/* ── Bank ── */}
          <div className="form-section-label">Bank details <span className="optional">Appears on invoices</span></div>
          <div className="form-grid">
            <label>Bank name<input name="bank_name" maxLength={200} defaultValue={bank?.bankName ?? ''} /></label>
            <label>Account name<input name="bank_acct_name" maxLength={200} defaultValue={bank?.accountName ?? ''} /></label>
            <label>Account number<input name="bank_acct_number" maxLength={50} defaultValue={bank?.accountNumber ?? ''} /></label>
            <label>Routing number<input name="bank_routing" maxLength={50} defaultValue={bank?.routingNumber ?? ''} /></label>
            <label>IBAN<input name="bank_iban" maxLength={50} defaultValue={bank?.iban ?? ''} /></label>
            <label>SWIFT / BIC<input name="bank_swift" maxLength={20} defaultValue={bank?.swiftBic ?? ''} /></label>
            <label>Sort code<input name="bank_sort" maxLength={20} defaultValue={bank?.sortCode ?? ''} /></label>
            <label>BSB (AU)<input name="bank_bsb" maxLength={20} defaultValue={bank?.bsb ?? ''} /></label>
          </div>

          {/* ── Invoice footer ── */}
          <div className="form-section-label">Invoice footer</div>
          <label>
            Footer text <span className="optional">Shown at the bottom of every invoice</span>
            <textarea name="invoiceFooterText" maxLength={2000} rows={3} defaultValue={entity.invoiceFooterText ?? ''} />
          </label>

          <div className="form-actions">
            <button className="button secondary" type="button" onClick={() => setEditing(false)}>Cancel</button>
            <button className="button primary" type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      ) : (
        <div className="panel detail-card">
          <dl className="detail-grid">
            <dt>Legal name</dt><dd>{entity.legalName}</dd>
            {entity.tradingName ? <><dt>Trading name</dt><dd>{entity.tradingName}</dd></> : null}
            {entity.legalIdentifier ? <><dt>Legal identifier</dt><dd>{entity.legalIdentifier}</dd></> : null}
            {entity.registrationNumber ? <><dt>Registration no.</dt><dd>{entity.registrationNumber}</dd></> : null}
            {entity.taxId ? (
              <><dt>Tax ID</dt><dd><span className="label-dim">{entity.taxIdType ?? 'ID'}</span> {entity.taxId}</dd></>
            ) : null}
            <dt>Currency</dt><dd>{entity.defaultCurrency}</dd>
            <dt>Locale</dt><dd>{entity.locale}</dd>
            <dt>Time zone</dt><dd>{entity.timeZone}</dd>
            <dt>Payment terms</dt><dd>Net {entity.defaultPaymentTermsDays} days</dd>
            {entity.lateFeesBasisPoints > 0 ? (
              <><dt>Late fees</dt><dd>{entity.lateFeesBasisPoints} bps</dd></>
            ) : null}
            {entity.email ? <><dt>Email</dt><dd>{entity.email}</dd></> : null}
            {entity.phone ? <><dt>Phone</dt><dd>{entity.phone}</dd></> : null}
            {entity.website ? (
              <><dt>Website</dt><dd><a href={entity.website} target="_blank" rel="noopener noreferrer">{entity.website}</a></dd></>
            ) : null}
            {addr ? (
              <><dt>Address</dt><dd>{[addr.line1, addr.city, addr.state, addr.postalCode, addr.country].filter(Boolean).join(', ')}</dd></>
            ) : null}
            {bank?.bankName ? (
              <><dt>Bank</dt><dd>{bank.bankName}{bank.iban ? ` · IBAN ${bank.iban}` : ''}{bank.swiftBic ? ` · BIC ${bank.swiftBic}` : ''}</dd></>
            ) : null}
            {entity.invoiceFooterText ? (
              <><dt>Footer</dt><dd className="notes-cell">{entity.invoiceFooterText}</dd></>
            ) : null}
            <dt>Version</dt><dd className="dim">v{entity.version}</dd>
          </dl>
        </div>
      )}
    </>
  );
}

// ─── Series Settings ──────────────────────────────────────────────────────────

export function SeriesSettings() {
  const [series, setSeries] = useState<InvoiceSeries[]>();
  const [error, setError] = useState<string>();
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string>();
  const [editVersion, setEditVersion] = useState<number>();

  const load = useCallback(async () => {
    setError(undefined);
    try {
      const result = await requestJson<{ items: InvoiceSeries[] }>('v1/series');
      setSeries(result.items);
    } catch (caught) {
      setError(humanError(caught));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setActionError(undefined);
    const data = new FormData(event.currentTarget);
    try {
      await requestJson<InvoiceSeries>('v1/series', {
        method: 'POST',
        headers: { 'idempotency-key': newIdempotencyKey() },
        body: JSON.stringify({
          code: String(data.get('code')).toUpperCase(),
          prefix: String(data.get('prefix')).toUpperCase(),
          padding: Number(data.get('padding')),
          isDefault: data.get('isDefault') === 'on',
        }),
      });
      event.currentTarget.reset();
      setShowForm(false);
      await load();
    } catch (caught) {
      setActionError(humanError(caught));
    } finally {
      setCreating(false);
    }
  }

  async function handleUpdate(id: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError(undefined);
    const data = new FormData(event.currentTarget);
    try {
      await requestJson<InvoiceSeries>(`v1/series/${id}`, {
        method: 'PATCH',
        headers: { 'if-match': `"${editVersion}"` },
        body: JSON.stringify({
          prefix: String(data.get('prefix')).toUpperCase(),
          padding: Number(data.get('padding')),
          isDefault: data.get('isDefault') === 'on',
        }),
      });
      setEditingId(null);
      await load();
    } catch (caught) {
      setActionError(humanError(caught));
    }
  }

  return (
    <>
      <div className="section-heading split" style={{ marginTop: 32 }}>
        <h2>Invoice series</h2>
        <button
          className="button secondary small"
          type="button"
          onClick={() => setShowForm((v) => !v)}
        >
          {showForm ? 'Cancel' : '+ New series'}
        </button>
      </div>

      {actionError ? <p className="notice error">{actionError}</p> : null}

      {showForm ? (
        <form className="panel compact-form small-form" onSubmit={handleCreate}>
          <div className="form-grid">
            <label>
              Code <span className="optional">Unique, uppercase</span>
              <input name="code" required maxLength={40} pattern="[A-Za-z0-9_-]+" placeholder="STANDARD" />
            </label>
            <label>
              Prefix
              <input name="prefix" maxLength={20} pattern="[A-Za-z0-9-]*" placeholder="INV-" defaultValue="INV-" />
            </label>
            <label>
              Number padding
              <input name="padding" type="number" min={1} max={12} defaultValue={6} required />
            </label>
            <label className="checkbox-label">
              <input name="isDefault" type="checkbox" />
              Make default
            </label>
          </div>
          <div className="form-actions">
            <button className="button primary" type="submit" disabled={creating}>
              {creating ? 'Creating…' : 'Create series'}
            </button>
          </div>
        </form>
      ) : null}

      {error ? (
        <ErrorState message={error} retry={() => void load()} />
      ) : !series ? (
        <LoadingState label="Loading series…" />
      ) : (
        <section className="panel table-wrap">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Prefix</th>
                <th>Padding</th>
                <th>Next #</th>
                <th>Default</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {series.map((s) =>
                editingId === s.id ? (
                  <tr key={s.id}>
                    <td colSpan={6}>
                      <form
                        className="inline-edit-form"
                        onSubmit={(e) => void handleUpdate(s.id, e)}
                      >
                        <label>
                          Prefix
                          <input name="prefix" maxLength={20} pattern="[A-Za-z0-9-]*" defaultValue={s.prefix} />
                        </label>
                        <label>
                          Padding
                          <input name="padding" type="number" min={1} max={12} defaultValue={s.padding} />
                        </label>
                        <label className="checkbox-label">
                          <input name="isDefault" type="checkbox" defaultChecked={s.isDefault} />
                          Default
                        </label>
                        <button className="button primary small" type="submit">Save</button>
                        <button className="button secondary small" type="button" onClick={() => setEditingId(null)}>Cancel</button>
                      </form>
                    </td>
                  </tr>
                ) : (
                  <tr key={s.id}>
                    <td><strong>{s.code}</strong></td>
                    <td>{s.prefix || '—'}</td>
                    <td>{s.padding}</td>
                    <td className="tabular">{s.nextSequence}</td>
                    <td>{s.isDefault ? <span className="status active">Default</span> : '—'}</td>
                    <td>
                      <button
                        className="text-button"
                        type="button"
                        onClick={() => {
                          setEditingId(s.id);
                          setEditVersion(s.version);
                          setActionError(undefined);
                        }}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
