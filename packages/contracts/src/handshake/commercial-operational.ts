import { z } from 'zod';
import { MoneyMinorSchema } from '../catalogue/index.js';

// ─── Scaled-BigInt Exact Decimal Arithmetic Utility ──────────────────────────
// Bounded to 6 decimal places (scale factor = 1,000,000n). Eliminates IEEE 754 floats.

export const DECIMAL_SCALE = 6;
export const SCALE_FACTOR = 1_000_000n;

export const ScaledQuantitySchema = z
  .string()
  .trim()
  .regex(/^-?\d+(\.\d{1,6})?$/, 'Must be a valid decimal string with up to 6 decimal places');

export class ExactDecimal {
  /** Parses a decimal string (e.g. "123.456789") into scaled BigInt. */
  static toScaledBigInt(decimalStr: string, scale: number = DECIMAL_SCALE): bigint {
    const trimmed = decimalStr.trim();
    if (!trimmed) return 0n;
    const isNegative = trimmed.startsWith('-');
    const cleanStr = isNegative ? trimmed.slice(1) : trimmed;
    const parts = cleanStr.split('.');
    const integerPart = parts[0] || '0';
    const fractionPart = (parts[1] || '').padEnd(scale, '0').slice(0, scale);
    const combined = BigInt(integerPart + fractionPart);
    return isNegative ? -combined : combined;
  }

  /** Formats a scaled BigInt back to fixed-point string with scale decimals. */
  static fromScaledBigInt(scaledVal: bigint, scale: number = DECIMAL_SCALE): string {
    const isNegative = scaledVal < 0n;
    const absVal = isNegative ? -scaledVal : scaledVal;
    const divisor = 10n ** BigInt(scale);
    const intPart = (absVal / divisor).toString();
    const fracPart = (absVal % divisor).toString().padStart(scale, '0');
    return `${isNegative ? '-' : ''}${intPart}.${fracPart}`;
  }

  static add(a: string, b: string): string {
    const sum = this.toScaledBigInt(a) + this.toScaledBigInt(b);
    return this.fromScaledBigInt(sum);
  }

  static subtract(a: string, b: string): string {
    const diff = this.toScaledBigInt(a) - this.toScaledBigInt(b);
    return this.fromScaledBigInt(diff);
  }

  static multiply(a: string, b: string): string {
    // (a * b) / SCALE_FACTOR
    const product = (this.toScaledBigInt(a) * this.toScaledBigInt(b)) / SCALE_FACTOR;
    return this.fromScaledBigInt(product);
  }

  static compare(a: string, b: string): number {
    const bigA = this.toScaledBigInt(a);
    const bigB = this.toScaledBigInt(b);
    if (bigA > bigB) return 1;
    if (bigA < bigB) return -1;
    return 0;
  }

  static isLessThanOrEqual(a: string, b: string): boolean {
    return this.toScaledBigInt(a) <= this.toScaledBigInt(b);
  }

  static isLessThan(a: string, b: string): boolean {
    return this.toScaledBigInt(a) < this.toScaledBigInt(b);
  }

  static isGreaterThan(a: string, b: string): boolean {
    return this.toScaledBigInt(a) > this.toScaledBigInt(b);
  }

  static isGreaterThanOrEqual(a: string, b: string): boolean {
    return this.toScaledBigInt(a) >= this.toScaledBigInt(b);
  }

  static isZero(a: string): boolean {
    return this.toScaledBigInt(a) === 0n;
  }

  static isNegative(a: string): boolean {
    return this.toScaledBigInt(a) < 0n;
  }

  static isPositive(a: string): boolean {
    return this.toScaledBigInt(a) > 0n;
  }

  static abs(a: string): string {
    const val = this.toScaledBigInt(a);
    return this.fromScaledBigInt(val < 0n ? -val : val);
  }
}

// ─── Commercial & Operational Cross-Module Event Schemas ─────────────────────

/** Orders requests Inventory reservation (event: `orders.allocation.requested.v1`) */
export const OrdersAllocationRequestedV1Schema = z
  .object({
    allocationKey: z.string().uuid(),
    orderId: z.string().uuid(),
    orderLineId: z.string().uuid(),
    productId: z.string().uuid(),
    warehouseId: z.string().uuid(),
    requestedQuantity: ScaledQuantitySchema,
    uomId: z.string().uuid(),
  })
  .strict();
export type OrdersAllocationRequestedV1 = z.infer<typeof OrdersAllocationRequestedV1Schema>;

/** Inventory confirms reservation (event: `inventory.reservation.confirmed.v1`) */
export const InventoryReservationConfirmedV1Schema = z
  .object({
    allocationKey: z.string().uuid(),
    reservationId: z.string().uuid(),
    orderId: z.string().uuid(),
    orderLineId: z.string().uuid(),
    productId: z.string().uuid(),
    warehouseId: z.string().uuid(),
    reservedQuantity: ScaledQuantitySchema,
    reservedAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type InventoryReservationConfirmedV1 = z.infer<typeof InventoryReservationConfirmedV1Schema>;

/** Inventory rejects reservation due to insufficient stock (event: `inventory.reservation.rejected.v1`) */
export const InventoryReservationRejectedV1Schema = z
  .object({
    allocationKey: z.string().uuid(),
    orderId: z.string().uuid(),
    orderLineId: z.string().uuid(),
    productId: z.string().uuid(),
    warehouseId: z.string().uuid(),
    requestedQuantity: ScaledQuantitySchema,
    availableStock: ScaledQuantitySchema,
    reason: z.string().min(1).max(255),
  })
  .strict();
export type InventoryReservationRejectedV1 = z.infer<typeof InventoryReservationRejectedV1Schema>;

/** Inventory confirms physical stock deduction (event: `inventory.stock.issued.v1`) */
export const InventoryStockIssuedV1Schema = z
  .object({
    issueId: z.string().uuid(),
    reservationId: z.string().uuid(),
    orderId: z.string().uuid(),
    orderLineId: z.string().uuid(),
    productId: z.string().uuid(),
    warehouseId: z.string().uuid(),
    issuedQuantity: ScaledQuantitySchema,
    issuedAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type InventoryStockIssuedV1 = z.infer<typeof InventoryStockIssuedV1Schema>;

/** Inventory posts physical goods receipt (event: `inventory.receipt.completed.v1`) */
export const InventoryReceiptCompletedLineV1Schema = z
  .object({
    receiptLineId: z.string().uuid(),
    productId: z.string().uuid(),
    receivedQuantity: ScaledQuantitySchema,
    uomId: z.string().uuid(),
    purchaseOrderId: z.string().uuid().nullable().optional(),
    purchaseOrderLineId: z.string().uuid().nullable().optional(),
  })
  .strict();

export const InventoryReceiptCompletedV1Schema = z
  .object({
    receiptId: z.string().uuid(),
    receiptNumber: z.string().min(1).max(64),
    warehouseId: z.string().uuid(),
    receivedAt: z.string().datetime({ offset: true }),
    lines: z.array(InventoryReceiptCompletedLineV1Schema).min(1),
  })
  .strict();
export type InventoryReceiptCompletedV1 = z.infer<typeof InventoryReceiptCompletedV1Schema>;

/** Orders dispatches fulfillment after physical inventory deduction (event: `orders.fulfillment.dispatched.v1`) */
export const OrdersFulfillmentDispatchedLineV1Schema = z
  .object({
    orderLineId: z.string().uuid(),
    productId: z.string().uuid(),
    productCode: z.string().min(1).max(64),
    productName: z.string().min(1).max(255),
    quantity: ScaledQuantitySchema,
    unitPriceMinor: MoneyMinorSchema,
    uomId: z.string().uuid(),
  })
  .strict();

export const OrdersFulfillmentDispatchedV1Schema = z
  .object({
    fulfillmentId: z.string().uuid(),
    orderId: z.string().uuid(),
    orderNumber: z.string().min(1).max(64),
    customerPartyId: z.string().uuid(),
    currencyCode: z.string().regex(/^[A-Z]{3}$/),
    issueId: z.string().uuid(),
    lines: z.array(OrdersFulfillmentDispatchedLineV1Schema).min(1),
    dispatchedAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type OrdersFulfillmentDispatchedV1 = z.infer<typeof OrdersFulfillmentDispatchedV1Schema>;

/** Accounts Receivable emits canonical customer invoice (event: `ar.invoice.issued.v1`) */
export const ArInvoiceIssuedV1Schema = z
  .object({
    invoiceId: z.string().uuid(),
    invoiceNumber: z.string().min(1).max(64),
    orderId: z.string().uuid(),
    fulfillmentId: z.string().uuid(),
    customerPartyId: z.string().uuid(),
    totalAmountMinor: MoneyMinorSchema,
    currencyCode: z.string().regex(/^[A-Z]{3}$/),
    sealHash: z.string().length(64),
    sealSequence: z.number().int().positive(),
    issuedAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type ArInvoiceIssuedV1 = z.infer<typeof ArInvoiceIssuedV1Schema>;
