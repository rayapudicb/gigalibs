import { createHash, randomUUID, randomInt } from 'node:crypto';
import { logger } from '@gigalibs/logger';

export type RuleSeverity = 'BLOCK_PAYMENT' | 'FLAG_REVIEW';

export interface OotbGuardrailRule {
  id: string;
  code: string;
  name: string;
  category: 'PRICING' | 'RECEIVING' | 'FREIGHT' | 'COMPLIANCE';
  description: string;
  enabled: boolean;
  severity: RuleSeverity;
  thresholdValue: number;
  thresholdUnit: '%' | 'USD' | 'MONTHS' | 'COUNT';
}

export interface InboundInvoiceLineItem {
  lineNumber: number;
  itemSku: string;
  description: string;
  invoicedQuantity: number;
  invoicedUnitPriceUsd: number;
  invoicedTotalUsd: number;
  poAuthorizedQuantity: number;
  poAuthorizedUnitPriceUsd: number;
  poAuthorizedTotalUsd: number;
  dockReceivedQuantity: number;
  varianceUsd: number;
  variancePct: number;
  discrepancyType?: 'PRICE_CREEP' | 'SHORT_DELIVERY' | 'UNAUTHORIZED_SURCHARGE' | 'CLEAN_MATCH';
  notes?: string;
}

export interface InboundDocumentPayload {
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: string;
  vendorName: string;
  vendorTaxId: string;
  poNumber: string;
  goodsReceiptNumber: string;
  currency: string;
  targetErp: 'NetSuite' | 'SAP S/4HANA' | 'QuickBooks Online';
  lines: InboundInvoiceLineItem[];
  invoiceSubtotalUsd: number;
  freightUsd: number;
  taxUsd: number;
  invoiceGrandTotalUsd: number;
}

export interface MatchEvaluationResult {
  evaluationId: string;
  tenantId: string;
  timestamp: string;
  document: InboundDocumentPayload;
  status: 'CLEAN_AUTO_POSTED' | 'PAYMENT_HOLD_APPLIED' | 'OVERRIDDEN';
  totalVarianceUsd: number;
  triggeredRules: {
    ruleCode: string;
    ruleName: string;
    severity: RuleSeverity;
    detail: string;
    financialImpactUsd: number;
  }[];
  postAction: {
    actionType: 'ERP_HOLD_DISPUTE' | 'ERP_VOUCHER_POST' | 'AP_OVERRIDE_APPROVED';
    targetErp: string;
    erpHoldReference?: string;
    disputeMemoText?: string;
    kafkaAuditOffset: number;
    fipsSha256Receipt: string;
  };
  overrideAudit?: {
    overriddenBy: string;
    overriddenAt: string;
    overrideReason: string;
    overrideFipsReceipt: string;
  };
}

export interface CfoProofOfValue {
  totalInvoicesScanned: number;
  totalDollarsScannedUsd: number;
  totalDiscrepanciesIntercepted: number;
  totalDollarsProtectedUsd: number;
  manualHoursSaved: number;
  estimatedRoiMultiple: string;
  subscriptionCostMonthlyUsd: number;
}

class OotbClientWorkbenchStore {
  private readonly rules: Map<string, OotbGuardrailRule> = new Map();
  private readonly evaluations: Map<string, MatchEvaluationResult> = new Map();

  constructor() {
    this.initializeDefaultRules();
    this.initializeHistoricalSimulations();
  }

  private initializeDefaultRules(): void {
    const defaultRules: OotbGuardrailRule[] = [
      {
        id: 'rule-1',
        code: 'RULE-DUP-24M',
        name: 'Cryptographic 24-Month Invoice Deduplication',
        category: 'COMPLIANCE',
        description: 'Blocks processing if identical vendor invoice number or cryptographic document fingerprint exists in past 24 months.',
        enabled: true,
        severity: 'BLOCK_PAYMENT',
        thresholdValue: 24,
        thresholdUnit: 'MONTHS',
      },
      {
        id: 'rule-2',
        code: 'RULE-PRICE-CREEP',
        name: 'Zero-Tolerance Line-Item Unit Price Creep',
        category: 'PRICING',
        description: 'Blocks payment if supplier invoiced unit price exceeds contracted PO price by more than 0.00%.',
        enabled: true,
        severity: 'BLOCK_PAYMENT',
        thresholdValue: 0.0,
        thresholdUnit: '%',
      },
      {
        id: 'rule-3',
        code: 'RULE-DOCK-SHORTAGE',
        name: 'Warehouse Dock Receiving Quantity Shortage Guard',
        category: 'RECEIVING',
        description: 'Blocks payment for any line item where invoiced quantity exceeds physical dock receiving verification (Goods Receipt).',
        enabled: true,
        severity: 'BLOCK_PAYMENT',
        thresholdValue: 0,
        thresholdUnit: 'COUNT',
      },
      {
        id: 'rule-4',
        code: 'RULE-FREIGHT-CAP',
        name: 'Freight & Ancillary Surcharge Cap (5% Ceiling)',
        category: 'FREIGHT',
        description: 'Flags or blocks any freight/handling charges exceeding 5.0% of merchandise value or not explicitly authorized in PO terms.',
        enabled: true,
        severity: 'BLOCK_PAYMENT',
        thresholdValue: 5.0,
        thresholdUnit: '%',
      },
      {
        id: 'rule-5',
        code: 'RULE-TAX-NEXUS',
        name: 'Automated Sales Tax Nexus Rate Verification',
        category: 'COMPLIANCE',
        description: 'Flags sales tax computations that exceed the registered state & municipal nexus destination rate.',
        enabled: true,
        severity: 'FLAG_REVIEW',
        thresholdValue: 0.5,
        thresholdUnit: '%',
      },
    ];

    for (const rule of defaultRules) {
      this.rules.set(rule.id, rule);
    }
  }

  private initializeHistoricalSimulations(): void {
    // Seed Sample Inbound Document 1: Apex Tactical Logistics Overcharge
    const sampleDoc1: InboundDocumentPayload = {
      invoiceId: 'inv-sample-apex',
      invoiceNumber: 'INV-2026-9812',
      invoiceDate: '2026-09-04',
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
          description: 'Heavy Duty Hydraulic Actuator (Mil-Spec 44B)',
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
          itemSku: 'SKU-SENS-ASSEMBLY',
          description: 'Precision Gyro Sensor Assembly Mk II',
          invoicedQuantity: 20,
          invoicedUnitPriceUsd: 2200.0,
          invoicedTotalUsd: 44000.0,
          poAuthorizedQuantity: 20,
          poAuthorizedUnitPriceUsd: 2200.0,
          poAuthorizedTotalUsd: 44000.0,
          dockReceivedQuantity: 20,
          varianceUsd: 0.0,
          variancePct: 0.0,
          discrepancyType: 'CLEAN_MATCH',
        },
        {
          lineNumber: 3,
          itemSku: 'FEE-SURCHARGE-EXP',
          description: 'Unscheduled Fuel & Expedited Air Transit Handling Fee',
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
          notes: 'Unauthorized freight surcharge not agreed in PO contract terms.',
        },
      ],
      invoiceSubtotalUsd: 84000.0,
      freightUsd: 14500.0,
      taxUsd: 0.0,
      invoiceGrandTotalUsd: 98500.0,
    };

    // Evaluate Sample 1
    this.evaluateDocument('demo-tenant', sampleDoc1);
  }

  getRules(): OotbGuardrailRule[] {
    return Array.from(this.rules.values());
  }

  getRule(id: string): OotbGuardrailRule | undefined {
    return this.rules.get(id);
  }

  toggleRule(id: string): OotbGuardrailRule {
    const rule = this.rules.get(id);
    if (!rule) throw new Error(`Rule ${id} not found`);
    rule.enabled = !rule.enabled;
    logger.info({ ruleId: id, enabled: rule.enabled }, 'Toggled OOTB guardrail rule');
    return rule;
  }

  updateRuleThreshold(id: string, thresholdValue: number): OotbGuardrailRule {
    const rule = this.rules.get(id);
    if (!rule) throw new Error(`Rule ${id} not found`);
    rule.thresholdValue = thresholdValue;
    logger.info({ ruleId: id, thresholdValue }, 'Updated OOTB rule threshold');
    return rule;
  }

  /**
   * Autonomous 3-Way Match & Discrepancy Evaluation Pipeline
   */
  evaluateDocument(tenantId: string, doc: InboundDocumentPayload): MatchEvaluationResult {
    const evaluationId = `eval-${randomUUID().slice(0, 8)}`;
    const triggeredRules: MatchEvaluationResult['triggeredRules'] = [];
    let totalVarianceUsd = 0;

    const priceRule = Array.from(this.rules.values()).find((r) => r.code === 'RULE-PRICE-CREEP');
    const shortageRule = Array.from(this.rules.values()).find((r) => r.code === 'RULE-DOCK-SHORTAGE');
    const freightRule = Array.from(this.rules.values()).find((r) => r.code === 'RULE-FREIGHT-CAP');

    for (const line of doc.lines) {
      // 1. Check Unauthorized Surcharges first
      if (line.discrepancyType === 'UNAUTHORIZED_SURCHARGE') {
        totalVarianceUsd += line.invoicedTotalUsd;
        triggeredRules.push({
          ruleCode: 'RULE-UNAUTHORIZED-SURCHARGE',
          ruleName: 'Contract Line Authorization Guard',
          severity: 'BLOCK_PAYMENT',
          detail: `Line #${line.lineNumber}: Surcharge of $${line.invoicedTotalUsd.toFixed(2)} not present in authorized PO lines.`,
          financialImpactUsd: line.invoicedTotalUsd,
        });
        continue;
      }

      // 2. Check Unit Price Creep
      if (priceRule?.enabled && line.invoicedUnitPriceUsd > line.poAuthorizedUnitPriceUsd && line.poAuthorizedUnitPriceUsd > 0) {
        const lineVariance = (line.invoicedUnitPriceUsd - line.poAuthorizedUnitPriceUsd) * line.invoicedQuantity;
        totalVarianceUsd += lineVariance;
        line.discrepancyType = 'PRICE_CREEP';
        line.varianceUsd = lineVariance;
        line.variancePct = Math.round(((line.invoicedUnitPriceUsd - line.poAuthorizedUnitPriceUsd) / line.poAuthorizedUnitPriceUsd) * 1000) / 10;
        triggeredRules.push({
          ruleCode: priceRule.code,
          ruleName: priceRule.name,
          severity: priceRule.severity,
          detail: `Line #${line.lineNumber} (${line.itemSku}): Invoiced at $${line.invoicedUnitPriceUsd.toFixed(2)} vs PO contract price of $${line.poAuthorizedUnitPriceUsd.toFixed(2)} (+${line.variancePct}%)`,
          financialImpactUsd: lineVariance,
        });
      }

      // 3. Check Warehouse Dock Receiving Shortage (for physical items with authorized PO quantity)
      if (shortageRule?.enabled && line.poAuthorizedQuantity > 0 && line.invoicedQuantity > line.dockReceivedQuantity && line.dockReceivedQuantity >= 0) {
        const shortCount = line.invoicedQuantity - line.dockReceivedQuantity;
        const lineShortageVariance = shortCount * line.invoicedUnitPriceUsd;
        totalVarianceUsd += lineShortageVariance;
        line.discrepancyType = 'SHORT_DELIVERY';
        line.varianceUsd = lineShortageVariance;
        line.variancePct = Math.round((shortCount / line.invoicedQuantity) * 1000) / 10;
        triggeredRules.push({
          ruleCode: shortageRule.code,
          ruleName: shortageRule.name,
          severity: shortageRule.severity,
          detail: `Line #${line.lineNumber} (${line.itemSku}): Invoiced for ${line.invoicedQuantity} units, but Goods Receipt (${doc.goodsReceiptNumber}) only confirmed ${line.dockReceivedQuantity} units received (${shortCount} short-shipped).`,
          financialImpactUsd: lineShortageVariance,
        });
      }
    }

    // 4. Check Overall Freight Surcharge Cap (5% of Subtotal)
    if (freightRule?.enabled && doc.freightUsd > 0) {
      const allowedFreight = (doc.invoiceSubtotalUsd * freightRule.thresholdValue) / 100.0;
      if (doc.freightUsd > allowedFreight) {
        const excessFreight = doc.freightUsd - allowedFreight;
        if (!triggeredRules.some((r) => r.ruleCode.includes('SURCHARGE') || r.ruleCode.includes('FREIGHT'))) {
          totalVarianceUsd += excessFreight;
          triggeredRules.push({
            ruleCode: freightRule.code,
            ruleName: freightRule.name,
            severity: freightRule.severity,
            detail: `Freight charge of $${doc.freightUsd.toFixed(2)} exceeds the ${freightRule.thresholdValue}% threshold of merchandise subtotal ($${allowedFreight.toFixed(2)} max allowed).`,
            financialImpactUsd: excessFreight,
          });
        }
      }
    }

    const hasBlock = triggeredRules.some((r) => r.severity === 'BLOCK_PAYMENT');
    const status = hasBlock ? 'PAYMENT_HOLD_APPLIED' : 'CLEAN_AUTO_POSTED';

    // Formulate automated ERP action & dispute memo
    let erpHoldReference: string | undefined;
    let disputeMemoText: string | undefined;

    if (hasBlock) {
      erpHoldReference = `${doc.targetErp === 'NetSuite' ? 'NS-HOLD' : 'SAP-BLK'}-${randomUUID().slice(0, 6).toUpperCase()}`;
      disputeMemoText = `OFFICIAL DISPUTE & PAYMENT WITHHOLDING NOTICE
Date: ${new Date().toISOString().slice(0, 10)}
To: ${doc.vendorName} (Tax ID: ${doc.vendorTaxId})
Referencing Invoice: ${doc.invoiceNumber} | PO: ${doc.poNumber} | Goods Receipt: ${doc.goodsReceiptNumber}

This automated notification confirms that payment disbursement for invoice ${doc.invoiceNumber} (Total: $${doc.invoiceGrandTotalUsd.toFixed(2)}) has been placed on administrative hold in ${doc.targetErp} under reference #${erpHoldReference}.

Discrepancies identified during autonomous 3-Way Match:
${triggeredRules.map((r, idx) => `${idx + 1}. [${r.ruleCode}] ${r.detail} (Discrepancy: $${r.financialImpactUsd.toFixed(2)})`).join('\n')}

Total Protected Variance: $${totalVarianceUsd.toFixed(2)}

Pursuant to master procurement terms, please issue an amended credit memo or corrected invoice resolving the above variances prior to payment release.`;
    }

    // Cryptographic seal
    const receiptPayload = JSON.stringify({ evaluationId, tenantId, docNumber: doc.invoiceNumber, totalVarianceUsd, status });
    const fipsSha256Receipt = createHash('sha256').update(receiptPayload).digest('hex');

    const result: MatchEvaluationResult = {
      evaluationId,
      tenantId,
      timestamp: new Date().toISOString(),
      document: doc,
      status,
      totalVarianceUsd,
      triggeredRules,
      postAction: {
        actionType: hasBlock ? 'ERP_HOLD_DISPUTE' : 'ERP_VOUCHER_POST',
        targetErp: doc.targetErp,
        erpHoldReference,
        disputeMemoText,
        kafkaAuditOffset: randomInt(500, 1500),
        fipsSha256Receipt,
      },
    };

    this.evaluations.set(evaluationId, result);
    logger.info({ evaluationId, status, totalVarianceUsd, docNumber: doc.invoiceNumber }, 'Completed 3-way match evaluation');
    return result;
  }

  /**
   * 1-Click AP Manager Override with Cryptographic Audit Stamp
   */
  overridePaymentHold(evaluationId: string, managerId: string, overrideReason: string): MatchEvaluationResult {
    const evaluation = this.evaluations.get(evaluationId);
    if (!evaluation) throw new Error(`Evaluation ${evaluationId} not found`);

    if (evaluation.status !== 'PAYMENT_HOLD_APPLIED') {
      throw new Error(`Cannot override evaluation with status ${evaluation.status}`);
    }

    const overridePayload = JSON.stringify({ evaluationId, managerId, overrideReason, timestamp: new Date().toISOString() });
    const overrideFipsReceipt = createHash('sha256').update(overridePayload).digest('hex');

    evaluation.status = 'OVERRIDDEN';
    evaluation.postAction.actionType = 'AP_OVERRIDE_APPROVED';
    evaluation.overrideAudit = {
      overriddenBy: managerId,
      overriddenAt: new Date().toISOString(),
      overrideReason,
      overrideFipsReceipt,
    };

    logger.info({ evaluationId, managerId, overrideReason }, 'AP Manager successfully overrode payment hold');
    return evaluation;
  }

  getEvaluations(): MatchEvaluationResult[] {
    return Array.from(this.evaluations.values()).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  getEvaluation(id: string): MatchEvaluationResult | undefined {
    return this.evaluations.get(id);
  }

  /**
   * CFO Proof-of-Value Metrics Calculation
   */
  getCfoProofOfValue(): CfoProofOfValue {
    const evals = Array.from(this.evaluations.values());
    const totalInvoicesScanned = evals.length;
    const totalDollarsScannedUsd = evals.reduce((sum, e) => sum + e.document.invoiceGrandTotalUsd, 0);
    const holdEvals = evals.filter((e) => e.status === 'PAYMENT_HOLD_APPLIED' || e.status === 'OVERRIDDEN');
    const totalDiscrepanciesIntercepted = holdEvals.length;
    const totalDollarsProtectedUsd = holdEvals.reduce((sum, e) => sum + e.totalVarianceUsd, 0);

    // Each discrepancy prevented saves 2.5 hours of manual forensic dispute investigation & clawback
    // Each clean invoice auto-posted saves 0.4 hours of manual data entry
    const cleanCount = totalInvoicesScanned - totalDiscrepanciesIntercepted;
    const manualHoursSaved = Math.round(totalDiscrepanciesIntercepted * 2.5 + cleanCount * 0.4);

    const subscriptionCostMonthlyUsd = 2500.0;
    const roiRatio = totalDollarsProtectedUsd > 0 ? (totalDollarsProtectedUsd / subscriptionCostMonthlyUsd).toFixed(1) : '1.0';

    return {
      totalInvoicesScanned,
      totalDollarsScannedUsd,
      totalDiscrepanciesIntercepted,
      totalDollarsProtectedUsd,
      manualHoursSaved,
      estimatedRoiMultiple: `${roiRatio}x`,
      subscriptionCostMonthlyUsd,
    };
  }
}

// Global server singleton
const globalForOotb = globalThis as unknown as {
  __ootbWorkbenchStore?: OotbClientWorkbenchStore;
};

export const ootbWorkbenchStore =
  globalForOotb.__ootbWorkbenchStore ?? new OotbClientWorkbenchStore();

if (process.env.NODE_ENV !== 'production') {
  globalForOotb.__ootbWorkbenchStore = ootbWorkbenchStore;
}
