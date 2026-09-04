import { createHash } from 'node:crypto';
import {
  ApActionPolicyDefinitionSchema,
  type ApMatchRuleDefinition,
  ApMatchRuleDefinitionSchema,
} from '@gigalibs/contracts';
import { type Prisma, prisma } from '@gigalibs/db';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
// biome-ignore lint/style/useImportType: NestJS needs the runtime constructor token for dependency injection.
import { ApPolicyService } from './ap-policy.service.js';
import { canonicalJson } from './operational-json.js';
import { resolveTenantId } from './tenant-resolver.js';

interface MatchFinding {
  code: string;
  severity: 'INFO' | 'WARNING' | 'BLOCKING';
  field: string;
  expected: string | null;
  actual: string | null;
  delta: string | null;
  explanation: string;
  evidenceRefs: string[];
  incomplete?: boolean;
}

const invoiceMatchInclude = {
  supplier: true,
  sourceEvent: {
    select: { eventId: true, correlationId: true, payloadHash: true, classification: true },
  },
  lines: { orderBy: { lineNumber: 'asc' } },
  purchaseOrder: {
    include: {
      supplier: true,
      sourceEvent: { select: { eventId: true, payloadHash: true } },
      lines: {
        include: {
          receiptLines: {
            include: {
              goodsReceipt: {
                include: { sourceEvent: { select: { eventId: true, payloadHash: true } } },
              },
            },
          },
        },
        orderBy: { lineNumber: 'asc' },
      },
    },
  },
} satisfies Prisma.SupplierInvoiceInclude;

type InvoiceForMatch = Prisma.SupplierInvoiceGetPayload<{ include: typeof invoiceMatchInclude }>;

@Injectable()
export class ApMatchingService {
  constructor(private readonly policyService: ApPolicyService) {}

  async evaluate(tenantId: string, supplierInvoiceId: string) {
    const resolvedTenantId = await resolveTenantId(tenantId);
    const invoice = await prisma.supplierInvoice.findFirst({
      where: { id: supplierInvoiceId, tenantId: resolvedTenantId },
      include: invoiceMatchInclude,
    });
    if (!invoice)
      throw new NotFoundException(`Supplier invoice '${supplierInvoiceId}' was not found.`);
    if (['APPROVED_FOR_PAYMENT', 'REJECTED'].includes(invoice.status)) {
      const latest = await prisma.apMatchEvaluation.findFirst({
        where: { supplierInvoiceId: invoice.id, tenantId: resolvedTenantId },
        include: { findings: true, evidenceBundle: { include: { items: true } } },
        orderBy: { evaluatedAt: 'desc' },
      });
      if (latest) return latest;
      throw new ConflictException(`Invoice cannot be evaluated from status ${invoice.status}.`);
    }

    const [{ version: matchVersion }, { version: actionVersion }] = await Promise.all([
      this.policyService.getActiveRule(resolvedTenantId, 'AP_THREE_WAY_MATCH'),
      this.policyService.getActiveRule(resolvedTenantId, 'AP_ACTION_POLICY'),
    ]);
    const matchPolicy = ApMatchRuleDefinitionSchema.parse(matchVersion.definition);
    const actionPolicy = ApActionPolicyDefinitionSchema.parse(actionVersion.definition);
    const inputSnapshot = this.buildInputSnapshot(invoice, matchVersion.checksum);
    const inputHash = createHash('sha256').update(canonicalJson(inputSnapshot)).digest('hex');

    const duplicate = await prisma.apMatchEvaluation.findUnique({
      where: { supplierInvoiceId_inputHash: { supplierInvoiceId, inputHash } },
      include: { findings: true, evidenceBundle: { include: { items: true } } },
    });
    if (duplicate) return duplicate;

    const findings = this.evaluateFindings(invoice, matchPolicy);
    const outcome = findings.some((finding) => finding.incomplete)
      ? 'INCOMPLETE'
      : findings.some((finding) => finding.severity === 'BLOCKING')
        ? 'MISMATCH'
        : 'MATCHED';
    const explanation = this.explain(outcome, findings);
    const evidence = this.buildEvidence(invoice, findings, matchVersion.checksum, explanation);

    try {
      return await prisma.$transaction(async (transaction) => {
        const evaluation = await transaction.apMatchEvaluation.create({
          data: {
            tenantId: resolvedTenantId,
            environmentId: invoice.environmentId,
            supplierInvoiceId: invoice.id,
            purchaseOrderId: invoice.purchaseOrderId,
            ruleVersionId: matchVersion.id,
            outcome,
            explanation,
            inputHash,
            findings: {
              create: findings.map((finding) => ({
                code: finding.code,
                severity: finding.severity,
                field: finding.field,
                expected: finding.expected,
                actual: finding.actual,
                delta: finding.delta,
                explanation: finding.explanation,
                evidenceRefs: finding.evidenceRefs,
              })),
            },
            evidenceBundle: {
              create: {
                tenantId: resolvedTenantId,
                environmentId: invoice.environmentId,
                correlationId: invoice.sourceEvent.correlationId,
                summary: explanation,
                contentHash: evidence.contentHash,
                items: { create: evidence.items },
              },
            },
          },
          include: { findings: true, evidenceBundle: { include: { items: true } } },
        });

        const actionStatus =
          BigInt(invoice.totalMinor.toString()) <= BigInt(actionPolicy.maxAmountMinor)
            ? 'PENDING_APPROVAL'
            : 'PROPOSED';
        const actionPreview = {
          effect: 'Set the supplier invoice status to APPROVED_FOR_PAYMENT in the AP ledger.',
          supplierInvoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          amountMinor: invoice.totalMinor.toString(),
          currency: invoice.currency,
          matchEvaluationId: evaluation.id,
          evidenceBundleId: evaluation.evidenceBundle?.id,
          blockedByAmountLimit: actionStatus === 'PROPOSED',
          maxAmountMinor: actionPolicy.maxAmountMinor,
          valueOutcomeKey: actionPolicy.valueOutcomeKey ?? null,
        };
        const actionInputHash = createHash('sha256')
          .update(canonicalJson(actionPreview))
          .digest('hex');
        const action =
          outcome === 'MATCHED'
            ? await transaction.businessAction.create({
                data: {
                  tenantId: resolvedTenantId,
                  environmentId: invoice.environmentId,
                  supplierInvoiceId: invoice.id,
                  policyRuleVersionId: actionVersion.id,
                  actionType: actionPolicy.actionType,
                  risk: actionPolicy.risk,
                  status: actionStatus,
                  requestedById: null,
                  idempotencyKey: `match:${evaluation.id}`,
                  preview: actionPreview,
                  parameters: { supplierInvoiceId: invoice.id },
                  inputHash: actionInputHash,
                  requiredApprovals: actionPolicy.requiredApprovals,
                },
              })
            : null;

        if (outcome === 'MATCHED') {
          await transaction.operationalException.updateMany({
            where: {
              tenantId: resolvedTenantId,
              supplierInvoiceId: invoice.id,
              status: { not: 'RESOLVED' },
              kind: { in: ['BUSINESS_MISMATCH', 'MISSING_EVIDENCE'] },
            },
            data: { status: 'RESOLVED', resolvedAt: new Date() },
          });
        } else {
          const rootFinding = findings.find((finding) => finding.severity === 'BLOCKING');
          await transaction.operationalException.create({
            data: {
              tenantId: resolvedTenantId,
              environmentId: invoice.environmentId,
              sourceEventId: invoice.sourceEventId,
              supplierInvoiceId: invoice.id,
              matchEvaluationId: evaluation.id,
              kind: outcome === 'INCOMPLETE' ? 'MISSING_EVIDENCE' : 'BUSINESS_MISMATCH',
              status: 'OPEN',
              severity: 'BLOCKING',
              title:
                outcome === 'INCOMPLETE'
                  ? 'Invoice evidence is incomplete'
                  : 'Invoice failed three-way matching',
              summary: explanation,
              businessImpact: {
                affectedDocumentCount: 1,
                invoiceTotalMinor: invoice.totalMinor.toString(),
                currency: invoice.currency,
                paymentApprovalBlocked: true,
              },
              rootCauseCode: rootFinding?.code ?? 'AP_MATCH_NOT_SATISFIED',
              retryable: false,
              classification: invoice.sourceEvent.classification,
            },
          });
        }

        await transaction.supplierInvoice.update({
          where: { id: invoice.id },
          data: {
            status:
              outcome === 'MATCHED'
                ? actionStatus === 'PENDING_APPROVAL'
                  ? 'PENDING_APPROVAL'
                  : 'MATCHED'
                : 'EXCEPTION',
          },
        });
        await transaction.auditLog.create({
          data: {
            tenantId: resolvedTenantId,
            action: 'IMPORT',
            resource: 'ap-match-evaluation',
            resourceId: evaluation.id,
            correlationId: invoice.sourceEvent.correlationId,
            after: {
              supplierInvoiceId: invoice.id,
              purchaseOrderId: invoice.purchaseOrderId,
              outcome,
              findingCodes: findings.map((finding) => finding.code),
              ruleVersionId: matchVersion.id,
              evidenceBundleId: evaluation.evidenceBundle?.id,
              proposedActionId: action?.id ?? null,
            },
          },
        });
        return evaluation;
      });
    } catch (error) {
      if (!this.isUniqueConstraint(error)) throw error;
      const raced = await prisma.apMatchEvaluation.findUnique({
        where: { supplierInvoiceId_inputHash: { supplierInvoiceId, inputHash } },
        include: { findings: true, evidenceBundle: { include: { items: true } } },
      });
      if (!raced) throw error;
      return raced;
    }
  }

  private evaluateFindings(
    invoice: InvoiceForMatch,
    policy: ApMatchRuleDefinition,
  ): MatchFinding[] {
    const findings: MatchFinding[] = [];
    const purchaseOrder = invoice.purchaseOrder;
    if (!purchaseOrder) {
      findings.push({
        code: 'PURCHASE_ORDER_NOT_AVAILABLE',
        severity: 'BLOCKING',
        field: 'purchaseOrderId',
        expected: invoice.purchaseOrderExternalId,
        actual: null,
        delta: null,
        explanation: 'The referenced purchase order has not been ingested.',
        evidenceRefs: [`supplier-invoice:${invoice.id}`],
        incomplete: true,
      });
      return findings;
    }
    if (invoice.supplier.externalId !== purchaseOrder.supplier.externalId) {
      findings.push(
        this.finding(
          'SUPPLIER_MISMATCH',
          'supplierId',
          purchaseOrder.supplier.externalId,
          invoice.supplier.externalId,
          null,
          'Invoice supplier does not match the purchase order supplier.',
          invoice.id,
          purchaseOrder.id,
        ),
      );
    }
    if (invoice.currency !== purchaseOrder.currency) {
      findings.push({
        ...this.finding(
          'CURRENCY_MISMATCH',
          'currency',
          purchaseOrder.currency,
          invoice.currency,
          null,
          'Invoice currency does not match the purchase order currency.',
          invoice.id,
          purchaseOrder.id,
        ),
        severity: policy.blockCurrencyMismatch ? 'BLOCKING' : 'WARNING',
      });
    }

    const poLines = new Map(purchaseOrder.lines.map((line) => [line.lineNumber, line]));
    for (const invoiceLine of invoice.lines) {
      const poLine = poLines.get(invoiceLine.purchaseOrderLineNumber);
      if (!poLine) {
        findings.push(
          this.finding(
            'PURCHASE_ORDER_LINE_NOT_FOUND',
            `lines.${invoiceLine.lineNumber}.purchaseOrderLineNumber`,
            String(invoiceLine.purchaseOrderLineNumber),
            null,
            null,
            'The referenced purchase order line is unavailable.',
            invoiceLine.id,
            purchaseOrder.id,
          ),
        );
        continue;
      }
      const priceDelta = this.absolute(
        BigInt(invoiceLine.unitPriceMinor.toString()) - BigInt(poLine.unitPriceMinor.toString()),
      );
      if (priceDelta > BigInt(policy.amountToleranceMinor)) {
        findings.push(
          this.finding(
            'UNIT_PRICE_MISMATCH',
            `lines.${invoiceLine.lineNumber}.unitPriceMinor`,
            poLine.unitPriceMinor.toString(),
            invoiceLine.unitPriceMinor.toString(),
            priceDelta.toString(),
            'Invoice unit price exceeds the configured monetary tolerance.',
            invoiceLine.id,
            poLine.id,
          ),
        );
      }
      const ordered = this.quantityMicros(poLine.quantity);
      const invoiced = this.quantityMicros(invoiceLine.quantity);
      const received = poLine.receiptLines.reduce(
        (total, receipt) => total + this.quantityMicros(receipt.quantityReceived),
        0n,
      );
      const quantityTolerance = (ordered * BigInt(policy.quantityToleranceBps)) / 10_000n;
      if (invoiced > ordered + quantityTolerance) {
        findings.push(
          this.finding(
            'ORDERED_QUANTITY_EXCEEDED',
            `lines.${invoiceLine.lineNumber}.quantity`,
            poLine.quantity.toString(),
            invoiceLine.quantity.toString(),
            this.formatQuantity(invoiced - ordered),
            'Invoiced quantity exceeds the ordered quantity tolerance.',
            invoiceLine.id,
            poLine.id,
          ),
        );
      }
      if (policy.requireReceipt && received === 0n) {
        findings.push({
          ...this.finding(
            'GOODS_RECEIPT_NOT_AVAILABLE',
            `lines.${invoiceLine.lineNumber}.quantityReceived`,
            invoiceLine.quantity.toString(),
            null,
            null,
            'No goods receipt is available for the purchase order line.',
            invoiceLine.id,
            poLine.id,
          ),
          incomplete: true,
        });
      } else if (policy.requireReceipt && invoiced > received + quantityTolerance) {
        findings.push(
          this.finding(
            'RECEIVED_QUANTITY_EXCEEDED',
            `lines.${invoiceLine.lineNumber}.quantity`,
            this.formatQuantity(received),
            invoiceLine.quantity.toString(),
            this.formatQuantity(invoiced - received),
            'Invoiced quantity exceeds the received quantity tolerance.',
            invoiceLine.id,
            poLine.id,
          ),
        );
      }
      const calculatedLineTotal = this.roundMinor(
        invoiced,
        BigInt(invoiceLine.unitPriceMinor.toString()),
      );
      const lineDelta = this.absolute(
        BigInt(invoiceLine.totalMinor.toString()) - calculatedLineTotal,
      );
      if (lineDelta > BigInt(policy.amountToleranceMinor)) {
        findings.push(
          this.finding(
            'LINE_TOTAL_MISMATCH',
            `lines.${invoiceLine.lineNumber}.totalMinor`,
            calculatedLineTotal.toString(),
            invoiceLine.totalMinor.toString(),
            lineDelta.toString(),
            'Invoice line total does not equal quantity multiplied by unit price.',
            invoiceLine.id,
            invoice.id,
          ),
        );
      }
    }
    const calculatedTotal =
      BigInt(invoice.subtotalMinor.toString()) + BigInt(invoice.taxMinor.toString());
    const headerDelta = this.absolute(BigInt(invoice.totalMinor.toString()) - calculatedTotal);
    if (headerDelta > BigInt(policy.amountToleranceMinor)) {
      findings.push(
        this.finding(
          'INVOICE_TOTAL_MISMATCH',
          'totalMinor',
          calculatedTotal.toString(),
          invoice.totalMinor.toString(),
          headerDelta.toString(),
          'Invoice total does not equal line subtotal plus tax within tolerance.',
          invoice.id,
          invoice.id,
        ),
      );
    }
    return findings;
  }

  private buildInputSnapshot(invoice: InvoiceForMatch, ruleChecksum: string) {
    return {
      ruleChecksum,
      invoice: this.invoiceSnapshot(invoice),
      purchaseOrder: invoice.purchaseOrder
        ? this.purchaseOrderSnapshot(invoice.purchaseOrder)
        : null,
    };
  }

  private buildEvidence(
    invoice: InvoiceForMatch,
    findings: MatchFinding[],
    ruleChecksum: string,
    explanation: string,
  ) {
    const snapshots = [
      {
        recordType: 'supplier-invoice',
        recordId: invoice.id,
        snapshot: this.invoiceSnapshot(invoice),
      },
      ...(invoice.purchaseOrder
        ? [
            {
              recordType: 'purchase-order',
              recordId: invoice.purchaseOrder.id,
              snapshot: this.purchaseOrderSnapshot(invoice.purchaseOrder),
            },
          ]
        : []),
    ];
    const items = snapshots.map((item) => ({
      ...item,
      citation: `${item.recordType}:${item.recordId}`,
      contentHash: createHash('sha256').update(canonicalJson(item.snapshot)).digest('hex'),
    }));
    const contentHash = createHash('sha256')
      .update(canonicalJson({ explanation, findings, ruleChecksum, items }))
      .digest('hex');
    return { items, contentHash };
  }

  private invoiceSnapshot(invoice: InvoiceForMatch) {
    return {
      id: invoice.id,
      externalId: invoice.externalId,
      invoiceNumber: invoice.invoiceNumber,
      supplierExternalId: invoice.supplier.externalId,
      purchaseOrderExternalId: invoice.purchaseOrderExternalId,
      currency: invoice.currency,
      subtotalMinor: invoice.subtotalMinor.toString(),
      taxMinor: invoice.taxMinor.toString(),
      totalMinor: invoice.totalMinor.toString(),
      sourceEventId: invoice.sourceEvent.eventId,
      sourcePayloadHash: invoice.sourceEvent.payloadHash,
      lines: invoice.lines.map((line) => ({
        id: line.id,
        lineNumber: line.lineNumber,
        purchaseOrderLineNumber: line.purchaseOrderLineNumber,
        quantity: line.quantity.toString(),
        unitPriceMinor: line.unitPriceMinor.toString(),
        totalMinor: line.totalMinor.toString(),
      })),
    };
  }

  private purchaseOrderSnapshot(purchaseOrder: NonNullable<InvoiceForMatch['purchaseOrder']>) {
    return {
      id: purchaseOrder.id,
      externalId: purchaseOrder.externalId,
      supplierExternalId: purchaseOrder.supplier.externalId,
      currency: purchaseOrder.currency,
      totalMinor: purchaseOrder.totalMinor.toString(),
      sourceEventId: purchaseOrder.sourceEvent.eventId,
      sourcePayloadHash: purchaseOrder.sourceEvent.payloadHash,
      lines: purchaseOrder.lines.map((line) => ({
        id: line.id,
        lineNumber: line.lineNumber,
        quantity: line.quantity.toString(),
        unitPriceMinor: line.unitPriceMinor.toString(),
        totalMinor: line.totalMinor.toString(),
        receipts: line.receiptLines.map((receipt) => ({
          goodsReceiptId: receipt.goodsReceipt.id,
          sourceEventId: receipt.goodsReceipt.sourceEvent.eventId,
          sourcePayloadHash: receipt.goodsReceipt.sourceEvent.payloadHash,
          quantityReceived: receipt.quantityReceived.toString(),
        })),
      })),
    };
  }

  private explain(outcome: 'MATCHED' | 'MISMATCH' | 'INCOMPLETE', findings: MatchFinding[]) {
    if (outcome === 'MATCHED')
      return 'Invoice, purchase order, and received quantities match within the active tenant policy tolerances.';
    const codes = findings.map((finding) => finding.code).join(', ');
    return `${outcome === 'INCOMPLETE' ? 'Matching requires additional evidence' : 'Matching found blocking differences'}: ${codes}.`;
  }

  private finding(
    code: string,
    field: string,
    expected: string | null,
    actual: string | null,
    delta: string | null,
    explanation: string,
    invoiceEvidenceId: string,
    comparisonEvidenceId: string,
  ): MatchFinding {
    return {
      code,
      severity: 'BLOCKING',
      field,
      expected,
      actual,
      delta,
      explanation,
      evidenceRefs: [invoiceEvidenceId, comparisonEvidenceId],
    };
  }

  private quantityMicros(quantity: Prisma.Decimal): bigint {
    const [whole = '0', fraction = ''] = quantity.toFixed(6).split('.');
    return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'));
  }

  private formatQuantity(micros: bigint): string {
    const whole = micros / 1_000_000n;
    const fraction = (micros % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '');
    return fraction ? `${whole}.${fraction}` : whole.toString();
  }

  private roundMinor(quantityMicros: bigint, unitPriceMinor: bigint): bigint {
    return (quantityMicros * unitPriceMinor + 500_000n) / 1_000_000n;
  }

  private absolute(value: bigint) {
    return value < 0n ? -value : value;
  }

  private isUniqueConstraint(error: unknown): boolean {
    return !!error && typeof error === 'object' && 'code' in error && error.code === 'P2002';
  }
}
