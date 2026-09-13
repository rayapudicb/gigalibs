'use client';

import type { CollectionEvent, CreditNote, Customer, Invoice, InvoiceDelivery, PaymentMethod, PaymentRecord, VoidRecord } from '@/lib/api-types';
import { humanError, newIdempotencyKey, requestJson } from '@/lib/browser-api';
import Link from 'next/link';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { ErrorState, LoadingState } from './feedback';

// ─── Amount helpers (same mini-helpers as invoice-editor) ─────────────────────

function minorScale(currency: string): number {
  const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND', 'BIF', 'CLP', 'GNF', 'ISK', 'MGA', 'PYG', 'RWF', 'UGX', 'XAF', 'XOF', 'XPF']);
  return ZERO_DECIMAL.has(currency.toUpperCase()) ? 1 : 100;
}

function displayMinor(currency: string, minor: number): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(
      minor / minorScale(currency),
    );
  } catch {
    // Fallback for unknown currency codes
    return `${(minor / 100).toFixed(2)} ${currency}`;
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

// ─── Status chip ──────────────────────────────────────────────────────────────

function DeliveryStatusChip({ status }: { status: InvoiceDelivery['status'] }) {
  const label = status === 'SENT' ? 'Sent' : status === 'FAILED' ? 'Failed' : 'Pending';
  return <span className={`status-chip delivery-${status.toLowerCase()}`}>{label}</span>;
}

// ─── Payment helpers ──────────────────────────────────────────────────────────

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'WIRE', label: 'Wire transfer' },
  { value: 'ACH', label: 'ACH / direct debit' },
  { value: 'CHECK', label: 'Check' },
  { value: 'CARD', label: 'Card' },
  { value: 'CREDIT_NOTE', label: 'Credit note' },
  { value: 'MANUAL', label: 'Manual / other' },
];

// ─── Payments section ─────────────────────────────────────────────────────────

function PaymentsSection({
  invoiceId,
  currency,
  amountDueMinor,
  isVoided,
  onPaymentRecorded,
}: {
  invoiceId: string;
  currency: string;
  amountDueMinor: number;
  isVoided: boolean;
  onPaymentRecorded: () => void;
}) {
  const [payments, setPayments] = useState<PaymentRecord[]>();
  const [voidRecord, setVoidRecord] = useState<VoidRecord | null>(null);
  const [loadError, setLoadError] = useState<string>();
  const [showPayModal, setShowPayModal] = useState(false);
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string>();

  const load = useCallback(async () => {
    setLoadError(undefined);
    try {
      const [paymentsRes, voidRes] = await Promise.allSettled([
        requestJson<{ items: PaymentRecord[] }>(`v1/invoices/${invoiceId}/payments`),
        requestJson<VoidRecord>(`v1/invoices/${invoiceId}/void`),
      ]);
      if (paymentsRes.status === 'fulfilled') setPayments(paymentsRes.value.items);
      else setLoadError(humanError((paymentsRes as PromiseRejectedResult).reason));
      // 404 = not voided, which is the normal case
      if (voidRes.status === 'fulfilled') setVoidRecord(voidRes.value);
    } catch (e) {
      setLoadError(humanError(e));
    }
  }, [invoiceId]);

  useEffect(() => { void load(); }, [load]);

  async function submitPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setSubmitting(true);
    setActionError(undefined);
    try {
      const newPayment = await requestJson<PaymentRecord>(`v1/invoices/${invoiceId}/payments`, {
        method: 'POST',
        body: JSON.stringify({
          amountMinor: Math.round(Number(data.get('amountDecimal') as string) * minorScale(currency)),
          currency,
          paymentMethod: data.get('paymentMethod') as PaymentMethod,
          paymentReference: (data.get('paymentReference') as string) || undefined,
          notes: (data.get('notes') as string) || undefined,
          paidAt: (data.get('paidAt') as string) || undefined,
        }),
      });
      setPayments((prev) => [newPayment, ...(prev ?? [])]);
      setShowPayModal(false);
      onPaymentRecorded(); // re-fetch invoice to update amountPaidMinor / amountDueMinor
    } catch (e) {
      setActionError(humanError(e));
    } finally {
      setSubmitting(false);
    }
  }

  async function submitVoid(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSubmitting(true);
    setActionError(undefined);
    try {
      const record = await requestJson<VoidRecord>(`v1/invoices/${invoiceId}/void`, {
        method: 'POST',
        body: JSON.stringify({ reason: data.get('reason') }),
      });
      setVoidRecord(record);
      setShowVoidModal(false);
      onPaymentRecorded(); // re-fetch invoice so isVoided updates
    } catch (e) {
      setActionError(humanError(e));
    } finally {
      setSubmitting(false);
    }
  }

  const scale = minorScale(currency);
  const amountDueDecimal = (amountDueMinor / scale).toFixed(scale === 1 ? 0 : 2);

  return (
    <section className="payments-section panel">
      <div className="section-head split">
        <div>
          <h2>Payments</h2>
          {voidRecord ? (
            <p className="dimmed voided-label">
              Voided — {formatDateTime(voidRecord.voidedAt)}
            </p>
          ) : (
            <p className="dimmed">
              {amountDueMinor > 0
                ? `${displayMinor(currency, amountDueMinor)} outstanding`
                : 'Fully paid'}
            </p>
          )}
        </div>
        {!isVoided && !voidRecord ? (
          <div className="button-row">
            {amountDueMinor > 0 ? (
              <button
                type="button"
                className="button primary"
                onClick={() => { setActionError(undefined); setShowPayModal(true); }}
              >
                Record payment
              </button>
            ) : null}
            <button
              type="button"
              className="button danger"
              onClick={() => { setActionError(undefined); setShowVoidModal(true); }}
            >
              Void invoice
            </button>
          </div>
        ) : null}
      </div>

      {loadError ? (
        <div className="notice error" role="alert">{loadError}</div>
      ) : null}

      {voidRecord ? (
        <div className="notice warning">
          <strong>Invoice voided</strong>
          <p>{voidRecord.reason}</p>
          <p className="dimmed">Voided by {voidRecord.voidedBy} · {formatDateTime(voidRecord.voidedAt)}</p>
        </div>
      ) : null}

      {payments && payments.length > 0 ? (
        <div className="table-wrap">
          <table className="payments-table">
            <thead>
              <tr>
                <th>Method</th>
                <th className="num">Amount</th>
                <th>Reference</th>
                <th className="ts">Paid on</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td>{PAYMENT_METHODS.find((m) => m.value === p.paymentMethod)?.label ?? p.paymentMethod}</td>
                  <td className="num">{displayMinor(p.currency, p.amountMinor)}</td>
                  <td>{p.paymentReference ?? p.notes ?? '—'}</td>
                  <td className="ts">{formatDateTime(p.paidAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : payments && payments.length === 0 && !voidRecord ? (
        <p className="dimmed">No payments recorded yet.</p>
      ) : null}

      {/* ── Record payment dialog ── */}
      {showPayModal ? (
        <div className="dialog-backdrop">
          <dialog open className="dialog" aria-labelledby="pay-title">
            <h2 id="pay-title">Record payment</h2>
            {actionError ? (
              <div className="notice error" role="alert">{actionError}</div>
            ) : null}
            <form onSubmit={submitPayment}>
              <label>
                Amount ({currency})
                <input
                  name="amountDecimal"
                  type="number"
                  step={scale === 1 ? '1' : '0.01'}
                  min={scale === 1 ? '1' : '0.01'}
                  defaultValue={amountDueDecimal}
                  required
                  autoFocus
                />
              </label>
              <label>
                Payment method
                <select name="paymentMethod" required>
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </label>
              <label>
                Reference (optional)
                <input name="paymentReference" maxLength={200} placeholder="CHK-1234 / wire confirmation…" />
              </label>
              <label>
                Date paid
                <input name="paidAt" type="datetime-local" />
              </label>
              <label>
                Notes (optional)
                <textarea name="notes" maxLength={1000} rows={2} />
              </label>
              <div className="form-actions">
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => setShowPayModal(false)}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button className="button primary" type="submit" disabled={submitting}>
                  {submitting ? 'Saving…' : 'Record payment'}
                </button>
              </div>
            </form>
          </dialog>
        </div>
      ) : null}

      {/* ── Void dialog ── */}
      {showVoidModal ? (
        <div className="dialog-backdrop">
          <dialog open className="dialog" aria-labelledby="void-title">
            <p className="eyebrow">Irreversible operation</p>
            <h2 id="void-title">Void this invoice?</h2>
            <p>Voiding marks the invoice as cancelled. It cannot be undone. For partial corrections, issue a credit note instead.</p>
            {actionError ? (
              <div className="notice error" role="alert">{actionError}</div>
            ) : null}
            <form onSubmit={submitVoid}>
              <label>
                Reason for void
                <input
                  name="reason"
                  required
                  maxLength={500}
                  placeholder="Duplicate invoice / customer request…"
                  autoFocus
                />
              </label>
              <div className="form-actions">
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => setShowVoidModal(false)}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button className="button danger" type="submit" disabled={submitting}>
                  {submitting ? 'Voiding…' : 'Void permanently'}
                </button>
              </div>
            </form>
          </dialog>
        </div>
      ) : null}
    </section>
  );
}

// ─── Credit notes section ─────────────────────────────────────────────────────

const COLLECTION_EVENT_LABELS: Record<string, string> = {
  REMINDER_SENT: 'Reminder sent',
  ESCALATED: 'Escalated',
  RESOLVED: 'Resolved',
  NOTE_ADDED: 'Note added',
};

const COLLECTION_CHANNEL_LABELS: Record<string, string> = {
  EMAIL: 'Email',
  PHONE: 'Phone',
  LETTER: 'Letter',
  PORTAL: 'Portal',
};

function CreditNotesSection({
  invoiceId,
  currency,
  isVoided,
  onCreditNoteIssued,
}: {
  invoiceId: string;
  currency: string;
  isVoided: boolean;
  onCreditNoteIssued: () => void;
}) {
  const [creditNotes, setCreditNotes] = useState<CreditNote[]>();
  const [collectionEvents, setCollectionEvents] = useState<CollectionEvent[]>();
  const [loadError, setLoadError] = useState<string>();
  const [showCnModal, setShowCnModal] = useState(false);
  const [showCollectModal, setShowCollectModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string>();
  // Credit note form lines state
  const [cnLines, setCnLines] = useState([{ description: '', quantity: '1', unitAmountDecimal: '' }]);

  const load = useCallback(async () => {
    setLoadError(undefined);
    try {
      const [cnRes, collectRes] = await Promise.allSettled([
        requestJson<{ items: CreditNote[] }>(`v1/invoices/${invoiceId}/credit-notes`),
        requestJson<{ items: CollectionEvent[] }>(`v1/invoices/${invoiceId}/collections`),
      ]);
      if (cnRes.status === 'fulfilled') setCreditNotes(cnRes.value.items);
      if (collectRes.status === 'fulfilled') setCollectionEvents(collectRes.value.items);
      if (cnRes.status === 'rejected') setLoadError(humanError((cnRes as PromiseRejectedResult).reason));
    } catch (e) {
      setLoadError(humanError(e));
    }
  }, [invoiceId]);

  useEffect(() => { void load(); }, [load]);

  // Credit note submission
  async function submitCreditNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setSubmitting(true);
    setActionError(undefined);
    const scale = minorScale(currency);
    const lines = cnLines.map((_, i) => ({
      description: data.get(`line_desc_${i}`) as string,
      quantity: Number(data.get(`line_qty_${i}`)),
      unitAmountMinor: Math.round(Number(data.get(`line_unit_${i}`) as string) * scale),
    }));
    try {
      const cn = await requestJson<CreditNote>(`v1/invoices/${invoiceId}/credit-notes`, {
        method: 'POST',
        body: JSON.stringify({
          reason: data.get('reason') as string,
          issueDate: (data.get('issueDate') as string) || new Date().toISOString().slice(0, 10),
          lines,
        }),
      });
      setCreditNotes((prev) => [cn, ...(prev ?? [])]);
      setShowCnModal(false);
      setCnLines([{ description: '', quantity: '1', unitAmountDecimal: '' }]);
      onCreditNoteIssued(); // refresh invoice amountPaidMinor
    } catch (e) {
      setActionError(humanError(e));
    } finally {
      setSubmitting(false);
    }
  }

  // Collection event submission
  async function submitCollectionEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSubmitting(true);
    setActionError(undefined);
    try {
      const evt = await requestJson<CollectionEvent>(`v1/invoices/${invoiceId}/collections`, {
        method: 'POST',
        body: JSON.stringify({
          eventType: data.get('eventType') as string,
          channel: (data.get('channel') as string) || undefined,
          note: (data.get('note') as string) || undefined,
        }),
      });
      setCollectionEvents((prev) => [evt, ...(prev ?? [])]);
      setShowCollectModal(false);
    } catch (e) {
      setActionError(humanError(e));
    } finally {
      setSubmitting(false);
    }
  }

  const scale = minorScale(currency);

  return (
    <section className="credit-notes-section panel">
      <div className="section-head split">
        <div>
          <h2>Credit notes &amp; collections</h2>
          <p className="dimmed">
            {creditNotes ? `${creditNotes.length} credit note${creditNotes.length !== 1 ? 's' : ''}` : '…'}
            {collectionEvents ? ` · ${collectionEvents.length} collection event${collectionEvents.length !== 1 ? 's' : ''}` : ''}
          </p>
        </div>
        {!isVoided ? (
          <div className="button-row">
            <button
              type="button"
              className="button secondary"
              onClick={() => { setActionError(undefined); setShowCollectModal(true); }}
            >
              Log event
            </button>
            <button
              type="button"
              className="button primary"
              onClick={() => { setActionError(undefined); setShowCnModal(true); }}
            >
              Issue credit note
            </button>
          </div>
        ) : null}
      </div>

      {loadError ? <div className="notice error" role="alert">{loadError}</div> : null}

      {/* Credit notes table */}
      {creditNotes && creditNotes.length > 0 ? (
        <div className="table-wrap">
          <table className="credit-notes-table">
            <thead>
              <tr>
                <th>Credit note</th>
                <th>Reason</th>
                <th>Issue date</th>
                <th className="num">Total</th>
                <th className="ts">Issued at</th>
              </tr>
            </thead>
            <tbody>
              {creditNotes.map((cn) => (
                <tr key={cn.id}>
                  <td><strong>{cn.creditNoteNumber}</strong></td>
                  <td>{cn.reason}</td>
                  <td>{formatDate(cn.issueDate)}</td>
                  <td className="num">{displayMinor(cn.currency, cn.totalMinor)}</td>
                  <td className="ts">{formatDateTime(cn.issuedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : creditNotes && creditNotes.length === 0 ? (
        <p className="dimmed">No credit notes issued.</p>
      ) : null}

      {/* Collection events */}
      {collectionEvents && collectionEvents.length > 0 ? (
        <>
          <h3 className="subsection-head">Collection activity</h3>
          <div className="table-wrap">
            <table className="collection-table">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Channel</th>
                  <th>Note</th>
                  <th>Actor</th>
                  <th className="ts">Date</th>
                </tr>
              </thead>
              <tbody>
                {collectionEvents.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <span className={`status collection-${e.eventType.toLowerCase().replace('_', '-')}`}>
                        {COLLECTION_EVENT_LABELS[e.eventType] ?? e.eventType}
                      </span>
                    </td>
                    <td>{e.channel ? COLLECTION_CHANNEL_LABELS[e.channel] ?? e.channel : '—'}</td>
                    <td className="note-col">{e.note ?? '—'}</td>
                    <td className="mono dimmed">{e.actor}</td>
                    <td className="ts">{formatDateTime(e.occurredAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {/* ── Issue credit note dialog ── */}
      {showCnModal ? (
        <div className="dialog-backdrop">
          <dialog open className="dialog dialog-wide" aria-labelledby="cn-title">
            <h2 id="cn-title">Issue credit note</h2>
            <p className="dimmed">
              A credit note reduces the outstanding balance by recording a matching CREDIT_NOTE payment.
            </p>
            {actionError ? <div className="notice error" role="alert">{actionError}</div> : null}
            <form onSubmit={submitCreditNote}>
              <label>
                Reason
                <input name="reason" required maxLength={500} placeholder="Pricing error / goodwill adjustment…" autoFocus />
              </label>
              <label>
                Issue date
                <input name="issueDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
              </label>

              <fieldset className="cn-lines-fieldset">
                <legend>Line items</legend>
                {cnLines.map((_, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: positional lines
                  <div key={i} className="cn-line-row">
                    <label>
                      Description
                      <input name={`line_desc_${i}`} required maxLength={500} placeholder="Description" />
                    </label>
                    <label>
                      Qty
                      <input name={`line_qty_${i}`} type="number" min="0.000001" step="any" defaultValue="1" required />
                    </label>
                    <label>
                      Unit price ({currency})
                      <input name={`line_unit_${i}`} type="number" min={scale === 1 ? '1' : '0.01'} step={scale === 1 ? '1' : '0.01'} required />
                    </label>
                    {cnLines.length > 1 ? (
                      <button
                        type="button"
                        className="button secondary small"
                        onClick={() => setCnLines((prev) => prev.filter((__, j) => j !== i))}
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                ))}
                <button
                  type="button"
                  className="button secondary small"
                  onClick={() => setCnLines((prev) => [...prev, { description: '', quantity: '1', unitAmountDecimal: '' }])}
                >
                  + Add line
                </button>
              </fieldset>

              <div className="form-actions">
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => { setShowCnModal(false); setCnLines([{ description: '', quantity: '1', unitAmountDecimal: '' }]); }}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button className="button primary" type="submit" disabled={submitting}>
                  {submitting ? 'Issuing…' : 'Issue credit note'}
                </button>
              </div>
            </form>
          </dialog>
        </div>
      ) : null}

      {/* ── Log collection event dialog ── */}
      {showCollectModal ? (
        <div className="dialog-backdrop">
          <dialog open className="dialog" aria-labelledby="collect-title">
            <h2 id="collect-title">Log collection event</h2>
            {actionError ? <div className="notice error" role="alert">{actionError}</div> : null}
            <form onSubmit={submitCollectionEvent}>
              <label>
                Event type
                <select name="eventType" required>
                  <option value="REMINDER_SENT">Reminder sent</option>
                  <option value="ESCALATED">Escalated</option>
                  <option value="RESOLVED">Resolved</option>
                  <option value="NOTE_ADDED">Note added</option>
                </select>
              </label>
              <label>
                Channel (optional)
                <select name="channel">
                  <option value="">— none —</option>
                  <option value="EMAIL">Email</option>
                  <option value="PHONE">Phone</option>
                  <option value="LETTER">Letter</option>
                  <option value="PORTAL">Portal</option>
                </select>
              </label>
              <label>
                Note (optional)
                <textarea name="note" maxLength={2000} rows={3} placeholder="Details about this activity…" />
              </label>
              <div className="form-actions">
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => setShowCollectModal(false)}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button className="button primary" type="submit" disabled={submitting}>
                  {submitting ? 'Saving…' : 'Log event'}
                </button>
              </div>
            </form>
          </dialog>
        </div>
      ) : null}
    </section>
  );
}

// ─── Delivery section ─────────────────────────────────────────────────────────

function DeliveriesSection({
  invoiceId,
  invoiceNumber,
  recipientEmail,
  recipientName,
  currency,
}: {
  invoiceId: string;
  invoiceNumber: string;
  recipientEmail: string;
  recipientName: string;
  currency: string;
}) {
  const [deliveries, setDeliveries] = useState<InvoiceDelivery[]>();
  const [loadError, setLoadError] = useState<string>();
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string>();

  const loadDeliveries = useCallback(async () => {
    setLoadError(undefined);
    try {
      const result = await requestJson<{ items: InvoiceDelivery[] }>(
        `v1/invoices/${invoiceId}/deliveries`,
      );
      setDeliveries(result.items);
    } catch (caught) {
      setLoadError(humanError(caught));
    }
  }, [invoiceId]);

  useEffect(() => {
    void loadDeliveries();
  }, [loadDeliveries]);

  async function send() {
    setSending(true);
    setSendError(undefined);
    try {
      const result = await requestJson<InvoiceDelivery>(
        `v1/invoices/${invoiceId}/deliver`,
        {
          method: 'POST',
          headers: { 'idempotency-key': newIdempotencyKey() },
          body: JSON.stringify({}),
        },
      );
      // Prepend to list
      setDeliveries((prev) => (prev ? [result, ...prev] : [result]));
    } catch (caught) {
      setSendError(humanError(caught));
    } finally {
      setSending(false);
    }
  }

  const pdfUrl = `/api/proxy/v1/invoices/${invoiceId}/pdf`;

  return (
    <section className="delivery-section panel">
      <div className="section-head split">
        <div>
          <h2>Delivery</h2>
          <p className="dimmed">
            Send{invoiceNumber ? ` ${invoiceNumber}` : ''} to{' '}
            <span className="mono">{recipientEmail}</span>
          </p>
        </div>
        <div className="button-row">
          <a
            className="button secondary"
            href={pdfUrl}
            target="_blank"
            rel="noreferrer"
          >
            View PDF
          </a>
          <button
            type="button"
            className="button primary"
            onClick={() => void send()}
            disabled={sending}
          >
            {sending ? 'Sending…' : 'Send to customer'}
          </button>
        </div>
      </div>

      {sendError ? (
        <div className="notice error" role="alert">
          {sendError}
        </div>
      ) : null}

      {loadError ? (
        <div className="notice error" role="alert">
          Could not load delivery history: {loadError}
        </div>
      ) : null}

      {deliveries === undefined && !loadError ? (
        <p className="dimmed">Loading delivery history…</p>
      ) : deliveries && deliveries.length === 0 ? (
        <p className="dimmed">No deliveries yet.</p>
      ) : deliveries && deliveries.length > 0 ? (
        <div className="table-wrap">
          <table className="deliveries-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Recipient</th>
                <th>Subject</th>
                <th className="ts">Sent at</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((d) => (
                <tr key={d.id} className={d.status === 'FAILED' ? 'row-failed' : undefined}>
                  <td>
                    <DeliveryStatusChip status={d.status} />
                  </td>
                  <td>
                    <span>{d.recipientName}</span>
                    <br />
                    <span className="mono dimmed">{d.recipientEmail}</span>
                  </td>
                  <td className="subject-col">{d.subjectLine}</td>
                  <td className="ts">
                    {d.sentAt ? formatDateTime(d.sentAt) : '—'}
                    {d.failureReason ? (
                      <p className="failure-reason">{d.failureReason}</p>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function InvoiceDetail({ invoiceId }: { invoiceId: string }) {
  const [invoice, setInvoice] = useState<Invoice>();
  const [customer, setCustomer] = useState<Customer>();
  const [error, setError] = useState<string>();
  const [issuing, setIssuing] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const load = useCallback(async () => {
    setError(undefined);
    try {
      const document = await requestJson<Invoice>(`v1/invoices/${invoiceId}`);
      setInvoice(document);
      // Fetch only the specific customer — avoids list-all on large tenants
      try {
        const c = await requestJson<Customer>(`v1/customers/${document.customerId}`);
        setCustomer(c);
      } catch {
        // Non-fatal: customer might be deleted; invoice still shows
      }
    } catch (caught) {
      setError(humanError(caught));
    }
  }, [invoiceId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function issue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!invoice) return;
    setIssuing(true);
    setError(undefined);
    const data = new FormData(event.currentTarget);
    try {
      const issued = await requestJson<Invoice>(`v1/invoices/${invoice.id}/issue`, {
        method: 'POST',
        headers: {
          'idempotency-key': newIdempotencyKey(),
          'if-match': `"${invoice.version}"`,
        },
        body: JSON.stringify({ reason: data.get('reason') }),
      });
      setInvoice(issued);
      setConfirm(false);
    } catch (caught) {
      setError(humanError(caught));
    } finally {
      setIssuing(false);
    }
  }

  if (error && !invoice) return <ErrorState message={error} retry={() => void load()} />;
  if (!invoice) return <LoadingState label="Loading invoice…" />;

  const curr = invoice.currency;

  return (
    <>
      <div className="page-heading split">
        <div>
          <p className="eyebrow">
            {invoice.status === 'DRAFT' ? 'Draft document' : 'Issued document'}
            {' · '}
            <span className={`status-inline ${invoice.isVoided ? 'voided' : invoice.status.toLowerCase()}`}>
              {invoice.isVoided ? 'VOIDED' : invoice.status}
            </span>
          </p>
          <h1>{invoice.invoiceNumber ?? 'Unnumbered draft'}</h1>
          {customer ? (
            <p>
              <Link href={`/customers/${customer.id}`}>{customer.legalName}</Link>
              {' · '}
              <span className="mono">{customer.billingEmail}</span>
            </p>
          ) : (
            <p className="mono dimmed">{invoice.customerId}</p>
          )}
        </div>
        <div className="button-row">
          <Link className="button secondary" href="/invoices">
            Back
          </Link>
          {invoice.status === 'DRAFT' ? (
            <>
              <Link className="button secondary" href={`/invoices/${invoice.id}/edit`}>
                Edit draft
              </Link>
              <button className="button primary" type="button" onClick={() => setConfirm(true)}>
                Issue invoice
              </button>
            </>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="notice error" role="alert">
          {error}
        </div>
      ) : null}

      {/* ── Invoice document ── */}
      <section className="document panel">
        {/* Header metadata */}
        <div className="document-head">
          <div className="document-meta">
            <dl className="meta-grid">
              <div>
                <dt>Issue date</dt>
                <dd>{formatDate(invoice.issueDate)}</dd>
              </div>
              <div>
                <dt>Due date</dt>
                <dd>{formatDate(invoice.dueDate)}</dd>
              </div>
              {invoice.purchaseOrderReference ? (
                <div>
                  <dt>PO reference</dt>
                  <dd>{invoice.purchaseOrderReference}</dd>
                </div>
              ) : null}
              {invoice.issuedAt ? (
                <div>
                  <dt>Issued at</dt>
                  <dd>{new Date(invoice.issuedAt).toLocaleString()}</dd>
                </div>
              ) : null}
              <div>
                <dt>Currency</dt>
                <dd>{curr}</dd>
              </div>
            </dl>
          </div>

          {/* Bill-to block */}
          {customer ? (
            <div className="bill-to">
              <p className="label">Bill to</p>
              <strong>{customer.legalName}</strong>
              <p>{customer.billingEmail}</p>
              {customer.billingAddress ? (
                <address>
                  {[
                    customer.billingAddress.line1,
                    customer.billingAddress.line2,
                    customer.billingAddress.city,
                    customer.billingAddress.state,
                    customer.billingAddress.postalCode,
                    customer.billingAddress.country,
                  ]
                    .filter(Boolean)
                    .map((line, i) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: address lines stable
                      <span key={i}>
                        {line}
                        <br />
                      </span>
                    ))}
                </address>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Line items table */}
        <div className="table-wrap">
          <table className="invoice-lines-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Description</th>
                <th className="num">Quantity</th>
                <th className="num">Unit price</th>
                <th className="num">Line total</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((line) => (
                <tr key={line.position}>
                  <td>{line.position}</td>
                  <td>{line.description}</td>
                  <td className="num">{line.quantity}</td>
                  <td className="num">{displayMinor(curr, line.unitAmountMinor)}</td>
                  <td className="num">{displayMinor(curr, line.amountMinor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="totals">
          <div>
            <span>Subtotal</span>
            <strong>{displayMinor(curr, invoice.subtotalMinor)}</strong>
          </div>
          <div>
            <span>Tax</span>
            <strong>{displayMinor(curr, invoice.taxMinor)}</strong>
          </div>
          <div className="grand-total">
            <span>Total</span>
            <strong>{displayMinor(curr, invoice.totalMinor)}</strong>
          </div>
          {invoice.amountPaidMinor > 0 ? (
            <>
              <div>
                <span>Paid</span>
                <strong>({displayMinor(curr, invoice.amountPaidMinor)})</strong>
              </div>
              <div className="amount-due">
                <span>Amount due</span>
                <strong>{displayMinor(curr, invoice.amountDueMinor)}</strong>
              </div>
            </>
          ) : null}
        </div>

        {invoice.status === 'ISSUED' ? (
          <div className="immutable-note">
            This invoice is issued and its financial fields are immutable. Use a credit note to adjust the balance.
          </div>
        ) : null}
      </section>

      {/* ── Payments section (only for issued invoices) ── */}
      {invoice.status === 'ISSUED' ? (
        <PaymentsSection
          invoiceId={invoice.id}
          currency={invoice.currency}
          amountDueMinor={invoice.amountDueMinor}
          isVoided={invoice.isVoided}
          onPaymentRecorded={() => void load()}
        />
      ) : null}

      {/* ── Credit notes & collections section (only for issued invoices) ── */}
      {invoice.status === 'ISSUED' ? (
        <CreditNotesSection
          invoiceId={invoice.id}
          currency={invoice.currency}
          isVoided={invoice.isVoided}
          onCreditNoteIssued={() => void load()}
        />
      ) : null}

      {/* ── Delivery section (only for issued invoices with a customer email) ── */}
      {invoice.status === 'ISSUED' && invoice.invoiceNumber && customer ? (
        <DeliveriesSection
          invoiceId={invoice.id}
          invoiceNumber={invoice.invoiceNumber}
          recipientEmail={customer.billingEmail}
          recipientName={customer.legalName}
          currency={curr}
        />
      ) : null}

      {/* ── Issue confirmation dialog ── */}
      {confirm ? (
        <div className="dialog-backdrop">
          <dialog open className="dialog" aria-labelledby="issue-title">
            <p className="eyebrow">Irreversible operation</p>
            <h2 id="issue-title">Issue this invoice?</h2>
            <p>
              Issuing allocates the next invoice number and makes the financial snapshot
              permanently immutable. This cannot be undone.
            </p>
            <form onSubmit={issue}>
              <label>
                Reason for issue
                <input
                  name="reason"
                  required
                  maxLength={500}
                  placeholder="Approved for customer delivery"
                  autoFocus
                />
              </label>
              <div className="form-actions">
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => setConfirm(false)}
                  disabled={issuing}
                >
                  Cancel
                </button>
                <button className="button danger" type="submit" disabled={issuing}>
                  {issuing ? 'Issuing…' : 'Issue permanently'}
                </button>
              </div>
            </form>
          </dialog>
        </div>
      ) : null}
    </>
  );
}
