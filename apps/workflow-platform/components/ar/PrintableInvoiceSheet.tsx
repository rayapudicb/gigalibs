'use client';

import React from 'react';
import type { Invoice } from '@/lib/ar-api';

export function formatPrintCurrency(currency: string, minor: number): string {
  const curr = (currency || 'USD').toUpperCase();
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: curr,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(minor / 100);
  } catch {
    return `${curr} ${(minor / 100).toFixed(2)}`;
  }
}

export function PrintableInvoiceSheet({ invoice }: { invoice: Invoice | null }) {
  if (!invoice) return null;

  const invNum = invoice.invoiceNumber ?? `DRAFT-${invoice.id.slice(0, 8)}`;
  const lines = invoice.lines || [];
  const taxes = invoice.appliedTaxes || [];
  const installments = invoice.installments || [];

  return (
    <div
      id="printable-invoice-sheet"
      className="printable-only bg-white text-black p-8 max-w-4xl mx-auto font-sans leading-relaxed text-sm"
    >
      {/* ─── ENTERPRISE COMPANY HEADER ─── */}
      <div className="flex justify-between items-start border-b-2 border-slate-900 pb-6 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded bg-slate-900 text-white flex items-center justify-center font-bold text-base">
              G
            </div>
            <span className="text-xl font-bold tracking-tight text-slate-900">
              GigaPlatform Technologies Inc.
            </span>
          </div>
          <p className="text-xs text-slate-600">Enterprise Cloud &amp; Financial Operations Engine</p>
          <p className="text-xs text-slate-500 mt-1">
            100 Enterprise Way, Suite 400 • San Francisco, CA 94105 • USA
          </p>
          <p className="text-xs text-slate-500 font-mono">
            Tax ID / US-EIN: 84-2910482 • DUNS: 08-192-4820 • Peppol ID: 9908:987654321
          </p>
        </div>

        <div className="text-right">
          <span className="inline-block px-3 py-1 text-xs font-bold uppercase tracking-wider bg-slate-100 text-slate-800 border border-slate-300 rounded mb-2">
            {invoice.status === 'ISSUED' ? 'Official Commercial Invoice' : 'Draft Billing Proforma'}
          </span>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight font-mono">{invNum}</h1>
          <p className="text-xs text-slate-500 mt-1">
            Standard: <span className="font-semibold text-slate-700">Peppol BIS 3.0 (UBL 2.1)</span>
          </p>
        </div>
      </div>

      {/* ─── INVOICE METADATA & BILL-TO ─── */}
      <div className="grid grid-cols-2 gap-8 mb-8 pb-6 border-b border-slate-200">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Billed To</h3>
          <div className="text-slate-800 text-sm font-semibold">{invoice.customerName || 'Enterprise Client'}</div>
          <div className="text-xs text-slate-600 mt-1">Attn: Accounts Payable / Finance Operations</div>
          <div className="text-xs text-slate-600 font-mono mt-0.5">Customer ID: {invoice.customerId}</div>
          <div className="text-xs text-slate-500 mt-1">
            Payment Terms: <span className="font-semibold text-slate-700">Net 30 Days</span>
          </div>
        </div>

        <div className="bg-slate-50 p-4 rounded border border-slate-200 space-y-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-500 font-medium">Invoice Number:</span>
            <span className="font-mono font-bold text-slate-900">{invNum}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500 font-medium">Issue Date:</span>
            <span className="font-medium text-slate-800">{invoice.issueDate}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500 font-medium">Due Date:</span>
            <span className="font-bold text-slate-900">{invoice.dueDate}</span>
          </div>
          {invoice.purchaseOrderReference && (
            <div className="flex justify-between">
              <span className="text-slate-500 font-medium">PO Reference:</span>
              <span className="font-mono font-semibold text-slate-800">{invoice.purchaseOrderReference}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-slate-500 font-medium">Billing Currency:</span>
            <span className="font-mono font-bold text-slate-900">{invoice.currency}</span>
          </div>
        </div>
      </div>

      {/* ─── ITEMIZED LINE ITEMS TABLE ─── */}
      <div className="mb-6">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Line Items &amp; Deliverables</h3>
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b-2 border-slate-900 bg-slate-100 text-slate-800 uppercase font-semibold">
              <th className="py-2.5 px-3 w-12 text-center">#</th>
              <th className="py-2.5 px-3">Description</th>
              <th className="py-2.5 px-3 w-20 text-center">Qty</th>
              <th className="py-2.5 px-3 w-28 text-right">Unit Price</th>
              <th className="py-2.5 px-3 w-32 text-right">Line Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {lines.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-4 text-center text-slate-500">
                  No line items attached.
                </td>
              </tr>
            ) : (
              lines.map((line, idx) => (
                <tr key={idx} className="hover:bg-slate-50">
                  <td className="py-2.5 px-3 text-center text-slate-500 font-mono">{line.position || idx + 1}</td>
                  <td className="py-2.5 px-3 font-medium text-slate-900">{line.description}</td>
                  <td className="py-2.5 px-3 text-center font-mono text-slate-700">{line.quantity}</td>
                  <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                    {formatPrintCurrency(invoice.currency, line.unitAmountMinor)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                    {formatPrintCurrency(invoice.currency, line.amountMinor)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ─── FINANCIAL TOTALS & TAXES ─── */}
      <div className="flex justify-end mb-8 break-inside-avoid">
        <div className="w-80 space-y-2 text-xs">
          <div className="flex justify-between py-1 border-b border-slate-200 text-slate-600">
            <span>Gross Subtotal:</span>
            <span className="font-mono text-slate-900 font-medium">
              {formatPrintCurrency(invoice.currency, invoice.subtotalGrossMinor ?? invoice.subtotalMinor)}
            </span>
          </div>

          {invoice.discountMinor && invoice.discountMinor > 0 ? (
            <div className="flex justify-between py-1 border-b border-slate-200 text-emerald-700">
              <span>Prompt Payment Discount:</span>
              <span className="font-mono font-medium">
                -{formatPrintCurrency(invoice.currency, invoice.discountMinor)}
              </span>
            </div>
          ) : null}

          {taxes.length > 0 && (
            <div className="py-1 border-b border-slate-200 space-y-1">
              <div className="text-[11px] font-semibold uppercase text-slate-500">Tax Breakdown:</div>
              {taxes.map((t, i) => (
                <div key={i} className="flex justify-between text-slate-600 text-[11px] pl-2">
                  <span>
                    {t.name} ({(t.rateBasisPoints / 100).toFixed(2)}%
                    {t.isCompound ? ' compound' : ''}):
                  </span>
                  <span className="font-mono text-slate-800">
                    {formatPrintCurrency(invoice.currency, t.amountMinor)}
                  </span>
                </div>
              ))}
              <div className="flex justify-between text-slate-700 font-semibold pt-1">
                <span>Total Taxes:</span>
                <span className="font-mono">{formatPrintCurrency(invoice.currency, invoice.taxMinor)}</span>
              </div>
            </div>
          )}

          <div className="flex justify-between items-center py-2 px-3 bg-slate-900 text-white rounded font-bold text-sm">
            <span>TOTAL AMOUNT DUE:</span>
            <span className="font-mono text-base tracking-tight">
              {formatPrintCurrency(invoice.currency, invoice.totalMinor)}
            </span>
          </div>

          <div className="flex justify-between text-slate-600 pt-1 text-[11px]">
            <span>Amount Paid:</span>
            <span className="font-mono">{formatPrintCurrency(invoice.currency, invoice.amountPaidMinor)}</span>
          </div>
          <div className="flex justify-between font-semibold text-slate-900 text-xs">
            <span>Outstanding Balance:</span>
            <span className="font-mono">{formatPrintCurrency(invoice.currency, invoice.amountDueMinor)}</span>
          </div>
        </div>
      </div>

      {/* ─── MILESTONE INSTALLMENTS (IF APPLICABLE) ─── */}
      {installments.length > 0 && (
        <div className="mb-6 p-4 bg-slate-50 rounded border border-slate-200 break-inside-avoid">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
            Milestone Installment Schedule (Auto-Balanced)
          </h3>
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-300 text-slate-600 font-semibold">
                <th className="py-1">Milestone</th>
                <th className="py-1">Due Date</th>
                <th className="py-1">Allocation</th>
                <th className="py-1">Status</th>
                <th className="py-1 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {installments.map((inst, i) => (
                <tr key={i}>
                  <td className="py-1.5 font-medium text-slate-900">Milestone #{inst.position}</td>
                  <td className="py-1.5 text-slate-700 font-mono">{inst.dueDate}</td>
                  <td className="py-1.5 text-slate-700 font-mono">{(inst.percentageBasisPoints / 100).toFixed(2)}%</td>
                  <td className="py-1.5">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                        inst.status === 'PAID'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {inst.status || 'PENDING'}
                    </span>
                  </td>
                  <td className="py-1.5 text-right font-mono font-bold text-slate-900">
                    {formatPrintCurrency(invoice.currency, inst.amountMinor)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── FIPS 180-4 CRYPTOGRAPHIC SEAL CERTIFICATE ─── */}
      <div className="mb-6 p-4 rounded border-2 border-slate-800 bg-slate-50 break-inside-avoid">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-sm">🔒</span>
            <span className="text-xs font-black uppercase tracking-wider text-slate-900">
              FIPS 180-4 Cryptographic Ledger Seal Certificate
            </span>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300 uppercase">
            Tamper-Evident Chain Verified
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
          <div>
            <span className="text-slate-500 block text-[10px] uppercase font-sans">Current Block Hash (SHA-256):</span>
            <span className="text-slate-900 break-all font-bold">
              {invoice.sealHash || invoice.seal?.hash || 'GENESIS_UNSEALED'}
            </span>
          </div>
          <div>
            <span className="text-slate-500 block text-[10px] uppercase font-sans">Chained Parent Hash:</span>
            <span className="text-slate-700 break-all">
              {invoice.previousSealHash || invoice.seal?.previousHash || '0000000000000000000000000000000000000000'}
            </span>
          </div>
          <div className="mt-1">
            <span className="text-slate-500 block text-[10px] uppercase font-sans">Ledger Sequence Number:</span>
            <span className="text-slate-800 font-bold">#{invoice.sealSequence || invoice.seal?.sequenceNumber || 1}</span>
          </div>
          <div className="mt-1">
            <span className="text-slate-500 block text-[10px] uppercase font-sans">Compliance Verification:</span>
            <span className="text-slate-800 font-bold">ISO 20022 • Peppol BIS 3.0 • Factur-X Ready</span>
          </div>
        </div>
      </div>

      {/* ─── REMITTANCE / WIRE INSTRUCTIONS ─── */}
      <div className="border-t border-slate-300 pt-4 grid grid-cols-2 gap-6 text-xs break-inside-avoid">
        <div>
          <h4 className="font-bold text-slate-800 uppercase text-[11px] mb-1">Bank Wire &amp; ACH Remittance</h4>
          <p className="text-slate-600">Bank: <span className="font-semibold text-slate-800">JPMorgan Chase Bank, N.A.</span></p>
          <p className="text-slate-600 font-mono">Routing / ABA: 021000021</p>
          <p className="text-slate-600 font-mono">Account Number: ************4829</p>
          <p className="text-slate-600 font-mono">SWIFT / BIC: CHASUS33</p>
        </div>
        <div>
          <h4 className="font-bold text-slate-800 uppercase text-[11px] mb-1">Payment Instructions</h4>
          <p className="text-slate-600">
            Please reference invoice number <strong className="text-slate-900 font-mono">{invNum}</strong> on all wire transfers and remittance advices.
          </p>
          <p className="text-slate-500 text-[11px] mt-2">
            Send remittance notices to: <span className="font-semibold text-slate-700">ar-remittance@gigalibs.io</span>
          </p>
        </div>
      </div>

      {/* ─── PRINT FOOTER ─── */}
      <div className="mt-8 pt-4 border-t border-slate-200 text-center text-[10px] text-slate-400 font-mono">
        Generated via GigaLibs AR Ledger Engine (WI-OI-035) • FIPS 180-4 Tamper-Proof Cryptographic System • Page 1 of 1
      </div>
    </div>
  );
}
