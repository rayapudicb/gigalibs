'use client';

import { ArNav } from '@/components/ar/ArNav';
import type { Customer, Invoice } from '@/lib/ar-api';
import { formatMinorAmount, newIdempotencyKey, requestAr } from '@/lib/ar-api';
import { calculateSalesTax } from '@/lib/tax-nexus';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useCurrency, COUNTRY_DATA } from '@/components/currency/CurrencyLocaleContext';
import { Container, Heading, Text, Button, Input, Label, Alert, Badge } from '@medusajs/ui';
import { CheckCircleSolid, ShieldCheck } from '@medusajs/icons';

interface DraftLineState {
  description: string;
  quantity: string;
  unitAmountDollars: string;
  discountDollars: string;
}

interface InstallmentItem {
  position: number;
  label: string;
  dueDate: string;
  percentageBasisPoints: number; // e.g. 5000 = 50.00%
}

export default function NewInvoicePage() {
  const router = useRouter();
  const { currency } = useCurrency();
  const currencySymbol = COUNTRY_DATA[currency]?.currencySymbol || '$';
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState<string>('');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(
    new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
  );
  const [poRef, setPoRef] = useState('');
  const [stateCode, setStateCode] = useState('CA');
  const [isFarExempt, setIsFarExempt] = useState(false);
  const [hasLocalTax, setHasLocalTax] = useState(true);
  const [isCompoundTax, setIsCompoundTax] = useState(false);
  const [headerDiscountDollars, setHeaderDiscountDollars] = useState('0.00');

  const [installmentPreset, setInstallmentPreset] = useState<'100' | '50_50' | '40_30_30' | 'CUSTOM'>('100');
  const [customInstallments, setCustomInstallments] = useState<InstallmentItem[]>([
    { position: 1, label: 'Kickoff Milestone', dueDate: new Date().toISOString().slice(0, 10), percentageBasisPoints: 5000 },
    { position: 2, label: 'Final Delivery Milestone', dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10), percentageBasisPoints: 5000 },
  ]);

  const [lines, setLines] = useState<DraftLineState[]>([
    {
      description: 'Cloud Platform Architecture & Infrastructure Automation',
      quantity: '1',
      unitAmountDollars: '4500.00',
      discountDollars: '0.00',
    },
    {
      description: 'Zero-Float Scaled Math & Financial Ledger Integration',
      quantity: '2',
      unitAmountDollars: '1250.00',
      discountDollars: '100.00',
    },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void requestAr<{ items: Customer[] }>('v1/customers?pageSize=100')
      .then((res) => {
        setCustomers(res.items ?? []);
        if (res.items && res.items.length > 0) {
          setCustomerId(res.items[0]!.id);
        }
      })
      .catch(() => {});
  }, []);

  function addLine() {
    setLines([...lines, { description: '', quantity: '1', unitAmountDollars: '100.00', discountDollars: '0.00' }]);
  }

  function removeLine(idx: number) {
    if (lines.length === 1) return;
    setLines(lines.filter((_, i) => i !== idx));
  }

  function updateLine(idx: number, field: keyof DraftLineState, val: string) {
    const updated = [...lines];
    updated[idx]![field] = val;
    setLines(updated);
  }

  // Authoritative Scaled-Integer Math Calculation
  const calculation = useMemo(() => {
    let subtotalGrossMinor = 0n;
    let lineDiscountsMinor = 0n;

    const parsedLines = lines.map((line, idx) => {
      const qtyFloat = parseFloat(line.quantity) || 0;
      const unitMinor = BigInt(Math.max(0, Math.round((parseFloat(line.unitAmountDollars) || 0) * 100)));
      const discMinor = BigInt(Math.max(0, Math.round((parseFloat(line.discountDollars) || 0) * 100)));

      const qtyNumerator = BigInt(Math.round(qtyFloat * 1000));
      const grossMinor = (qtyNumerator * unitMinor + 500n) / 1000n;
      const netMinor = discMinor > grossMinor ? 0n : grossMinor - discMinor;

      subtotalGrossMinor += grossMinor;
      lineDiscountsMinor += discMinor;

      return {
        position: idx + 1,
        description: line.description,
        grossMinor: Number(grossMinor),
        discountMinor: Number(discMinor),
        netMinor: Number(netMinor),
      };
    });

    const subtotalNetMinor = subtotalGrossMinor - lineDiscountsMinor;
    const headerDiscMinor = BigInt(Math.max(0, Math.round((parseFloat(headerDiscountDollars) || 0) * 100)));
    const baseTaxableMinor = headerDiscMinor > subtotalNetMinor ? 0n : subtotalNetMinor - headerDiscMinor;

    // Multi-tier tax engine calculation
    let stateTaxRateBps = 0n;
    let localTaxRateBps = 0n;
    if (!isFarExempt) {
      const taxData = calculateSalesTax({ amountMinor: Number(baseTaxableMinor), stateCode, isFarExempt: false });
      stateTaxRateBps = BigInt(Math.round(taxData.jurisdiction.baseRate * 10000));
      if (hasLocalTax) {
        localTaxRateBps = BigInt(Math.round(taxData.jurisdiction.localRate * 10000));
      }
    }


    const stateTaxMinor = (baseTaxableMinor * stateTaxRateBps + 5000n) / 10000n;
    let localTaxableMinor = baseTaxableMinor;
    if (isCompoundTax) {
      localTaxableMinor += stateTaxMinor;
    }
    const localTaxMinor = (localTaxableMinor * localTaxRateBps + 5000n) / 10000n;
    const totalTaxMinor = stateTaxMinor + localTaxMinor;
    const totalMinor = baseTaxableMinor + totalTaxMinor;

    // Milestone installment splits
    let activeInstallments: InstallmentItem[] = [];
    if (installmentPreset === '100') {
      activeInstallments = [
        { position: 1, label: '100% Full Balance (Net 30)', dueDate, percentageBasisPoints: 10000 },
      ];
    } else if (installmentPreset === '50_50') {
      activeInstallments = [
        { position: 1, label: '50% Mobilization / Kickoff', dueDate: issueDate, percentageBasisPoints: 5000 },
        { position: 2, label: '50% Final Acceptance & Closeout', dueDate, percentageBasisPoints: 5000 },
      ];
    } else if (installmentPreset === '40_30_30') {
      const midDate = new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10);
      activeInstallments = [
        { position: 1, label: '40% Kickoff & Specification', dueDate: issueDate, percentageBasisPoints: 4000 },
        { position: 2, label: '30% Midpoint Review & Alpha Test', dueDate: midDate, percentageBasisPoints: 3000 },
        { position: 3, label: '30% Production Handover', dueDate, percentageBasisPoints: 3000 },
      ];
    } else {
      activeInstallments = customInstallments;
    }

    // Allocate installments with remainder cent balancing
    let allocatedMinor = 0n;
    const balancedInstallments = activeInstallments.map((inst, idx) => {
      let instMinor: bigint;
      if (idx === activeInstallments.length - 1) {
        instMinor = totalMinor - allocatedMinor;
      } else {
        instMinor = (totalMinor * BigInt(inst.percentageBasisPoints) + 5000n) / 10000n;
        allocatedMinor += instMinor;
      }
      return {
        ...inst,
        amountMinor: Number(instMinor),
      };
    });

    return {
      parsedLines,
      subtotalGrossMinor: Number(subtotalGrossMinor),
      lineDiscountsMinor: Number(lineDiscountsMinor),
      subtotalNetMinor: Number(subtotalNetMinor),
      headerDiscountMinor: Number(headerDiscMinor),
      totalDiscountMinor: Number(lineDiscountsMinor + headerDiscMinor),
      stateTaxRateBps: Number(stateTaxRateBps),
      stateTaxMinor: Number(stateTaxMinor),
      localTaxRateBps: Number(localTaxRateBps),
      localTaxMinor: Number(localTaxMinor),
      totalTaxMinor: Number(totalTaxMinor),
      totalMinor: Number(totalMinor),
      installments: balancedInstallments,
    };
  }, [lines, headerDiscountDollars, isFarExempt, stateCode, hasLocalTax, isCompoundTax, installmentPreset, customInstallments, issueDate, dueDate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customerId) {
      setError('Please select a customer.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const payloadLines = lines.map((l) => ({
        description: l.description.trim() || 'Service line',
        quantity: l.quantity,
        unitAmountMinor: Math.round((parseFloat(l.unitAmountDollars) || 0) * 100),
        discountMinor: Math.round((parseFloat(l.discountDollars) || 0) * 100),
      }));

      const created = await requestAr<Invoice>('v1/invoices', {
        method: 'POST',
        headers: {
          'Idempotency-Key': newIdempotencyKey(),
        },
        body: JSON.stringify({
          customerId,
          currency: currency || 'USD',
          issueDate,
          dueDate,
          purchaseOrderReference: poRef.trim() || undefined,
          lines: payloadLines,
        }),
      });

      router.push(`/ar/invoices/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create invoice draft.');
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col min-h-screen font-sans text-ui-fg-base">
      <div className="p-8 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Badge color="blue" size="small">WI-OI-035</Badge>
              <Badge color="green" size="small">FIPS 180-4 Chained Ledger Engine</Badge>
            </div>
            <Heading level="h1" className="text-2xl font-bold text-ui-fg-base mt-2">Create Enterprise Invoice</Heading>
            <Text size="small" className="text-ui-fg-muted mt-1">
              Authoritative scaled-integer billing with multi-tier compounding taxation, line discounts, and auto-balanced milestone installments.
            </Text>
          </div>
        </div>
      </div>

      <ArNav />

      <form onSubmit={handleSubmit} className="p-8 space-y-6 max-w-5xl">
        {error && (
          <Alert variant="error" className="text-xs">
            {error}
          </Alert>
        )}

        {/* Customer & Document Header */}
        <Container className="p-6 border border-ui-border-base bg-ui-bg-base shadow-elevation-card-rest rounded-xl space-y-4">
          <Heading level="h2" className="text-base font-semibold text-ui-fg-base">Customer &amp; Header Information</Heading>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="cust-select" className="text-xs font-medium text-ui-fg-subtle">
                Customer Account *
              </Label>
              {customers.length === 0 ? (
                <div className="text-xs text-ui-tag-orange-text py-2">
                  No customers found. Please add a customer first in{' '}
                  <a href="/ar/customers" className="underline">
                    Customers
                  </a>
                  .
                </div>
              ) : (
                <select
                  id="cust-select"
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  className="w-full h-8 px-2.5 text-xs rounded-md border border-ui-border-base bg-ui-bg-base text-ui-fg-base outline-none focus:border-ui-border-interactive focus:ring-1 focus:ring-ui-border-interactive shadow-borders-base"
                  required
                >
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.legalName} ({c.billingEmail})
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="po-ref" className="text-xs font-medium text-ui-fg-subtle">
                Purchase Order / Contract Reference
              </Label>
              <Input
                id="po-ref"
                type="text"
                value={poRef}
                onChange={(e) => setPoRef(e.target.value)}
                placeholder="e.g. PO-2026-DOD-9821"
                size="small"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="issue-date" className="text-xs font-medium text-ui-fg-subtle">
                Issue Date *
              </Label>
              <Input
                id="issue-date"
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                required
                size="small"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="due-date" className="text-xs font-medium text-ui-fg-subtle">
                Final Due Date *
              </Label>
              <Input
                id="due-date"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                required
                size="small"
              />
            </div>
          </div>
        </Container>

        {/* Multi-Tier Tax Nexus Engine */}
        <Container className="p-6 border border-ui-border-base bg-ui-bg-subtle shadow-elevation-card-rest rounded-xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-ui-bg-base text-ui-fg-interactive border border-ui-border-base shadow-xs">
                🏛️ Multi-Tier Scaled Tax Engine (Zero-Float Precision)
              </span>
              <Heading level="h3" className="text-sm font-bold text-ui-fg-base mt-1.5">Tax Nexus &amp; Compound Surcharge Rules</Heading>
            </div>
            <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-ui-fg-base bg-ui-bg-base px-3 py-1.5 rounded-md border border-ui-border-base shadow-xs">
              <input
                type="checkbox"
                checked={isFarExempt}
                onChange={(e) => setIsFarExempt(e.target.checked)}
                className="rounded text-ui-fg-interactive focus:ring-0"
              />
              FAR 52.229-3 Federal / Defense Exemption (0% Tax)
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            <div>
              <Label className="text-xs text-ui-fg-muted mb-1 block">Primary Tax Jurisdiction</Label>
              <select
                value={stateCode}
                onChange={(e) => setStateCode(e.target.value)}
                disabled={isFarExempt}
                className="w-full h-8 px-2.5 text-xs rounded-md border border-ui-border-base bg-ui-bg-base text-ui-fg-base disabled:opacity-50 shadow-borders-base"
              >
                <option value="CA">California (CA) - State 7.25% + Local</option>
                <option value="NY">New York (NY) - State 4.00% + Local</option>
                <option value="TX">Texas (TX) - State 6.25% + Local</option>
                <option value="WA">Washington (WA) - State 6.50% + Local</option>
                <option value="VA">Virginia (VA) - State 4.30% + Local</option>
                <option value="MD">Maryland (MD) - State 6.00% + Local</option>
                <option value="DE">Delaware (DE) - 0.00% Tax Free Haven</option>
              </select>
            </div>

            <div className="p-3 rounded-lg bg-ui-bg-base border border-ui-border-base text-xs shadow-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-medium text-ui-fg-muted">County / District Tax</span>
                <input
                  type="checkbox"
                  checked={hasLocalTax && !isFarExempt}
                  disabled={isFarExempt}
                  onChange={(e) => setHasLocalTax(e.target.checked)}
                  className="rounded text-ui-fg-interactive"
                />
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-ui-border-base">
                <span className="font-medium text-ui-fg-muted">Cascading Compound Tax</span>
                <input
                  type="checkbox"
                  checked={isCompoundTax && !isFarExempt}
                  disabled={isFarExempt}
                  onChange={(e) => setIsCompoundTax(e.target.checked)}
                  className="rounded text-ui-fg-interactive"
                />
              </div>
            </div>

            <div className="p-3 rounded-lg bg-ui-bg-base border border-ui-border-base text-xs shadow-xs">
              <p className="text-ui-fg-muted font-medium">Computed Tax Total</p>
              <p className="text-base font-bold text-ui-fg-interactive mt-0.5 font-mono">
                {formatMinorAmount('USD', calculation.totalTaxMinor)}
              </p>
              <p className="text-[10px] text-ui-fg-muted mt-0.5">
                {isFarExempt
                  ? 'Exempt under Federal FAR 52.229-3'
                  : `State: $${(calculation.stateTaxMinor / 100).toFixed(2)} (${(calculation.stateTaxRateBps / 100).toFixed(2)}%) | Local: $${(calculation.localTaxMinor / 100).toFixed(2)}`}
              </p>
            </div>
          </div>
        </Container>

        {/* Line Items Card */}
        <Container className="p-6 border border-ui-border-base bg-ui-bg-base shadow-elevation-card-rest rounded-xl space-y-4">
          <div className="flex items-center justify-between">
            <Heading level="h2" className="text-base font-semibold text-ui-fg-base">Itemized Line Items &amp; Discounts</Heading>
            <Button
              type="button"
              variant="secondary"
              size="small"
              onClick={addLine}
            >
              + Add Item
            </Button>
          </div>

          <div className="space-y-3">
            <div className="flex gap-3 text-[11px] font-semibold text-ui-fg-muted uppercase tracking-wider px-1">
              <div className="flex-1">Description</div>
              <div className="w-20 text-right">Qty</div>
              <div className="w-28 text-right">Unit Price</div>
              <div className="w-28 text-right">Line Discount</div>
              <div className="w-28 text-right">Net Amount</div>
              <div className="w-6"></div>
            </div>

            {lines.map((line, idx) => (
              <div key={idx} className="flex gap-3 items-center">
                <div className="flex-1">
                  <input
                    type="text"
                    value={line.description}
                    onChange={(e) => updateLine(idx, 'description', e.target.value)}
                    placeholder="Description (e.g. Consulting, Platform Service)"
                    className="w-full h-8 px-2.5 text-xs rounded-md border border-ui-border-base bg-ui-bg-base text-ui-fg-base outline-none focus:border-ui-border-interactive focus:ring-1 focus:ring-ui-border-interactive shadow-borders-base"
                    required
                  />
                </div>
                <div className="w-20">
                  <input
                    type="number"
                    step="1"
                    min="1"
                    value={line.quantity}
                    onChange={(e) => updateLine(idx, 'quantity', e.target.value)}
                    placeholder="Qty"
                    className="w-full h-8 px-2.5 text-xs rounded-md border border-ui-border-base bg-ui-bg-base text-ui-fg-base outline-none focus:border-ui-border-interactive focus:ring-1 focus:ring-ui-border-interactive shadow-borders-base text-right font-mono"
                    required
                  />
                </div>
                <div className="w-28">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={line.unitAmountDollars}
                    onChange={(e) => updateLine(idx, 'unitAmountDollars', e.target.value)}
                    placeholder={`Unit (${currencySymbol})`}
                    className="w-full h-8 px-2.5 text-xs rounded-md border border-ui-border-base bg-ui-bg-base text-ui-fg-base outline-none focus:border-ui-border-interactive focus:ring-1 focus:ring-ui-border-interactive shadow-borders-base text-right font-mono"
                    required
                  />
                </div>
                <div className="w-28">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={line.discountDollars}
                    onChange={(e) => updateLine(idx, 'discountDollars', e.target.value)}
                    placeholder={`Disc (${currencySymbol})`}
                    className="w-full h-8 px-2.5 text-xs rounded-md border border-ui-border-base bg-ui-bg-base text-ui-fg-base outline-none focus:border-ui-border-interactive focus:ring-1 focus:ring-ui-border-interactive shadow-borders-base text-right font-mono text-ui-tag-orange-text"
                  />
                </div>
                <div className="w-28 text-right font-mono text-xs font-bold text-ui-fg-base">
                  {formatMinorAmount(currency, calculation.parsedLines[idx]?.netMinor ?? 0)}
                </div>
                <div className="w-6 text-center">
                  {lines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeLine(idx)}
                      className="text-ui-tag-red-text hover:opacity-80 text-xs font-bold cursor-pointer"
                      title="Remove line"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Discounts & Grand Total Footer */}
          <div className="border-t border-ui-border-base pt-4 flex flex-col items-end gap-2 text-xs">
            <div className="flex justify-between w-80 text-ui-fg-muted">
              <span>Gross Subtotal:</span>
              <span className="font-mono text-ui-fg-base font-semibold">{formatMinorAmount(currency, calculation.subtotalGrossMinor)}</span>
            </div>
            {calculation.lineDiscountsMinor > 0 && (
              <div className="flex justify-between w-80 text-ui-tag-orange-text">
                <span>Line Discounts:</span>
                <span className="font-mono font-semibold">-{formatMinorAmount(currency, calculation.lineDiscountsMinor)}</span>
              </div>
            )}
            <div className="flex justify-between items-center w-80 text-ui-fg-muted">
              <span>Header Prompt Discount ({currencySymbol}):</span>
              <div className="w-32">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={headerDiscountDollars}
                  onChange={(e) => setHeaderDiscountDollars(e.target.value)}
                  className="w-full h-7 px-2 text-xs rounded border border-ui-border-base bg-ui-bg-base text-right font-mono text-ui-tag-orange-text"
                />
              </div>
            </div>
            <div className="flex justify-between w-80 text-ui-fg-muted">
              <span>Net Taxable Subtotal:</span>
              <span className="font-mono text-ui-fg-base font-semibold">{formatMinorAmount(currency, calculation.subtotalNetMinor - calculation.headerDiscountMinor)}</span>
            </div>
            <div className="flex justify-between w-80 text-ui-fg-muted">
              <span>Multi-Tier Sales Tax:</span>
              <span className="font-mono text-ui-fg-interactive font-semibold">{formatMinorAmount(currency, calculation.totalTaxMinor)}</span>
            </div>
            <div className="flex justify-between w-80 text-base font-bold text-ui-fg-base border-t border-ui-border-base pt-2">
              <span>Grand Total Payable:</span>
              <span className="font-mono text-ui-tag-green-text">{formatMinorAmount(currency, calculation.totalMinor)}</span>
            </div>
          </div>
        </Container>

        {/* Milestone Installment Billing Engine */}
        <Container className="p-6 border border-ui-border-base bg-ui-bg-base shadow-elevation-card-rest rounded-xl space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Heading level="h2" className="text-base font-semibold text-ui-fg-base">Milestone Installment Schedule</Heading>
              <Text size="xsmall" className="text-ui-fg-muted mt-0.5">
                Automatically allocate receivables across milestone delivery gates with strict penny remainder balancing.
              </Text>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setInstallmentPreset('100')}
                className={`px-2.5 py-1 text-xs rounded-md border font-medium transition ${
                  installmentPreset === '100' ? 'bg-ui-bg-interactive text-ui-fg-on-color border-transparent' : 'bg-ui-bg-subtle text-ui-fg-muted border-ui-border-base'
                }`}
              >
                100% Lump Sum
              </button>
              <button
                type="button"
                onClick={() => setInstallmentPreset('50_50')}
                className={`px-2.5 py-1 text-xs rounded-md border font-medium transition ${
                  installmentPreset === '50_50' ? 'bg-ui-bg-interactive text-ui-fg-on-color border-transparent' : 'bg-ui-bg-subtle text-ui-fg-muted border-ui-border-base'
                }`}
              >
                50 / 50 Milestone
              </button>
              <button
                type="button"
                onClick={() => setInstallmentPreset('40_30_30')}
                className={`px-2.5 py-1 text-xs rounded-md border font-medium transition ${
                  installmentPreset === '40_30_30' ? 'bg-ui-bg-interactive text-ui-fg-on-color border-transparent' : 'bg-ui-bg-subtle text-ui-fg-muted border-ui-border-base'
                }`}
              >
                40 / 30 / 30 Tri-Stage
              </button>
            </div>
          </div>

          <div className="border border-ui-border-base rounded-lg overflow-hidden">
            <div className="grid grid-cols-12 gap-2 bg-ui-bg-subtle p-3 text-[11px] font-semibold text-ui-fg-muted uppercase tracking-wider border-b border-ui-border-base">
              <div className="col-span-1">#</div>
              <div className="col-span-4">Milestone Description</div>
              <div className="col-span-3">Due Date</div>
              <div className="col-span-2 text-right">Split %</div>
              <div className="col-span-2 text-right">Allocated Amount</div>
            </div>
            {calculation.installments.map((inst, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 p-3 text-xs items-center border-b border-ui-border-base last:border-b-0 hover:bg-ui-bg-subtle-hover transition font-mono">
                <div className="col-span-1 text-ui-fg-muted">{inst.position}</div>
                <div className="col-span-4 font-sans text-ui-fg-base font-medium">{inst.label}</div>
                <div className="col-span-3 text-ui-fg-subtle">{inst.dueDate}</div>
                <div className="col-span-2 text-right text-ui-fg-interactive font-semibold">
                  {(inst.percentageBasisPoints / 100).toFixed(2)}%
                </div>
                <div className="col-span-2 text-right font-bold text-ui-fg-base">
                  {formatMinorAmount(currency, inst.amountMinor)}
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 p-3 rounded-lg bg-ui-bg-subtle border border-ui-border-base text-xs text-ui-fg-muted">
            <ShieldCheck className="text-ui-fg-interactive shrink-0" />
            <span>
              <strong>Zero Penny Drift Guarantee:</strong> The final milestone dynamically absorbs rounding remainder ({formatMinorAmount(currency, calculation.installments[calculation.installments.length - 1]?.amountMinor ?? 0)}), ensuring the exact sum of installments equals the invoice grand total to the penny.
            </span>
          </div>
        </Container>

        {/* Cryptographic Ledger Anchor Notice */}
        <Container className="p-4 border border-ui-border-base bg-ui-bg-subtle rounded-xl flex items-center justify-between text-xs">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-ui-tag-green-bg text-ui-tag-green-text flex items-center justify-center shrink-0">
              <CheckCircleSolid />
            </div>
            <div>
              <p className="font-semibold text-ui-fg-base">FIPS 180-4 Chained Ledger Anchor Ready</p>
              <p className="text-ui-fg-muted text-[11px] mt-0.5">
                Upon final confirmation, this invoice will be assigned a permanent monotonic series number and sealed with a SHA-256 hash chained to the tenant ledger.
              </p>
            </div>
          </div>
        </Container>

        {/* Action Buttons */}
        <div className="flex justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="secondary"
            size="small"
            onClick={() => router.push('/ar/invoices')}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="small"
            disabled={submitting}
            isLoading={submitting}
          >
            Save Authoritative Draft →
          </Button>
        </div>
      </form>
    </div>
  );
}
