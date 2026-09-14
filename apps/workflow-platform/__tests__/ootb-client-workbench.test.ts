import { describe, it, expect } from 'vitest';
import { ootbWorkbenchStore, InboundDocumentPayload } from '../lib/ootb-client-workbench-store';

describe('OOTB Client Workbench & 3-Way Match Engine', () => {
  it('loads pre-configured guardrail rules on initialization', () => {
    const rules = ootbWorkbenchStore.getRules();
    expect(rules.length).toBeGreaterThanOrEqual(5);

    const codes = rules.map((r) => r.code);
    expect(codes).toContain('RULE-DUP-24M');
    expect(codes).toContain('RULE-PRICE-CREEP');
    expect(codes).toContain('RULE-DOCK-SHORTAGE');
    expect(codes).toContain('RULE-FREIGHT-CAP');
    expect(codes).toContain('RULE-TAX-NEXUS');
  });

  it('allows zero-code toggling and threshold updates for guardrail rules', () => {
    const rules = ootbWorkbenchStore.getRules();
    const freightRule = rules.find((r) => r.code === 'RULE-FREIGHT-CAP')!;

    const initialState = freightRule.enabled;
    const toggled = ootbWorkbenchStore.toggleRule(freightRule.id);
    expect(toggled.enabled).toBe(!initialState);

    // Toggle back
    const restored = ootbWorkbenchStore.toggleRule(freightRule.id);
    expect(restored.enabled).toBe(initialState);

    // Update threshold
    const updated = ootbWorkbenchStore.updateRuleThreshold(freightRule.id, 8.0);
    expect(updated.thresholdValue).toBe(8.0);

    // Restore threshold
    ootbWorkbenchStore.updateRuleThreshold(freightRule.id, 5.0);
  });

  it('intercepts freight surcharge overcharge and places automated ERP payment hold', () => {
    const testDoc: InboundDocumentPayload = {
      invoiceId: 'test-inv-001',
      invoiceNumber: 'INV-TEST-001',
      invoiceDate: '2026-09-06',
      vendorName: 'Apex Tactical Logistics LLC',
      vendorTaxId: 'US-EIN-88492019',
      poNumber: 'PO-2026-4401',
      goodsReceiptNumber: 'GR-WMS-88912',
      currency: 'USD',
      targetErp: 'NetSuite',
      lines: [
        {
          lineNumber: 1,
          itemSku: 'SKU-HYDR-ACTUATOR',
          description: 'Heavy Duty Hydraulic Actuator',
          invoicedQuantity: 10,
          invoicedUnitPriceUsd: 4000.0,
          invoicedTotalUsd: 40000.0,
          poAuthorizedQuantity: 10,
          poAuthorizedUnitPriceUsd: 4000.0,
          poAuthorizedTotalUsd: 40000.0,
          dockReceivedQuantity: 10,
          varianceUsd: 0.0,
          variancePct: 0.0,
          discrepancyType: 'CLEAN_MATCH',
        },
        {
          lineNumber: 2,
          itemSku: 'FEE-SURCHARGE-EXP',
          description: 'Unauthorized Handling Fee',
          invoicedQuantity: 1,
          invoicedUnitPriceUsd: 14500.0,
          invoicedTotalUsd: 14500.0,
          poAuthorizedQuantity: 0,
          poAuthorizedUnitPriceUsd: 0.0,
          poAuthorizedTotalUsd: 0.0,
          dockReceivedQuantity: 0,
          varianceUsd: 14500.0,
          variancePct: 100.0,
          discrepancyType: 'UNAUTHORIZED_SURCHARGE',
        },
      ],
      invoiceSubtotalUsd: 40000.0,
      freightUsd: 14500.0,
      taxUsd: 0.0,
      invoiceGrandTotalUsd: 54500.0,
    };

    const result = ootbWorkbenchStore.evaluateDocument('test-tenant', testDoc);

    expect(result.status).toBe('PAYMENT_HOLD_APPLIED');
    expect(result.totalVarianceUsd).toBe(14500.0);
    expect(result.postAction.actionType).toBe('ERP_HOLD_DISPUTE');
    expect(result.postAction.erpHoldReference).toMatch(/^NS-HOLD-/);
    expect(result.postAction.disputeMemoText).toContain('OFFICIAL DISPUTE & PAYMENT WITHHOLDING NOTICE');
    expect(result.postAction.disputeMemoText).toContain('INV-TEST-001');
    expect(result.postAction.fipsSha256Receipt.length).toBe(64);
  });

  it('detects warehouse dock physical shortages and blocks unreceived quantities', () => {
    const testDoc: InboundDocumentPayload = {
      invoiceId: 'test-inv-002',
      invoiceNumber: 'INV-TEST-002',
      invoiceDate: '2026-09-06',
      vendorName: 'Delta Precision Instruments Corp',
      vendorTaxId: 'US-EIN-41908234',
      poNumber: 'PO-2026-7800',
      goodsReceiptNumber: 'GR-WMS-90114',
      currency: 'USD',
      targetErp: 'SAP S/4HANA',
      lines: [
        {
          lineNumber: 1,
          itemSku: 'SKU-OPT-CALIB-01',
          description: 'Optical Calibration Sensor Module',
          invoicedQuantity: 500,
          invoicedUnitPriceUsd: 120.0,
          invoicedTotalUsd: 60000.0,
          poAuthorizedQuantity: 500,
          poAuthorizedUnitPriceUsd: 120.0,
          poAuthorizedTotalUsd: 60000.0,
          dockReceivedQuantity: 350, // 150 units short
          varianceUsd: 0,
          variancePct: 0,
          discrepancyType: 'CLEAN_MATCH',
        },
      ],
      invoiceSubtotalUsd: 60000.0,
      freightUsd: 0.0,
      taxUsd: 0.0,
      invoiceGrandTotalUsd: 60000.0,
    };

    const result = ootbWorkbenchStore.evaluateDocument('test-tenant', testDoc);

    expect(result.status).toBe('PAYMENT_HOLD_APPLIED');
    expect(result.totalVarianceUsd).toBe(18000.0); // 150 units * $120.00
    expect(result.triggeredRules.some((r) => r.ruleCode === 'RULE-DOCK-SHORTAGE')).toBe(true);
    expect(result.postAction.erpHoldReference).toMatch(/^SAP-BLK-/);
  });

  it('cleanly auto-posts matching invoices with zero variance', () => {
    const cleanDoc: InboundDocumentPayload = {
      invoiceId: 'test-inv-clean',
      invoiceNumber: 'INV-TEST-CLEAN',
      invoiceDate: '2026-09-06',
      vendorName: 'Vanguard Micro-Systems Inc',
      vendorTaxId: 'US-EIN-12903841',
      poNumber: 'PO-2026-8812',
      goodsReceiptNumber: 'GR-WMS-44190',
      currency: 'USD',
      targetErp: 'NetSuite',
      lines: [
        {
          lineNumber: 1,
          itemSku: 'SKU-MICRO-SOC-04',
          description: 'ARM Cortex Embedded Microcontroller SoCs',
          invoicedQuantity: 1000,
          invoicedUnitPriceUsd: 34.0,
          invoicedTotalUsd: 34000.0,
          poAuthorizedQuantity: 1000,
          poAuthorizedUnitPriceUsd: 34.0,
          poAuthorizedTotalUsd: 34000.0,
          dockReceivedQuantity: 1000,
          varianceUsd: 0.0,
          variancePct: 0.0,
          discrepancyType: 'CLEAN_MATCH',
        },
      ],
      invoiceSubtotalUsd: 34000.0,
      freightUsd: 0.0,
      taxUsd: 0.0,
      invoiceGrandTotalUsd: 34000.0,
    };

    const result = ootbWorkbenchStore.evaluateDocument('test-tenant', cleanDoc);

    expect(result.status).toBe('CLEAN_AUTO_POSTED');
    expect(result.totalVarianceUsd).toBe(0.0);
    expect(result.triggeredRules.length).toBe(0);
    expect(result.postAction.actionType).toBe('ERP_VOUCHER_POST');
    expect(result.postAction.erpHoldReference).toBeUndefined();
  });

  it('supports 1-click AP Manager override with cryptographic audit trail', () => {
    // Re-evaluate a hold
    const doc: InboundDocumentPayload = {
      invoiceId: 'test-inv-override',
      invoiceNumber: 'INV-TEST-OVERRIDE',
      invoiceDate: '2026-09-06',
      vendorName: 'Apex Tactical Logistics LLC',
      vendorTaxId: 'US-EIN-88492019',
      poNumber: 'PO-2026-4401',
      goodsReceiptNumber: 'GR-WMS-88912',
      currency: 'USD',
      targetErp: 'NetSuite',
      lines: [
        {
          lineNumber: 1,
          itemSku: 'FEE-SURCHARGE-EXP',
          description: 'Emergency Air Transit Fee',
          invoicedQuantity: 1,
          invoicedUnitPriceUsd: 5000.0,
          invoicedTotalUsd: 5000.0,
          poAuthorizedQuantity: 0,
          poAuthorizedUnitPriceUsd: 0.0,
          poAuthorizedTotalUsd: 0.0,
          dockReceivedQuantity: 0,
          varianceUsd: 5000.0,
          variancePct: 100.0,
          discrepancyType: 'UNAUTHORIZED_SURCHARGE',
        },
      ],
      invoiceSubtotalUsd: 0.0,
      freightUsd: 5000.0,
      taxUsd: 0.0,
      invoiceGrandTotalUsd: 5000.0,
    };

    const evalResult = ootbWorkbenchStore.evaluateDocument('test-tenant', doc);
    expect(evalResult.status).toBe('PAYMENT_HOLD_APPLIED');

    // Override the hold
    const overridden = ootbWorkbenchStore.overridePaymentHold(
      evalResult.evaluationId,
      'controller@gigalibs.client.com',
      'Approved emergency freight for mission-critical prototype delivery',
    );

    expect(overridden.status).toBe('OVERRIDDEN');
    expect(overridden.postAction.actionType).toBe('AP_OVERRIDE_APPROVED');
    expect(overridden.overrideAudit).toBeDefined();
    expect(overridden.overrideAudit?.overriddenBy).toBe('controller@gigalibs.client.com');
    expect(overridden.overrideAudit?.overrideReason).toContain('Approved emergency freight');
    expect(overridden.overrideAudit?.overrideFipsReceipt.length).toBe(64);
  });

  it('calculates CFO Proof-of-Value metrics and ROI multiple', () => {
    const cfo = ootbWorkbenchStore.getCfoProofOfValue();

    expect(cfo.totalInvoicesScanned).toBeGreaterThan(0);
    expect(cfo.totalDollarsProtectedUsd).toBeGreaterThan(0);
    expect(cfo.manualHoursSaved).toBeGreaterThan(0);
    expect(cfo.estimatedRoiMultiple).toMatch(/^[0-9.]+x$/);
    expect(cfo.subscriptionCostMonthlyUsd).toBe(2500.0);
  });
});
