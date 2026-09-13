'use client';

import type { Customer, CustomerContact } from '@/lib/api-types';
import { humanError, newIdempotencyKey, requestJson } from '@/lib/browser-api';
import Link from 'next/link';
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { EmptyState, ErrorState, LoadingState } from './feedback';

// ─── Currency options helper ─────────────────────────────────────────────────
const CURRENCIES = ['USD', 'EUR', 'GBP', 'AUD', 'CAD', 'INR', 'SGD', 'AED', 'JPY', 'CHF'];
const TAX_ID_TYPES = [
  { value: 'VAT', label: 'VAT Number' },
  { value: 'GST', label: 'GST Number' },
  { value: 'EIN', label: 'EIN (US)' },
  { value: 'ABN', label: 'ABN (AU)' },
  { value: 'GSTIN', label: 'GSTIN (IN)' },
  { value: 'OTHER', label: 'Other' },
];
const CONTACT_ROLES = [
  { value: 'BILLING', label: 'Billing' },
  { value: 'PRIMARY', label: 'Primary' },
  { value: 'CC', label: 'CC / Copy' },
  { value: 'ACCOUNTS_PAYABLE', label: 'Accounts Payable' },
  { value: 'TECHNICAL', label: 'Technical' },
];

// ─── Customer List ────────────────────────────────────────────────────────────

export function Customers() {
  const [customers, setCustomers] = useState<Customer[]>();
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string>();
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (cursor?: string, searchTerm?: string) => {
    setError(undefined);
    if (cursor) setLoadingMore(true);
    try {
      const query = new URLSearchParams({ pageSize: '50' });
      if (cursor) query.set('cursor', cursor);
      if (searchTerm) query.set('search', searchTerm);
      const page = await requestJson<{ items: Customer[]; nextCursor: string | null }>(
        `v1/customers?${query}`,
      );
      setCustomers((current) => (cursor ? [...(current ?? []), ...page.items] : page.items));
      setNextCursor(page.nextCursor);
    } catch (caught) {
      setError(humanError(caught));
    } finally {
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function handleSearch(value: string) {
    setSearch(value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setCustomers(undefined);
      void load(undefined, value.trim() || undefined);
    }, 300);
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(undefined);
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await requestJson<Customer>('v1/customers', {
        method: 'POST',
        headers: { 'idempotency-key': newIdempotencyKey() },
        body: JSON.stringify({
          legalName: data.get('legalName'),
          billingEmail: data.get('billingEmail'),
          ...(String(data.get('externalReference') ?? '').trim()
            ? { externalReference: data.get('externalReference') }
            : {}),
          currency: String(data.get('currency')).toUpperCase(),
          ...(String(data.get('phone') ?? '').trim() ? { phone: data.get('phone') } : {}),
          ...(String(data.get('taxId') ?? '').trim()
            ? {
                taxId: data.get('taxId'),
                taxIdType: data.get('taxIdType') || undefined,
              }
            : {}),
          ...(String(data.get('paymentTermsDays') ?? '').trim()
            ? { paymentTermsDays: Number(data.get('paymentTermsDays')) }
            : {}),
        }),
      });
      form.reset();
      setShowForm(false);
      await load(undefined, search.trim() || undefined);
    } catch (caught) {
      setError(humanError(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="page-heading split">
        <div>
          <p className="eyebrow">Customer master</p>
          <h1>Customers</h1>
          <p>Tenant-owned billing identities used by invoice snapshots.</p>
        </div>
        <button
          className="button primary"
          type="button"
          onClick={() => setShowForm((v) => !v)}
        >
          {showForm ? 'Close form' : 'Add customer'}
        </button>
      </div>

      {/* Add customer form */}
      {showForm ? (
        <form className="panel compact-form" onSubmit={create}>
          <div className="form-grid">
            <label>
              Legal name
              <input name="legalName" required maxLength={200} />
            </label>
            <label>
              Billing email
              <input name="billingEmail" required type="email" maxLength={320} />
            </label>
            <label>
              External reference <span className="optional">Optional</span>
              <input name="externalReference" maxLength={100} />
            </label>
            <label>
              Currency
              <select name="currency" defaultValue="USD">
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Phone <span className="optional">Optional</span>
              <input name="phone" type="tel" maxLength={50} />
            </label>
            <label>
              Tax ID type <span className="optional">Optional</span>
              <select name="taxIdType" defaultValue="">
                <option value="">— None —</option>
                {TAX_ID_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Tax ID <span className="optional">Optional</span>
              <input name="taxId" maxLength={50} />
            </label>
            <label>
              Payment terms (days) <span className="optional">Optional</span>
              <input name="paymentTermsDays" type="number" min={0} max={365} placeholder="30" />
            </label>
          </div>
          {error ? <p className="form-error">{error}</p> : null}
          <div className="form-actions">
            <button className="button primary" type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save customer'}
            </button>
          </div>
        </form>
      ) : null}

      {/* Search bar */}
      <div className="search-bar">
        <input
          type="search"
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          aria-label="Search customers"
        />
      </div>

      {error && !showForm ? (
        <ErrorState message={error} retry={() => void load(undefined, search.trim() || undefined)} />
      ) : !customers ? (
        <LoadingState />
      ) : customers.length === 0 ? (
        <EmptyState
          title="No customers found"
          message={
            search ? 'No customers match your search.' : 'Add a customer before creating an invoice.'
          }
          action={
            !search ? (
              <button className="button primary" type="button" onClick={() => setShowForm(true)}>
                Add first customer
              </button>
            ) : undefined
          }
        />
      ) : (
        <section className="panel table-wrap">
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Tax ID</th>
                <th>Currency</th>
                <th>Payment terms</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => (
                <tr key={customer.id}>
                  <td>
                    <strong>{customer.legalName}</strong>
                    <small>{customer.billingEmail}</small>
                  </td>
                  <td>
                    {customer.taxId ? (
                      <span>
                        <span className="label-dim">{customer.taxIdType ?? 'ID'}</span>{' '}
                        {customer.taxId}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>{customer.currency}</td>
                  <td>
                    {customer.paymentTermsDays != null
                      ? `Net ${customer.paymentTermsDays}`
                      : '—'}
                  </td>
                  <td>
                    <span className={`status ${customer.status.toLowerCase()}`}>
                      {customer.status}
                    </span>
                  </td>
                  <td>
                    <Link className="text-button" href={`/customers/${customer.id}`}>
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {nextCursor ? (
            <div className="pagination-actions">
              <button
                className="button secondary"
                type="button"
                disabled={loadingMore}
                onClick={() => void load(nextCursor, search.trim() || undefined)}
              >
                {loadingMore ? 'Loading…' : 'Load next page'}
              </button>
            </div>
          ) : null}
        </section>
      )}
    </>
  );
}

// ─── Customer Detail ──────────────────────────────────────────────────────────

export function CustomerDetail({ customerId }: { customerId: string }) {
  const [customer, setCustomer] = useState<Customer>();
  const [contacts, setContacts] = useState<CustomerContact[]>();
  const [error, setError] = useState<string>();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string>();
  const [addingContact, setAddingContact] = useState(false);
  const [contactSaving, setContactSaving] = useState(false);

  const loadCustomer = useCallback(async () => {
    setError(undefined);
    try {
      const [c, ct] = await Promise.all([
        requestJson<Customer>(`v1/customers/${customerId}`),
        requestJson<{ items: CustomerContact[] }>(`v1/customers/${customerId}/contacts`),
      ]);
      setCustomer(c);
      setContacts(ct.items);
    } catch (caught) {
      setError(humanError(caught));
    }
  }, [customerId]);

  useEffect(() => {
    void loadCustomer();
  }, [loadCustomer]);

  async function handleUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setActionError(undefined);
    const form = event.currentTarget;
    const data = new FormData(form);

    function opt(key: string): string | undefined {
      const v = String(data.get(key) ?? '').trim();
      return v || undefined;
    }

    const body: Record<string, unknown> = {
      legalName: data.get('legalName'),
      billingEmail: data.get('billingEmail'),
    };
    if (opt('phone') !== undefined) body.phone = opt('phone') ?? null;
    if (opt('website') !== undefined) body.website = opt('website') ?? null;
    if (opt('taxId') !== undefined) {
      body.taxId = opt('taxId') ?? null;
      body.taxIdType = opt('taxIdType') ?? null;
    }
    if (opt('paymentTermsDays') !== undefined) {
      body.paymentTermsDays = Number(data.get('paymentTermsDays'));
    }
    if (opt('notes') !== undefined) body.notes = opt('notes') ?? null;

    const billingAddress = {
      line1: opt('addr_line1'),
      city: opt('addr_city'),
      state: opt('addr_state'),
      postalCode: opt('addr_postal'),
      country: opt('addr_country'),
    };
    if (Object.values(billingAddress).some((v) => v !== undefined)) {
      body.billingAddress = billingAddress;
    }

    try {
      const updated = await requestJson<Customer>(`v1/customers/${customerId}`, {
        method: 'PATCH',
        headers: { 'if-match': `"${customer?.version}"` },
        body: JSON.stringify(body),
      });
      setCustomer(updated);
      setEditing(false);
    } catch (caught) {
      setActionError(humanError(caught));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate() {
    if (!confirm('Deactivate this customer? They can be reactivated later.')) return;
    setActionError(undefined);
    try {
      const updated = await requestJson<Customer>(`v1/customers/${customerId}/deactivate`, {
        method: 'POST',
      });
      setCustomer(updated);
    } catch (caught) {
      setActionError(humanError(caught));
    }
  }

  async function handleReactivate() {
    setActionError(undefined);
    try {
      const updated = await requestJson<Customer>(`v1/customers/${customerId}/reactivate`, {
        method: 'POST',
      });
      setCustomer(updated);
    } catch (caught) {
      setActionError(humanError(caught));
    }
  }

  async function handleAddContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setContactSaving(true);
    setActionError(undefined);
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await requestJson<CustomerContact>(`v1/customers/${customerId}/contacts`, {
        method: 'POST',
        body: JSON.stringify({
          name: data.get('contactName'),
          email: data.get('contactEmail'),
          ...(String(data.get('contactPhone') ?? '').trim()
            ? { phone: data.get('contactPhone') }
            : {}),
          role: data.get('contactRole') || 'BILLING',
        }),
      });
      form.reset();
      setAddingContact(false);
      const ct = await requestJson<{ items: CustomerContact[] }>(
        `v1/customers/${customerId}/contacts`,
      );
      setContacts(ct.items);
    } catch (caught) {
      setActionError(humanError(caught));
    } finally {
      setContactSaving(false);
    }
  }

  async function handleRemoveContact(contactId: string) {
    if (!confirm('Remove this contact?')) return;
    setActionError(undefined);
    try {
      await requestJson(`v1/customers/${customerId}/contacts/${contactId}`, {
        method: 'DELETE',
      });
      setContacts((prev) => prev?.filter((c) => c.id !== contactId));
    } catch (caught) {
      setActionError(humanError(caught));
    }
  }

  if (!customer && !error) return <LoadingState label="Loading customer…" />;
  if (error) return <ErrorState message={error} retry={() => void loadCustomer()} />;
  if (!customer) return null;

  const addr = customer.billingAddress;

  return (
    <>
      <div className="page-heading split">
        <div>
          <p className="eyebrow">
            <Link href="/customers">Customers</Link> › Customer record
          </p>
          <h1>{customer.legalName}</h1>
          <p>{customer.billingEmail}</p>
        </div>
        <div className="action-row">
          {customer.status === 'ACTIVE' ? (
            <>
              <button
                className="button secondary"
                type="button"
                onClick={() => setEditing((v) => !v)}
              >
                {editing ? 'Cancel edit' : 'Edit'}
              </button>
              <button className="button danger" type="button" onClick={handleDeactivate}>
                Deactivate
              </button>
            </>
          ) : (
            <button className="button primary" type="button" onClick={handleReactivate}>
              Reactivate
            </button>
          )}
        </div>
      </div>

      {actionError ? <p className="notice error">{actionError}</p> : null}

      {/* ── Edit form ───────────────────────────────────────────────── */}
      {editing ? (
        <form className="panel compact-form" onSubmit={handleUpdate}>
          <div className="form-section-label">Basic info</div>
          <div className="form-grid">
            <label>
              Legal name
              <input name="legalName" required maxLength={200} defaultValue={customer.legalName} />
            </label>
            <label>
              Billing email
              <input
                name="billingEmail"
                required
                type="email"
                maxLength={320}
                defaultValue={customer.billingEmail}
              />
            </label>
            <label>
              Phone
              <input name="phone" type="tel" maxLength={50} defaultValue={customer.phone ?? ''} />
            </label>
            <label>
              Website
              <input name="website" maxLength={255} defaultValue={customer.website ?? ''} />
            </label>
            <label>
              Tax ID type
              <select name="taxIdType" defaultValue={customer.taxIdType ?? ''}>
                <option value="">— None —</option>
                {TAX_ID_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Tax ID
              <input name="taxId" maxLength={50} defaultValue={customer.taxId ?? ''} />
            </label>
            <label>
              Payment terms (days)
              <input
                name="paymentTermsDays"
                type="number"
                min={0}
                max={365}
                defaultValue={customer.paymentTermsDays ?? ''}
              />
            </label>
          </div>
          <div className="form-section-label">Billing address</div>
          <div className="form-grid">
            <label className="wide">
              Address line 1
              <input
                name="addr_line1"
                maxLength={200}
                defaultValue={addr?.line1 ?? ''}
              />
            </label>
            <label>
              City
              <input name="addr_city" maxLength={100} defaultValue={addr?.city ?? ''} />
            </label>
            <label>
              State / Region
              <input name="addr_state" maxLength={100} defaultValue={addr?.state ?? ''} />
            </label>
            <label>
              Postal code
              <input name="addr_postal" maxLength={20} defaultValue={addr?.postalCode ?? ''} />
            </label>
            <label>
              Country (ISO 2-letter)
              <input
                name="addr_country"
                maxLength={2}
                pattern="[A-Za-z]{2}"
                placeholder="US"
                defaultValue={addr?.country ?? ''}
              />
            </label>
          </div>
          <div className="form-section-label">Notes</div>
          <label>
            Internal notes
            <textarea name="notes" maxLength={2000} rows={3} defaultValue={customer.notes ?? ''} />
          </label>
          <div className="form-actions">
            <button
              className="button secondary"
              type="button"
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
            <button className="button primary" type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      ) : (
        /* ── Read-only view ─────────────────────────────────────────── */
        <div className="panel detail-card">
          <dl className="detail-grid">
            <dt>Status</dt>
            <dd>
              <span className={`status ${customer.status.toLowerCase()}`}>{customer.status}</span>
            </dd>

            <dt>Currency</dt>
            <dd>{customer.currency}</dd>

            {customer.externalReference ? (
              <>
                <dt>External ref</dt>
                <dd>{customer.externalReference}</dd>
              </>
            ) : null}

            {customer.phone ? (
              <>
                <dt>Phone</dt>
                <dd>{customer.phone}</dd>
              </>
            ) : null}

            {customer.website ? (
              <>
                <dt>Website</dt>
                <dd>
                  <a href={customer.website} target="_blank" rel="noopener noreferrer">
                    {customer.website}
                  </a>
                </dd>
              </>
            ) : null}

            {customer.taxId ? (
              <>
                <dt>Tax ID</dt>
                <dd>
                  <span className="label-dim">{customer.taxIdType ?? 'ID'}</span> {customer.taxId}
                </dd>
              </>
            ) : null}

            <dt>Payment terms</dt>
            <dd>{customer.paymentTermsDays != null ? `Net ${customer.paymentTermsDays} days` : '—'}</dd>

            {addr ? (
              <>
                <dt>Billing address</dt>
                <dd>
                  {[addr.line1, addr.city, addr.state, addr.postalCode, addr.country]
                    .filter(Boolean)
                    .join(', ')}
                </dd>
              </>
            ) : null}

            {customer.notes ? (
              <>
                <dt>Notes</dt>
                <dd className="notes-cell">{customer.notes}</dd>
              </>
            ) : null}

            <dt>Version</dt>
            <dd className="dim">v{customer.version}</dd>
          </dl>
        </div>
      )}

      {/* ── Contacts ─────────────────────────────────────────────────────── */}
      <div className="section-heading split">
        <h2>Billing contacts</h2>
        <button
          className="button secondary small"
          type="button"
          onClick={() => setAddingContact((v) => !v)}
        >
          {addingContact ? 'Cancel' : '+ Add contact'}
        </button>
      </div>

      {addingContact ? (
        <form className="panel compact-form small-form" onSubmit={handleAddContact}>
          <div className="form-grid">
            <label>
              Name
              <input name="contactName" required maxLength={200} />
            </label>
            <label>
              Email
              <input name="contactEmail" required type="email" maxLength={320} />
            </label>
            <label>
              Phone <span className="optional">Optional</span>
              <input name="contactPhone" type="tel" maxLength={50} />
            </label>
            <label>
              Role
              <select name="contactRole" defaultValue="BILLING">
                {CONTACT_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-actions">
            <button className="button primary" type="submit" disabled={contactSaving}>
              {contactSaving ? 'Adding…' : 'Add contact'}
            </button>
          </div>
        </form>
      ) : null}

      {!contacts ? (
        <LoadingState label="Loading contacts…" />
      ) : contacts.length === 0 ? (
        <p className="empty-inline">No contacts yet. Add one so invoices have a recipient.</p>
      ) : (
        <section className="panel table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Role</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <tr key={c.id} className={c.isActive ? '' : 'row-dim'}>
                  <td>{c.name}</td>
                  <td>{c.email}</td>
                  <td>{c.phone ?? '—'}</td>
                  <td>
                    <span className="role-badge">{c.role.replace('_', ' ')}</span>
                  </td>
                  <td>
                    <button
                      className="text-button danger-text"
                      type="button"
                      onClick={() => void handleRemoveContact(c.id)}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Quick link to invoices for this customer */}
      <div className="section-heading split" style={{ marginTop: 32 }}>
        <h2>Invoices</h2>
        <Link className="button secondary small" href={`/invoices?customerId=${customer.id}`}>
          View invoices →
        </Link>
      </div>
    </>
  );
}
