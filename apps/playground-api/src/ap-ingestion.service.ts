import {
  type GoodsReceiptPayload,
  GoodsReceiptPayloadSchema,
  type PurchaseOrderPayload,
  PurchaseOrderPayloadSchema,
  type SupplierInvoicePayload,
  SupplierInvoicePayloadSchema,
} from '@gigalibs/contracts';
import { Prisma, prisma } from '@gigalibs/db';
import { ConflictException, Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: NestJS needs the runtime constructor token for dependency injection.
import { ApMatchingService } from './ap-matching.service.js';
// biome-ignore lint/style/useImportType: NestJS needs the runtime constructor token for dependency injection.
import { PayloadCryptoService, sourceEventAuthenticatedContext } from './payload-crypto.service.js';

export const AP_EVENT_TYPES = [
  'ap.purchase-order.received.v1',
  'ap.goods-receipt.received.v1',
  'ap.invoice.received.v1',
] as const;

interface EncryptedSourceEvent {
  id: string;
  eventId: string;
  tenantId: string;
  environmentId: string;
  eventType: string;
  eventVersion: number;
  correlationId: string;
  payloadCiphertext: Uint8Array;
  payloadIv: Uint8Array;
  payloadAuthTag: Uint8Array;
  payloadKeyVersion: string;
}

@Injectable()
export class ApIngestionService {
  constructor(
    private readonly payloadCryptoService: PayloadCryptoService,
    private readonly matchingService: ApMatchingService,
  ) {}

  async processSourceEvent(
    sourceEventId: string,
  ): Promise<{ handled: boolean; recordId?: string }> {
    const event = await prisma.sourceEvent.findUnique({ where: { id: sourceEventId } });
    if (!event) throw new Error('SOURCE_EVENT_NOT_FOUND');
    if (!AP_EVENT_TYPES.includes(event.eventType as (typeof AP_EVENT_TYPES)[number])) {
      return { handled: false };
    }
    const payload = this.payloadCryptoService.decrypt(
      {
        ciphertext: event.payloadCiphertext,
        iv: event.payloadIv,
        authTag: event.payloadAuthTag,
        keyVersion: event.payloadKeyVersion,
      },
      sourceEventAuthenticatedContext(
        event.tenantId,
        event.eventId,
        event.eventType,
        event.eventVersion,
      ),
    );

    if (event.eventType === 'ap.purchase-order.received.v1') {
      const dto = this.parse(PurchaseOrderPayloadSchema, payload, 'PURCHASE_ORDER_PAYLOAD_INVALID');
      const result = await this.ingestPurchaseOrder(event, dto);
      for (const invoiceId of result.invoiceIdsToMatch) {
        await this.matchingService.evaluate(event.tenantId, invoiceId);
      }
      return { handled: true, recordId: result.purchaseOrderId };
    }
    if (event.eventType === 'ap.goods-receipt.received.v1') {
      const dto = this.parse(GoodsReceiptPayloadSchema, payload, 'GOODS_RECEIPT_PAYLOAD_INVALID');
      const result = await this.ingestGoodsReceipt(event, dto);
      for (const invoiceId of result.invoiceIdsToMatch) {
        await this.matchingService.evaluate(event.tenantId, invoiceId);
      }
      return { handled: true, recordId: result.goodsReceiptId };
    }
    const dto = this.parse(
      SupplierInvoicePayloadSchema,
      payload,
      'SUPPLIER_INVOICE_PAYLOAD_INVALID',
    );
    const supplierInvoiceId = await this.ingestSupplierInvoice(event, dto);
    await this.matchingService.evaluate(event.tenantId, supplierInvoiceId);
    return { handled: true, recordId: supplierInvoiceId };
  }

  private async ingestPurchaseOrder(event: EncryptedSourceEvent, dto: PurchaseOrderPayload) {
    this.assertUnique(
      dto.lines.map((line) => line.lineNumber),
      'PURCHASE_ORDER_LINE_DUPLICATE',
    );
    const existing = await prisma.purchaseOrder.findUnique({
      where: {
        tenantId_environmentId_externalId: {
          tenantId: event.tenantId,
          environmentId: event.environmentId,
          externalId: dto.purchaseOrderId,
        },
      },
    });
    if (existing) {
      if (existing.sourceEventId !== event.id)
        throw new ConflictException('PURCHASE_ORDER_BUSINESS_KEY_CONFLICT');
      const invoices = await prisma.supplierInvoice.findMany({
        where: {
          tenantId: event.tenantId,
          purchaseOrderId: existing.id,
          status: { notIn: ['APPROVED_FOR_PAYMENT', 'REJECTED'] },
        },
        select: { id: true },
      });
      return { purchaseOrderId: existing.id, invoiceIdsToMatch: invoices.map(({ id }) => id) };
    }
    const lineValues = dto.lines.map((line) => ({
      ...line,
      quantityDecimal: new Prisma.Decimal(line.quantity),
      totalMinor: this.lineTotal(line.quantity, line.unitPriceMinor),
    }));
    const totalMinor = lineValues.reduce((total, line) => total + line.totalMinor, 0n);

    return prisma.$transaction(async (transaction) => {
      const supplier = await transaction.supplier.upsert({
        where: {
          tenantId_environmentId_externalId: {
            tenantId: event.tenantId,
            environmentId: event.environmentId,
            externalId: dto.supplierId,
          },
        },
        create: {
          tenantId: event.tenantId,
          environmentId: event.environmentId,
          externalId: dto.supplierId,
          name: dto.supplierName,
        },
        update: { name: dto.supplierName },
      });
      const purchaseOrder = await transaction.purchaseOrder.create({
        data: {
          tenantId: event.tenantId,
          environmentId: event.environmentId,
          supplierId: supplier.id,
          sourceEventId: event.id,
          externalId: dto.purchaseOrderId,
          currency: dto.currency,
          totalMinor,
          status: dto.status,
          orderedAt: new Date(dto.orderedAt),
          lines: {
            create: lineValues.map((line) => ({
              lineNumber: line.lineNumber,
              itemCode: line.itemCode ?? null,
              description: line.description,
              quantity: line.quantityDecimal,
              unitPriceMinor: BigInt(line.unitPriceMinor),
              totalMinor: line.totalMinor,
            })),
          },
        },
        include: { lines: true },
      });
      const lineByNumber = new Map(purchaseOrder.lines.map((line) => [line.lineNumber, line.id]));
      const receipts = await transaction.goodsReceipt.findMany({
        where: {
          tenantId: event.tenantId,
          environmentId: event.environmentId,
          purchaseOrderExternalId: dto.purchaseOrderId,
          purchaseOrderId: null,
        },
        include: { lines: true },
      });
      for (const receipt of receipts) {
        await transaction.goodsReceipt.update({
          where: { id: receipt.id },
          data: { purchaseOrderId: purchaseOrder.id },
        });
        for (const line of receipt.lines) {
          const purchaseOrderLineId = lineByNumber.get(line.purchaseOrderLineNumber);
          if (purchaseOrderLineId) {
            await transaction.goodsReceiptLine.update({
              where: { id: line.id },
              data: { purchaseOrderLineId },
            });
          }
        }
      }
      const invoices = await transaction.supplierInvoice.findMany({
        where: {
          tenantId: event.tenantId,
          environmentId: event.environmentId,
          purchaseOrderExternalId: dto.purchaseOrderId,
          purchaseOrderId: null,
          status: { notIn: ['APPROVED_FOR_PAYMENT', 'REJECTED'] },
        },
        include: { lines: true },
      });
      for (const invoice of invoices) {
        await transaction.supplierInvoice.update({
          where: { id: invoice.id },
          data: { purchaseOrderId: purchaseOrder.id },
        });
        for (const line of invoice.lines) {
          const purchaseOrderLineId = lineByNumber.get(line.purchaseOrderLineNumber);
          if (purchaseOrderLineId) {
            await transaction.supplierInvoiceLine.update({
              where: { id: line.id },
              data: { purchaseOrderLineId },
            });
          }
        }
      }
      await transaction.auditLog.create({
        data: {
          tenantId: event.tenantId,
          action: 'IMPORT',
          resource: 'purchase-order',
          resourceId: purchaseOrder.id,
          correlationId: event.correlationId,
          after: {
            externalId: purchaseOrder.externalId,
            supplierId: supplier.externalId,
            lineCount: purchaseOrder.lines.length,
            totalMinor: totalMinor.toString(),
            sourceEventId: event.eventId,
            reconciledReceiptCount: receipts.length,
            reconciledInvoiceCount: invoices.length,
          },
        },
      });
      return {
        purchaseOrderId: purchaseOrder.id,
        invoiceIdsToMatch: invoices.map(({ id }) => id),
      };
    });
  }

  private async ingestGoodsReceipt(event: EncryptedSourceEvent, dto: GoodsReceiptPayload) {
    this.assertUnique(
      dto.lines.map((line) => line.purchaseOrderLineNumber),
      'GOODS_RECEIPT_LINE_DUPLICATE',
    );
    const existing = await prisma.goodsReceipt.findUnique({
      where: {
        tenantId_environmentId_externalId: {
          tenantId: event.tenantId,
          environmentId: event.environmentId,
          externalId: dto.goodsReceiptId,
        },
      },
    });
    if (existing) {
      if (existing.sourceEventId !== event.id)
        throw new ConflictException('GOODS_RECEIPT_BUSINESS_KEY_CONFLICT');
      const invoices = existing.purchaseOrderId
        ? await prisma.supplierInvoice.findMany({
            where: {
              tenantId: event.tenantId,
              purchaseOrderId: existing.purchaseOrderId,
              status: { notIn: ['APPROVED_FOR_PAYMENT', 'REJECTED'] },
            },
            select: { id: true },
          })
        : [];
      return { goodsReceiptId: existing.id, invoiceIdsToMatch: invoices.map(({ id }) => id) };
    }
    return prisma.$transaction(async (transaction) => {
      const purchaseOrder = await transaction.purchaseOrder.findUnique({
        where: {
          tenantId_environmentId_externalId: {
            tenantId: event.tenantId,
            environmentId: event.environmentId,
            externalId: dto.purchaseOrderId,
          },
        },
        include: { lines: true },
      });
      const lineByNumber = new Map(
        purchaseOrder?.lines.map((line) => [line.lineNumber, line.id]) ?? [],
      );
      const goodsReceipt = await transaction.goodsReceipt.create({
        data: {
          tenantId: event.tenantId,
          environmentId: event.environmentId,
          purchaseOrderId: purchaseOrder?.id ?? null,
          purchaseOrderExternalId: dto.purchaseOrderId,
          sourceEventId: event.id,
          externalId: dto.goodsReceiptId,
          receivedAt: new Date(dto.receivedAt),
          lines: {
            create: dto.lines.map((line) => ({
              purchaseOrderLineId: lineByNumber.get(line.purchaseOrderLineNumber) ?? null,
              purchaseOrderLineNumber: line.purchaseOrderLineNumber,
              quantityReceived: new Prisma.Decimal(line.quantityReceived),
            })),
          },
        },
      });
      const invoices = purchaseOrder
        ? await transaction.supplierInvoice.findMany({
            where: {
              tenantId: event.tenantId,
              purchaseOrderId: purchaseOrder.id,
              status: { notIn: ['APPROVED_FOR_PAYMENT', 'REJECTED'] },
            },
            select: { id: true },
          })
        : [];
      await transaction.auditLog.create({
        data: {
          tenantId: event.tenantId,
          action: 'IMPORT',
          resource: 'goods-receipt',
          resourceId: goodsReceipt.id,
          correlationId: event.correlationId,
          after: {
            externalId: goodsReceipt.externalId,
            purchaseOrderExternalId: dto.purchaseOrderId,
            purchaseOrderResolved: !!purchaseOrder,
            lineCount: dto.lines.length,
            sourceEventId: event.eventId,
          },
        },
      });
      return {
        goodsReceiptId: goodsReceipt.id,
        invoiceIdsToMatch: invoices.map(({ id }) => id),
      };
    });
  }

  private async ingestSupplierInvoice(
    event: EncryptedSourceEvent,
    dto: SupplierInvoicePayload,
  ): Promise<string> {
    this.assertUnique(
      dto.lines.map((line) => line.lineNumber),
      'SUPPLIER_INVOICE_LINE_DUPLICATE',
    );
    const existing = await prisma.supplierInvoice.findUnique({
      where: {
        tenantId_environmentId_externalId: {
          tenantId: event.tenantId,
          environmentId: event.environmentId,
          externalId: dto.supplierInvoiceId,
        },
      },
    });
    if (existing) {
      if (existing.sourceEventId !== event.id)
        throw new ConflictException('SUPPLIER_INVOICE_BUSINESS_KEY_CONFLICT');
      return existing.id;
    }
    return prisma.$transaction(async (transaction) => {
      const supplier = await transaction.supplier.upsert({
        where: {
          tenantId_environmentId_externalId: {
            tenantId: event.tenantId,
            environmentId: event.environmentId,
            externalId: dto.supplierId,
          },
        },
        create: {
          tenantId: event.tenantId,
          environmentId: event.environmentId,
          externalId: dto.supplierId,
          name: dto.supplierName,
        },
        update: { name: dto.supplierName },
      });
      const purchaseOrder = await transaction.purchaseOrder.findUnique({
        where: {
          tenantId_environmentId_externalId: {
            tenantId: event.tenantId,
            environmentId: event.environmentId,
            externalId: dto.purchaseOrderId,
          },
        },
        include: { lines: true },
      });
      const lineByNumber = new Map(
        purchaseOrder?.lines.map((line) => [line.lineNumber, line.id]) ?? [],
      );
      const subtotalMinor = dto.lines.reduce((total, line) => total + BigInt(line.totalMinor), 0n);
      const invoice = await transaction.supplierInvoice.create({
        data: {
          tenantId: event.tenantId,
          environmentId: event.environmentId,
          supplierId: supplier.id,
          purchaseOrderId: purchaseOrder?.id ?? null,
          purchaseOrderExternalId: dto.purchaseOrderId,
          sourceEventId: event.id,
          externalId: dto.supplierInvoiceId,
          invoiceNumber: dto.invoiceNumber,
          currency: dto.currency,
          subtotalMinor,
          taxMinor: BigInt(dto.taxMinor),
          totalMinor: BigInt(dto.totalMinor),
          status: 'MATCHING',
          invoiceDate: new Date(dto.invoiceDate),
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          lines: {
            create: dto.lines.map((line) => ({
              purchaseOrderLineId: lineByNumber.get(line.purchaseOrderLineNumber) ?? null,
              purchaseOrderLineNumber: line.purchaseOrderLineNumber,
              lineNumber: line.lineNumber,
              description: line.description,
              quantity: new Prisma.Decimal(line.quantity),
              unitPriceMinor: BigInt(line.unitPriceMinor),
              totalMinor: BigInt(line.totalMinor),
            })),
          },
        },
      });
      await transaction.auditLog.create({
        data: {
          tenantId: event.tenantId,
          action: 'IMPORT',
          resource: 'supplier-invoice',
          resourceId: invoice.id,
          correlationId: event.correlationId,
          after: {
            externalId: invoice.externalId,
            invoiceNumber: invoice.invoiceNumber,
            supplierId: supplier.externalId,
            purchaseOrderExternalId: dto.purchaseOrderId,
            purchaseOrderResolved: !!purchaseOrder,
            totalMinor: invoice.totalMinor.toString(),
            currency: invoice.currency,
            lineCount: dto.lines.length,
            sourceEventId: event.eventId,
          },
        },
      });
      return invoice.id;
    });
  }

  private parse<T>(
    schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } },
    payload: unknown,
    errorCode: string,
  ): T {
    const result = schema.safeParse(payload);
    if (!result.success) throw new Error(errorCode);
    return result.data;
  }

  private assertUnique(values: number[], errorCode: string) {
    if (new Set(values).size !== values.length) throw new Error(errorCode);
  }

  private lineTotal(quantity: string, unitPriceMinor: number): bigint {
    return BigInt(
      new Prisma.Decimal(quantity)
        .mul(unitPriceMinor)
        .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP)
        .toFixed(0),
    );
  }
}
