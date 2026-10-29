'use client';

import {
  LANDED_COST_ALLOCATION_BASES,
  landedCostBasisMetric,
  type InventoryCostLayerV1,
  type InventoryReceiptCostRecordV1,
  type LandedCostAllocationBasis,
  type LandedCostReceiptLineCandidateV1,
  type PreviewLandedCostResultV1,
} from '@gigalibs/contracts';
import { useCallback, useEffect, useMemo, useState } from 'react';

const FINANCE_PATH = '/api/financial-operations';
const INVENTORY_PATH = '/api/universal-inventory';
const PROCUREMENT_PATH = '/api/universal-procurement';

type WizardStep = 1 | 2 | 3;

type LayerDraft = {
  costLayerId: string;
  productId: string;
  quantity: string;
  valueMinor: string;
  weightKg: string;
  volumeM3: string;
  layerRemainingQuantity: string;
  currentUnitCostScaled: string;
  receiptLabel: string;
};

export function LandedCostWizardPanel() {
  const [step, setStep] = useState<WizardStep>(1);
  const [voucherNumber, setVoucherNumber] = useState('');
  const [totalFreightDollars, setTotalFreightDollars] = useState('3000');
  const [basis, setBasis] = useState<LandedCostAllocationBasis>('QUANTITY');
  const [currencyCode] = useState('USD');
  const [layers, setLayers] = useState<LayerDraft[]>([]);
  const [eligibleRows, setEligibleRows] = useState<LayerDraft[]>([]);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [preview, setPreview] = useState<PreviewLandedCostResultV1 | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [postedVoucher, setPostedVoucher] = useState<string | null>(null);

  const totalLandedCostMinor = useMemo(() => {
    const dollars = Number.parseFloat(totalFreightDollars.replace(/,/g, ''));
    if (!Number.isFinite(dollars) || dollars < 0) return '0';
    return String(Math.round(dollars * 100));
  }, [totalFreightDollars]);

  const loadEligibleLayers = useCallback(async () => {
    setLoadState('loading');
    setError(null);
    try {
      const [procRes, invRes] = await Promise.all([
        fetch(`${PROCUREMENT_PATH}/v1/landed-cost/receipt-lines`, { credentials: 'include' }),
        fetch(`${INVENTORY_PATH}/v1/posted-receipt-costs`, { credentials: 'include' }),
      ]);
      if (!procRes.ok || !invRes.ok) {
        throw new Error('Could not load receipt lines from Procurement or Inventory.');
      }
      const procurementLines = (await procRes.json()) as LandedCostReceiptLineCandidateV1[];
      const costRecords = (await invRes.json()) as InventoryReceiptCostRecordV1[];
      const costByLine = new Map(costRecords.map((row) => [row.receiptLineId, row]));
      const layerIds = [...new Set(costRecords.map((row) => row.financeCostLayerId))];
      let financeLayers: InventoryCostLayerV1[] = [];
      if (layerIds.length > 0) {
        const finRes = await fetch(
          `${FINANCE_PATH}/v1/costing/cost-layers?ids=${encodeURIComponent(layerIds.join(','))}`,
          { credentials: 'include' },
        );
        if (finRes.ok) {
          financeLayers = (await finRes.json()) as InventoryCostLayerV1[];
        }
      }
      const financeByLayer = new Map(financeLayers.map((layer) => [layer.id, layer]));

      const merged: LayerDraft[] = [];
      for (const proc of procurementLines) {
        const cost = costByLine.get(proc.receiptLineId);
        if (!cost) continue;
        const finance = financeByLayer.get(cost.financeCostLayerId);
        merged.push({
          costLayerId: cost.financeCostLayerId,
          productId: cost.productId,
          quantity: proc.receivedQuantity,
          valueMinor: cost.totalCostMinor,
          weightKg: '0',
          volumeM3: '0',
          layerRemainingQuantity: finance?.remainingQuantity ?? proc.receivedQuantity,
          currentUnitCostScaled: finance?.unitCostScaled ?? cost.unitCostScaled,
          receiptLabel: `${proc.receiptNumber} · ${proc.receivedQuantity} units`,
        });
      }
      if (merged.length === 0) {
        for (const cost of costRecords) {
          const finance = financeByLayer.get(cost.financeCostLayerId);
          merged.push({
            costLayerId: cost.financeCostLayerId,
            productId: cost.productId,
            quantity: cost.quantity,
            valueMinor: cost.totalCostMinor,
            weightKg: '0',
            volumeM3: '0',
            layerRemainingQuantity: finance?.remainingQuantity ?? cost.quantity,
            currentUnitCostScaled: finance?.unitCostScaled ?? cost.unitCostScaled,
            receiptLabel: `Receipt line ${cost.receiptLineId.slice(0, 8)}…`,
          });
        }
      }
      setEligibleRows(merged);
      setLayers(merged.length > 0 ? [merged[0]!] : []);
      setLoadState('ready');
    } catch (e) {
      setLoadState('error');
      setError(e instanceof Error ? e.message : 'Failed to load receipt layers');
    }
  }, []);

  useEffect(() => {
    if (step === 2 && loadState === 'idle') {
      void loadEligibleLayers();
    }
  }, [step, loadState, loadEligibleLayers]);

  const toggleLayer = useCallback((costLayerId: string, selected: boolean) => {
    setLayers((prev) => {
      const row = eligibleRows.find((r) => r.costLayerId === costLayerId);
      if (!row) return prev;
      if (selected) {
        if (prev.some((p) => p.costLayerId === costLayerId)) return prev;
        return [...prev, row];
      }
      return prev.filter((p) => p.costLayerId !== costLayerId);
    });
  }, [eligibleRows]);

  const buildPreviewPayload = useCallback(() => {
    return {
      totalLandedCostMinor,
      receiptLayerAllocations: layers.map((layer) => ({
        costLayerId: layer.costLayerId,
        productId: layer.productId,
        basisMetric: landedCostBasisMetric(basis, {
          quantity: layer.quantity,
          valueMinor: layer.valueMinor,
          weightKg: layer.weightKg,
          volumeM3: layer.volumeM3,
        }),
        layerRemainingQuantity: layer.layerRemainingQuantity,
        currentUnitCostScaled: layer.currentUnitCostScaled,
      })),
    };
  }, [basis, layers, totalLandedCostMinor]);

  const runPreview = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const response = await fetch(`${FINANCE_PATH}/v1/costing/landed-costs/preview`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(buildPreviewPayload()),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Preview failed (${response.status})`);
      }
      setPreview((await response.json()) as PreviewLandedCostResultV1);
      setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Preview failed');
    } finally {
      setBusy(false);
    }
  }, [buildPreviewPayload]);

  const postVoucher = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const body = {
        voucherNumber: voucherNumber.trim(),
        description: 'Procurement landed cost wizard',
        allocationBasis: basis,
        totalLandedCostMinor,
        currencyCode,
        postGlJournal: false,
        receiptLayerAllocations: layers.map((layer) => ({
          costLayerId: layer.costLayerId,
          basisMetric: landedCostBasisMetric(basis, {
            quantity: layer.quantity,
            valueMinor: layer.valueMinor,
            weightKg: layer.weightKg,
            volumeM3: layer.volumeM3,
          }),
        })),
      };
      const response = await fetch(`${FINANCE_PATH}/v1/costing/landed-costs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Post failed (${response.status})`);
      }
      const result = (await response.json()) as { voucherNumber?: string; id?: string };
      setPostedVoucher(result.voucherNumber ?? result.id ?? voucherNumber);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Post failed');
    } finally {
      setBusy(false);
    }
  }, [basis, currencyCode, layers, totalLandedCostMinor, voucherNumber]);

  return (
    <section className="space-y-4 rounded-lg border border-ui-border-base bg-ui-bg-base p-4">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold text-ui-fg-base">Landed cost allocation</h2>
        <p className="text-sm text-ui-fg-subtle">
          Freight voucher, then receipt lines from Procurement + Finance-posted costs, then impact preview.
        </p>
      </header>

      <ol className="flex gap-2 text-xs font-medium uppercase tracking-wide text-ui-fg-muted">
        {[1, 2, 3].map((n) => (
          <li
            key={n}
            className={`rounded-full px-3 py-1 ${step === n ? 'bg-ui-bg-subtle text-ui-fg-base' : ''}`}
          >
            Step {n}
          </li>
        ))}
      </ol>

      {error ? (
        <p role="alert" className="text-sm text-ui-fg-error">
          {error}
        </p>
      ) : null}
      {postedVoucher ? (
        <p className="text-sm text-ui-fg-base">Posted landed cost voucher {postedVoucher}.</p>
      ) : null}

      {step === 1 ? (
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-sm">
            <span className="text-ui-fg-subtle">Voucher number</span>
            <input
              className="mt-1 w-full rounded-md border border-ui-border-base px-3 py-2 text-sm"
              value={voucherNumber}
              onChange={(e) => setVoucherNumber(e.target.value)}
              placeholder="LC-2026-001"
            />
          </label>
          <label className="block text-sm">
            <span className="text-ui-fg-subtle">Total freight (USD)</span>
            <input
              className="mt-1 w-full rounded-md border border-ui-border-base px-3 py-2 text-sm"
              value={totalFreightDollars}
              onChange={(e) => setTotalFreightDollars(e.target.value)}
            />
          </label>
          <label className="block text-sm md:col-span-2">
            <span className="text-ui-fg-subtle">Allocation basis</span>
            <select
              className="mt-1 w-full rounded-md border border-ui-border-base px-3 py-2 text-sm"
              value={basis}
              onChange={(e) => setBasis(e.target.value as LandedCostAllocationBasis)}
            >
              {LANDED_COST_ALLOCATION_BASES.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={!voucherNumber.trim()}
            className="rounded-md bg-ui-button-inverted px-4 py-2 text-sm font-medium text-ui-fg-on-inverted disabled:opacity-50 md:col-span-2"
            onClick={() => setStep(2)}
          >
            Continue to receipt layers
          </button>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-3">
          {loadState === 'loading' ? <p className="text-sm text-ui-fg-muted">Loading posted receipt costs…</p> : null}
          {loadState === 'ready' && eligibleRows.length === 0 ? (
            <p className="text-sm text-ui-fg-muted">No Finance-posted receipt costs are available yet.</p>
          ) : null}
          {eligibleRows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-ui-border-base text-ui-fg-muted">
                    <th className="py-2 pr-4">Include</th>
                    <th className="py-2 pr-4">Receipt</th>
                    <th className="py-2 pr-4">Remaining qty</th>
                    <th className="py-2">Unit cost (scaled)</th>
                  </tr>
                </thead>
                <tbody>
                  {eligibleRows.map((row) => {
                    const checked = layers.some((l) => l.costLayerId === row.costLayerId);
                    return (
                      <tr key={row.costLayerId} className="border-b border-ui-border-base">
                        <td className="py-2 pr-4">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => toggleLayer(row.costLayerId, e.target.checked)}
                          />
                        </td>
                        <td className="py-2 pr-4">{row.receiptLabel}</td>
                        <td className="py-2 pr-4">{row.layerRemainingQuantity}</td>
                        <td className="py-2 font-mono text-xs">{row.currentUnitCostScaled}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="rounded-md border px-3 py-2 text-sm" onClick={() => setStep(1)}>
              Back
            </button>
            <button
              type="button"
              className="rounded-md border px-3 py-2 text-sm"
              onClick={() => {
                setLoadState('idle');
                void loadEligibleLayers();
              }}
            >
              Refresh
            </button>
            <button
              type="button"
              disabled={busy || layers.length === 0}
              className="rounded-md bg-ui-button-inverted px-4 py-2 text-sm font-medium text-ui-fg-on-inverted disabled:opacity-50"
              onClick={() => void runPreview()}
            >
              {busy ? 'Calculating…' : 'Preview allocation'}
            </button>
          </div>
        </div>
      ) : null}

      {step === 3 && preview ? (
        <div className="space-y-3">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-ui-border-base text-ui-fg-muted">
                  <th className="py-2 pr-4">Layer</th>
                  <th className="py-2 pr-4">Original → Adjusted (scaled)</th>
                  <th className="py-2 pr-4">Landed add (minor)</th>
                  <th className="py-2">Increase (scaled)</th>
                </tr>
              </thead>
              <tbody>
                {preview.lines.map((line) => (
                  <tr key={line.costLayerId} className="border-b border-ui-border-base">
                    <td className="py-2 pr-4 font-mono text-xs">{line.costLayerId.slice(0, 8)}…</td>
                    <td className="py-2 pr-4">
                      {line.priorUnitCostScaled} → {line.adjustedUnitCostScaled}
                    </td>
                    <td className="py-2 pr-4">{line.apportionedAmountMinor}</td>
                    <td className="py-2">{line.unitCostIncreaseScaled}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="rounded-md border px-3 py-2 text-sm" onClick={() => setStep(2)}>
              Back
            </button>
            <button
              type="button"
              disabled={busy || Boolean(postedVoucher)}
              className="rounded-md bg-ui-button-inverted px-4 py-2 text-sm font-medium text-ui-fg-on-inverted disabled:opacity-50"
              onClick={() => void postVoucher()}
            >
              {busy ? 'Posting…' : 'Post to Finance'}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
