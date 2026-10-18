import { z } from 'zod';
import { DecimalQuantitySchema, MoneyMinorSchema } from '../catalogue/index.js';

// ─── Enums & Value Sets ────────────────────────────────────────────────────────

export const WAREHOUSE_TYPES = ['PHYSICAL', 'VIRTUAL', 'TRANSIT', 'CONSIGNMENT', 'QUARANTINE', 'VAN_STOCK'] as const;
export const WarehouseTypeSchema = z.enum(WAREHOUSE_TYPES);
export type WarehouseType = z.infer<typeof WarehouseTypeSchema>;

export const LOCATION_TYPES = ['RECEIVING', 'STORAGE', 'PICKING', 'STAGING', 'PACKING', 'SHIPPING', 'QUARANTINE', 'INSPECTION', 'SCRAP', 'TRANSIT'] as const;
export const LocationTypeSchema = z.enum(LOCATION_TYPES);
export type LocationType = z.infer<typeof LocationTypeSchema>;

export const STOCK_STATUSES = ['AVAILABLE', 'RESERVED', 'QUARANTINED', 'INSPECTION', 'DAMAGED', 'BLOCKED', 'EXPIRED'] as const;
export const StockStatusSchema = z.enum(STOCK_STATUSES);
export type StockStatus = z.infer<typeof StockStatusSchema>;

export const LEDGER_MOVEMENT_REASONS = [
  'RECEIPT',
  'PUTAWAY',
  'TRANSFER',
  'RESERVE',
  'RELEASE',
  'PICK',
  'STAGE',
  'ISSUE',
  'RETURN',
  'COUNT_GAIN',
  'COUNT_LOSS',
  'ADJUSTMENT',
  'SCRAP',
  'STATUS_CHANGE',
] as const;
export const LedgerMovementReasonSchema = z.enum(LEDGER_MOVEMENT_REASONS);
export type LedgerMovementReason = z.infer<typeof LedgerMovementReasonSchema>;

export const LEDGER_ENTRY_DIRECTIONS = ['DEBIT', 'CREDIT'] as const;
export const LedgerEntryDirectionSchema = z.enum(LEDGER_ENTRY_DIRECTIONS);
export type LedgerEntryDirection = z.infer<typeof LedgerEntryDirectionSchema>;

export const RECEIPT_STATUSES = ['DRAFT', 'EXPECTED', 'RECEIVING', 'COMPLETED', 'CANCELLED'] as const;
export const ReceiptStatusSchema = z.enum(RECEIPT_STATUSES);
export type ReceiptStatus = z.infer<typeof ReceiptStatusSchema>;

export const TRANSFER_STATUSES = ['DRAFT', 'REQUESTED', 'ALLOCATED', 'PICKED', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED'] as const;
export const TransferStatusSchema = z.enum(TRANSFER_STATUSES);
export type TransferStatus = z.infer<typeof TransferStatusSchema>;

export const RESERVATION_STATUSES = ['PENDING', 'ACTIVE', 'FULFILLED', 'RELEASED', 'CANCELLED'] as const;
export const ReservationStatusSchema = z.enum(RESERVATION_STATUSES);
export type ReservationStatus = z.infer<typeof ReservationStatusSchema>;

export const RESERVATION_TYPES = ['HARD', 'SOFT'] as const;
export const ReservationTypeSchema = z.enum(RESERVATION_TYPES);
export type ReservationType = z.infer<typeof ReservationTypeSchema>;

export const COUNT_PLAN_TYPES = ['CYCLE', 'ANNUAL', 'SPOT', 'EVENT_TRIGGERED'] as const;
export const CountPlanTypeSchema = z.enum(COUNT_PLAN_TYPES);
export type CountPlanType = z.infer<typeof CountPlanTypeSchema>;

export const COUNT_STATUSES = ['PLANNED', 'IN_PROGRESS', 'SUBMITTED', 'RECOUNT_REQUESTED', 'APPROVED', 'CANCELLED'] as const;
export const CountStatusSchema = z.enum(COUNT_STATUSES);
export type CountStatus = z.infer<typeof CountStatusSchema>;

export const ADJUSTMENT_STATUSES = ['PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'POSTED'] as const;
export const AdjustmentStatusSchema = z.enum(ADJUSTMENT_STATUSES);
export type AdjustmentStatus = z.infer<typeof AdjustmentStatusSchema>;

export const KIT_STATUSES = ['DRAFT', 'ALLOCATED', 'PICKING', 'STAGED', 'ISSUED', 'RETURNED', 'CLOSED'] as const;
export const KitStatusSchema = z.enum(KIT_STATUSES);
export type KitStatus = z.infer<typeof KitStatusSchema>;

export const VALUATION_METHODS = ['STANDARD', 'MOVING_AVERAGE', 'FIFO'] as const;
export const ValuationMethodSchema = z.enum(VALUATION_METHODS);
export type ValuationMethod = z.infer<typeof ValuationMethodSchema>;

// ─── Primitive Field Validators ────────────────────────────────────────────────

export const InventoryCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(50)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/);

export const InventoryNameSchema = z.string().trim().min(1).max(200);

export const InventoryDescriptionSchema = z.string().trim().max(2000).optional().nullable();

export const PositiveDecimalQuantitySchema = z.string().regex(/^\d+(\.\d{1,6})?$/);

export const BarcodeSchema = z.string().trim().min(1).max(128);

// ─── Entities (Full Domain Records) ───────────────────────────────────────────

export const InventoryWarehouseV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    code: InventoryCodeSchema,
    name: InventoryNameSchema,
    description: InventoryDescriptionSchema,
    warehouseType: WarehouseTypeSchema,
    orgUnitId: z.string().optional().nullable(),
    placeId: z.string().optional().nullable(),
    address: z.string().max(500).optional().nullable(),
    isActive: z.boolean().default(true),
    version: z.number().int().min(1).default(1),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    createdBy: z.string().optional().nullable(),
    updatedBy: z.string().optional().nullable(),
  })
  .strict();
export type InventoryWarehouseV1 = z.infer<typeof InventoryWarehouseV1Schema>;

export const InventoryLocationV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    warehouseId: z.string().uuid(),
    code: InventoryCodeSchema,
    name: InventoryNameSchema,
    locationType: LocationTypeSchema,
    parentLocationId: z.string().uuid().optional().nullable(),
    aisle: z.string().max(20).optional().nullable(),
    rack: z.string().max(20).optional().nullable(),
    shelf: z.string().max(20).optional().nullable(),
    bin: z.string().max(20).optional().nullable(),
    barcode: BarcodeSchema.optional().nullable(),
    maxWeightKg: DecimalQuantitySchema.optional().nullable(),
    maxVolumeM3: DecimalQuantitySchema.optional().nullable(),
    allowNegative: z.boolean().default(false),
    isActive: z.boolean().default(true),
    version: z.number().int().min(1).default(1),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type InventoryLocationV1 = z.infer<typeof InventoryLocationV1Schema>;

export const InventoryItemV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    productId: z.string().uuid(),
    defaultWarehouseId: z.string().uuid().optional().nullable(),
    defaultLocationId: z.string().uuid().optional().nullable(),
    isLotTracked: z.boolean().default(false),
    isSerialTracked: z.boolean().default(false),
    shelfLifeDays: z.number().int().nonnegative().optional().nullable(),
    reorderPoint: DecimalQuantitySchema.optional().nullable(),
    safetyStock: DecimalQuantitySchema.optional().nullable(),
    valuationMethod: ValuationMethodSchema.default('STANDARD'),
    standardCostMinor: MoneyMinorSchema.default('0'),
    isActive: z.boolean().default(true),
    version: z.number().int().min(1).default(1),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type InventoryItemV1 = z.infer<typeof InventoryItemV1Schema>;

export const InventoryLotV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    productId: z.string().uuid(),
    lotNumber: z.string().trim().min(1).max(100),
    batchCode: z.string().max(100).optional().nullable(),
    supplierLotNumber: z.string().max(100).optional().nullable(),
    manufacturedDate: z.string().datetime().optional().nullable(),
    expiryDate: z.string().datetime().optional().nullable(),
    status: StockStatusSchema.default('AVAILABLE'),
    customExtensions: z.record(z.string(), z.unknown()).optional(),
    manifestChecksum: z.string().length(64).optional().nullable(),
    version: z.number().int().min(1).default(1),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type InventoryLotV1 = z.infer<typeof InventoryLotV1Schema>;

export const InventorySerialV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    productId: z.string().uuid(),
    serialNumber: z.string().trim().min(1).max(100),
    lotId: z.string().uuid().optional().nullable(),
    warehouseId: z.string().uuid().optional().nullable(),
    locationId: z.string().uuid().optional().nullable(),
    status: StockStatusSchema.default('AVAILABLE'),
    currentCustodyActorId: z.string().optional().nullable(),
    version: z.number().int().min(1).default(1),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type InventorySerialV1 = z.infer<typeof InventorySerialV1Schema>;

export const StockLedgerTransactionV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    transactionNumber: z.string().min(1).max(64),
    documentType: z.string().min(1).max(50),
    documentReferenceId: z.string().max(128).optional().nullable(),
    reason: LedgerMovementReasonSchema,
    correlationId: z.string().min(1).max(128),
    idempotencyKey: z.string().min(1).max(128),
    postedBy: z.string().min(1).max(128),
    postedAt: z.string().datetime(),
    createdAt: z.string().datetime(),
  })
  .strict();
export type StockLedgerTransactionV1 = z.infer<typeof StockLedgerTransactionV1Schema>;

export const StockLedgerEntryV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    transactionId: z.string().uuid(),
    direction: LedgerEntryDirectionSchema,
    warehouseId: z.string().uuid(),
    locationId: z.string().uuid(),
    productId: z.string().uuid(),
    uomId: z.string().uuid(),
    quantity: DecimalQuantitySchema,
    baseQuantity: DecimalQuantitySchema,
    lotId: z.string().uuid().optional().nullable(),
    serialId: z.string().uuid().optional().nullable(),
    stockStatus: StockStatusSchema,
    unitCostMinor: MoneyMinorSchema.optional().nullable(),
    totalCostMinor: MoneyMinorSchema.optional().nullable(),
    createdAt: z.string().datetime(),
  })
  .strict();
export type StockLedgerEntryV1 = z.infer<typeof StockLedgerEntryV1Schema>;

export const StockBalanceV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    warehouseId: z.string().uuid(),
    locationId: z.string().uuid(),
    productId: z.string().uuid(),
    uomId: z.string().uuid(),
    lotId: z.string().uuid().optional().nullable(),
    serialId: z.string().uuid().optional().nullable(),
    stockStatus: StockStatusSchema,
    onHandQuantity: DecimalQuantitySchema,
    reservedQuantity: DecimalQuantitySchema,
    availableQuantity: DecimalQuantitySchema,
    lastMovementAt: z.string().datetime(),
    version: z.number().int().min(1).default(1),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type StockBalanceV1 = z.infer<typeof StockBalanceV1Schema>;

export const InventoryReservationV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    reservationType: ReservationTypeSchema,
    demandType: z.enum(['WORK_ORDER', 'SALES_ORDER', 'TRANSFER', 'PROJECT']),
    demandReferenceId: z.string().min(1).max(128),
    demandLineId: z.string().max(128).optional().nullable(),
    warehouseId: z.string().uuid(),
    locationId: z.string().uuid().optional().nullable(),
    productId: z.string().uuid(),
    uomId: z.string().uuid(),
    quantity: DecimalQuantitySchema,
    fulfilledQuantity: DecimalQuantitySchema.default('0'),
    status: ReservationStatusSchema.default('ACTIVE'),
    expiryDate: z.string().datetime().optional().nullable(),
    version: z.number().int().min(1).default(1),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type InventoryReservationV1 = z.infer<typeof InventoryReservationV1Schema>;

export const InventoryReceiptLineV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    receiptId: z.string().uuid(),
    lineNumber: z.number().int().min(1),
    productId: z.string().uuid(),
    uomId: z.string().uuid(),
    expectedQuantity: DecimalQuantitySchema,
    receivedQuantity: DecimalQuantitySchema.default('0'),
    targetLocationId: z.string().uuid().optional().nullable(),
    lotNumber: z.string().max(100).optional().nullable(),
    expiryDate: z.string().datetime().optional().nullable(),
    inspectionStatus: z.enum(['PENDING', 'PASSED', 'FAILED', 'QUARANTINED']).default('PENDING'),
    purchaseOrderId: z.string().uuid().optional().nullable(),
    purchaseOrderLineId: z.string().uuid().optional().nullable(),
    customExtensions: z.record(z.string(), z.unknown()).optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type InventoryReceiptLineV1 = z.infer<typeof InventoryReceiptLineV1Schema>;

export const ReceiptFinancePostingStatusSchema = z.enum([
  'NOT_APPLICABLE',
  'AWAITING_POSTING',
  'POSTED',
  'POSTING_REJECTED',
]);

export const InventoryReceiptV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    receiptNumber: z.string().min(1).max(64),
    warehouseId: z.string().uuid(),
    supplierPartyId: z.string().uuid().optional().nullable(),
    carrierPartyId: z.string().uuid().optional().nullable(),
    externalDocumentReference: z.string().max(128).optional().nullable(),
    status: ReceiptStatusSchema.default('DRAFT'),
    financePostingStatus: ReceiptFinancePostingStatusSchema.optional(),
    financePostingRejectionCode: z.string().max(128).optional().nullable(),
    notes: InventoryDescriptionSchema,
    lines: z.array(InventoryReceiptLineV1Schema).optional(),
    version: z.number().int().min(1).default(1),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    completedAt: z.string().datetime().optional().nullable(),
  })
  .strict();
export type InventoryReceiptV1 = z.infer<typeof InventoryReceiptV1Schema>;

export const InventoryTransferLineV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    transferId: z.string().uuid(),
    productId: z.string().uuid(),
    uomId: z.string().uuid(),
    sourceLocationId: z.string().uuid(),
    targetLocationId: z.string().uuid(),
    quantity: DecimalQuantitySchema,
    lotId: z.string().uuid().optional().nullable(),
    serialId: z.string().uuid().optional().nullable(),
    pickedQuantity: DecimalQuantitySchema.default('0'),
    receivedQuantity: DecimalQuantitySchema.default('0'),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type InventoryTransferLineV1 = z.infer<typeof InventoryTransferLineV1Schema>;

export const InventoryTransferV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    transferNumber: z.string().min(1).max(64),
    sourceWarehouseId: z.string().uuid(),
    targetWarehouseId: z.string().uuid(),
    status: TransferStatusSchema.default('DRAFT'),
    notes: InventoryDescriptionSchema,
    lines: z.array(InventoryTransferLineV1Schema).optional(),
    version: z.number().int().min(1).default(1),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type InventoryTransferV1 = z.infer<typeof InventoryTransferV1Schema>;

export const InventoryKitLineV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    kitId: z.string().uuid(),
    productId: z.string().uuid(),
    uomId: z.string().uuid(),
    requestedQuantity: DecimalQuantitySchema,
    pickedQuantity: DecimalQuantitySchema.default('0'),
    issuedQuantity: DecimalQuantitySchema.default('0'),
    returnedQuantity: DecimalQuantitySchema.default('0'),
    lotId: z.string().uuid().optional().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type InventoryKitLineV1 = z.infer<typeof InventoryKitLineV1Schema>;

export const InventoryKitV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    kitNumber: z.string().min(1).max(64),
    workOrderId: z.string().max(128),
    workOrderTaskId: z.string().max(128).optional().nullable(),
    warehouseId: z.string().uuid(),
    stagingLocationId: z.string().uuid().optional().nullable(),
    assignedTechnicianId: z.string().max(128).optional().nullable(),
    status: KitStatusSchema.default('DRAFT'),
    lines: z.array(InventoryKitLineV1Schema).optional(),
    version: z.number().int().min(1).default(1),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type InventoryKitV1 = z.infer<typeof InventoryKitV1Schema>;

export const CountPlanV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    planNumber: z.string().min(1).max(64),
    name: InventoryNameSchema,
    planType: CountPlanTypeSchema,
    warehouseId: z.string().uuid(),
    status: CountStatusSchema.default('PLANNED'),
    isBlindCount: z.boolean().default(true),
    allowMovementsDuringCount: z.boolean().default(false),
    version: z.number().int().min(1).default(1),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type CountPlanV1 = z.infer<typeof CountPlanV1Schema>;

export const CountEntryV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    countPlanId: z.string().uuid(),
    locationId: z.string().uuid(),
    productId: z.string().uuid(),
    lotId: z.string().uuid().optional().nullable(),
    serialId: z.string().uuid().optional().nullable(),
    snapshotQuantity: DecimalQuantitySchema,
    countedQuantity: DecimalQuantitySchema,
    varianceQuantity: DecimalQuantitySchema,
    countedBy: z.string().min(1).max(128),
    countedAt: z.string().datetime(),
    recountRequired: z.boolean().default(false),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type CountEntryV1 = z.infer<typeof CountEntryV1Schema>;

export const InventoryAdjustmentV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    adjustmentNumber: z.string().min(1).max(64),
    countPlanId: z.string().uuid().optional().nullable(),
    warehouseId: z.string().uuid(),
    locationId: z.string().uuid(),
    productId: z.string().uuid(),
    lotId: z.string().uuid().optional().nullable(),
    serialId: z.string().uuid().optional().nullable(),
    quantity: DecimalQuantitySchema,
    reason: LedgerMovementReasonSchema,
    status: AdjustmentStatusSchema.default('PENDING_APPROVAL'),
    makerActorId: z.string().min(1).max(128),
    approverActorId: z.string().min(1).max(128).optional().nullable(),
    approvedAt: z.string().datetime().optional().nullable(),
    notes: InventoryDescriptionSchema,
    version: z.number().int().min(1).default(1),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type InventoryAdjustmentV1 = z.infer<typeof InventoryAdjustmentV1Schema>;

export const BarcodeResolutionResultV1Schema = z
  .object({
    rawCode: z.string(),
    entityType: z.enum(['PRODUCT', 'LOCATION', 'LOT', 'SERIAL', 'KIT', 'UNKNOWN']),
    matchedEntityId: z.string().uuid().optional().nullable(),
    matchedCode: z.string().optional().nullable(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type BarcodeResolutionResultV1 = z.infer<typeof BarcodeResolutionResultV1Schema>;

export const InventoryReferenceMappingV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    sourceSystem: z.string().min(1).max(100),
    sourceKey: z.string().min(1).max(255),
    entityType: z.enum(['WAREHOUSE', 'LOCATION', 'ITEM', 'LOT', 'SERIAL', 'RECEIPT']),
    gigalibsEntityId: z.string().uuid(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type InventoryReferenceMappingV1 = z.infer<typeof InventoryReferenceMappingV1Schema>;

// ─── Input DTOs ───────────────────────────────────────────────────────────────

export const CreateWarehouseInputV1Schema = z
  .object({
    code: InventoryCodeSchema,
    name: InventoryNameSchema,
    description: InventoryDescriptionSchema,
    warehouseType: WarehouseTypeSchema,
    orgUnitId: z.string().optional().nullable(),
    placeId: z.string().optional().nullable(),
    address: z.string().max(500).optional().nullable(),
  })
  .strict();
export type CreateWarehouseInputV1 = z.infer<typeof CreateWarehouseInputV1Schema>;

export const UpdateWarehouseInputV1Schema = z
  .object({
    expectedVersion: z.number().int().min(1),
    name: InventoryNameSchema.optional(),
    description: InventoryDescriptionSchema,
    warehouseType: WarehouseTypeSchema.optional(),
    orgUnitId: z.string().optional().nullable(),
    placeId: z.string().optional().nullable(),
    address: z.string().max(500).optional().nullable(),
    isActive: z.boolean().optional(),
  })
  .strict();
export type UpdateWarehouseInputV1 = z.infer<typeof UpdateWarehouseInputV1Schema>;

export const CreateLocationInputV1Schema = z
  .object({
    warehouseId: z.string().uuid(),
    code: InventoryCodeSchema,
    name: InventoryNameSchema,
    locationType: LocationTypeSchema,
    parentLocationId: z.string().uuid().optional().nullable(),
    aisle: z.string().max(20).optional().nullable(),
    rack: z.string().max(20).optional().nullable(),
    shelf: z.string().max(20).optional().nullable(),
    bin: z.string().max(20).optional().nullable(),
    barcode: BarcodeSchema.optional().nullable(),
    allowNegative: z.boolean().optional(),
  })
  .strict();
export type CreateLocationInputV1 = z.infer<typeof CreateLocationInputV1Schema>;

export const CreateInventoryItemInputV1Schema = z
  .object({
    productId: z.string().uuid(),
    defaultWarehouseId: z.string().uuid().optional().nullable(),
    defaultLocationId: z.string().uuid().optional().nullable(),
    isLotTracked: z.boolean().optional(),
    isSerialTracked: z.boolean().optional(),
    shelfLifeDays: z.number().int().nonnegative().optional().nullable(),
    reorderPoint: DecimalQuantitySchema.optional().nullable(),
    safetyStock: DecimalQuantitySchema.optional().nullable(),
    valuationMethod: ValuationMethodSchema.optional(),
    standardCostMinor: MoneyMinorSchema.optional(),
  })
  .strict();
export type CreateInventoryItemInputV1 = z.infer<typeof CreateInventoryItemInputV1Schema>;

export const CreateLotInputV1Schema = z
  .object({
    productId: z.string().uuid(),
    lotNumber: z.string().trim().min(1).max(100),
    batchCode: z.string().max(100).optional().nullable(),
    supplierLotNumber: z.string().max(100).optional().nullable(),
    manufacturedDate: z.string().datetime().optional().nullable(),
    expiryDate: z.string().datetime().optional().nullable(),
    customExtensions: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type CreateLotInputV1 = z.infer<typeof CreateLotInputV1Schema>;

export const PostStockMovementInputV1Schema = z
  .object({
    documentType: z.string().min(1).max(50),
    documentReferenceId: z.string().max(128).optional().nullable(),
    reason: LedgerMovementReasonSchema,
    correlationId: z.string().min(1).max(128),
    idempotencyKey: z.string().min(1).max(128),
    sourceWarehouseId: z.string().uuid().optional().nullable(),
    sourceLocationId: z.string().uuid().optional().nullable(),
    targetWarehouseId: z.string().uuid(),
    targetLocationId: z.string().uuid(),
    productId: z.string().uuid(),
    uomId: z.string().uuid(),
    quantity: PositiveDecimalQuantitySchema,
    lotId: z.string().uuid().optional().nullable(),
    serialId: z.string().uuid().optional().nullable(),
    stockStatus: StockStatusSchema.default('AVAILABLE'),
    unitCostMinor: MoneyMinorSchema.optional().nullable(),
  })
  .strict();
export type PostStockMovementInputV1 = z.infer<typeof PostStockMovementInputV1Schema>;

export const CreateReservationInputV1Schema = z
  .object({
    reservationType: ReservationTypeSchema,
    demandType: z.enum(['WORK_ORDER', 'SALES_ORDER', 'TRANSFER', 'PROJECT']),
    demandReferenceId: z.string().min(1).max(128),
    demandLineId: z.string().max(128).optional().nullable(),
    warehouseId: z.string().uuid(),
    locationId: z.string().uuid().optional().nullable(),
    productId: z.string().uuid(),
    uomId: z.string().uuid(),
    quantity: PositiveDecimalQuantitySchema,
    expiryDate: z.string().datetime().optional().nullable(),
    idempotencyKey: z.string().max(128).optional().nullable(),
  })
  .strict();
export type CreateReservationInputV1 = z.infer<typeof CreateReservationInputV1Schema>;

export const CreateKitInputV1Schema = z
  .object({
    workOrderId: z.string().max(128),
    workOrderTaskId: z.string().max(128).optional().nullable(),
    warehouseId: z.string().uuid(),
    stagingLocationId: z.string().uuid().optional().nullable(),
    items: z.array(
      z
        .object({
          productId: z.string().uuid(),
          uomId: z.string().uuid(),
          requestedQuantity: PositiveDecimalQuantitySchema,
        })
        .strict(),
    ),
  })
  .strict();
export type CreateKitInputV1 = z.infer<typeof CreateKitInputV1Schema>;

export const SubmitCountEntryInputV1Schema = z
  .object({
    locationId: z.string().uuid(),
    productId: z.string().uuid(),
    lotId: z.string().uuid().optional().nullable(),
    serialId: z.string().uuid().optional().nullable(),
    countedQuantity: DecimalQuantitySchema,
  })
  .strict();
export type SubmitCountEntryInputV1 = z.infer<typeof SubmitCountEntryInputV1Schema>;

export const CreateReceiptLineInputV1Schema = z
  .object({
    productId: z.string().uuid(),
    uomId: z.string().uuid(),
    expectedQuantity: DecimalQuantitySchema,
    targetLocationId: z.string().uuid().optional().nullable(),
    lotNumber: z.string().max(100).optional().nullable(),
    expiryDate: z.string().datetime().optional().nullable(),
    purchaseOrderId: z.string().uuid().optional().nullable(),
    purchaseOrderLineId: z.string().uuid().optional().nullable(),
    customExtensions: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type CreateReceiptLineInputV1 = z.infer<typeof CreateReceiptLineInputV1Schema>;

export const CreateReceiptInputV1Schema = z
  .object({
    warehouseId: z.string().uuid(),
    supplierPartyId: z.string().uuid().optional().nullable(),
    carrierPartyId: z.string().uuid().optional().nullable(),
    externalDocumentReference: z.string().max(128).optional().nullable(),
    notes: z.string().max(1000).optional().nullable(),
    lines: z.array(CreateReceiptLineInputV1Schema).optional(),
  })
  .strict();
export type CreateReceiptInputV1 = z.infer<typeof CreateReceiptInputV1Schema>;

export const CreateCountPlanInputV1Schema = z
  .object({
    warehouseId: z.string().uuid(),
    name: InventoryNameSchema,
    planType: CountPlanTypeSchema,
    isBlindCount: z.boolean().optional().default(true),
    allowMovementsDuringCount: z.boolean().optional().default(false),
  })
  .strict();
export type CreateCountPlanInputV1 = z.infer<typeof CreateCountPlanInputV1Schema>;

export const ApproveAdjustmentInputV1Schema = z
  .object({
    notes: InventoryDescriptionSchema,
  })
  .strict();
export type ApproveAdjustmentInputV1 = z.infer<typeof ApproveAdjustmentInputV1Schema>;

// ─── Outbox Events ────────────────────────────────────────────────────────────

const BaseEventSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().min(1).max(64),
  correlationId: z.string().min(1).max(128),
  timestamp: z.string().datetime(),
  schemaVersion: z.literal(1),
});

export const ReceiptCompletedEventV1Schema = BaseEventSchema.extend({
  type: z.literal('inventory.receipt.completed.v1'),
  data: z
    .object({
      receiptId: z.string().uuid(),
      receiptNumber: z.string(),
      warehouseId: z.string().uuid(),
      totalLines: z.number().int(),
    })
    .strict(),
}).strict();
export type ReceiptCompletedEventV1 = z.infer<typeof ReceiptCompletedEventV1Schema>;

export const StockMovedEventV1Schema = BaseEventSchema.extend({
  type: z.literal('inventory.stock.moved.v1'),
  data: z
    .object({
      transactionId: z.string().uuid(),
      transactionNumber: z.string(),
      reason: LedgerMovementReasonSchema,
      productId: z.string().uuid(),
      quantity: DecimalQuantitySchema,
      sourceLocationId: z.string().uuid().optional().nullable(),
      targetLocationId: z.string().uuid(),
    })
    .strict(),
}).strict();
export type StockMovedEventV1 = z.infer<typeof StockMovedEventV1Schema>;

export const StockBalanceChangedEventV1Schema = BaseEventSchema.extend({
  type: z.literal('inventory.balance.changed.v1'),
  data: z
    .object({
      warehouseId: z.string().uuid(),
      locationId: z.string().uuid(),
      productId: z.string().uuid(),
      onHandQuantity: DecimalQuantitySchema,
      availableQuantity: DecimalQuantitySchema,
      reservedQuantity: DecimalQuantitySchema,
    })
    .strict(),
}).strict();
export type StockBalanceChangedEventV1 = z.infer<typeof StockBalanceChangedEventV1Schema>;

export const ReservationChangedEventV1Schema = BaseEventSchema.extend({
  type: z.literal('inventory.reservation.changed.v1'),
  data: z
    .object({
      reservationId: z.string().uuid(),
      demandReferenceId: z.string(),
      productId: z.string().uuid(),
      status: ReservationStatusSchema,
      quantity: DecimalQuantitySchema,
    })
    .strict(),
}).strict();
export type ReservationChangedEventV1 = z.infer<typeof ReservationChangedEventV1Schema>;

export const KitStagedEventV1Schema = BaseEventSchema.extend({
  type: z.literal('inventory.kit.staged.v1'),
  data: z
    .object({
      kitId: z.string().uuid(),
      kitNumber: z.string(),
      workOrderId: z.string(),
      stagingLocationId: z.string().uuid(),
    })
    .strict(),
}).strict();
export type KitStagedEventV1 = z.infer<typeof KitStagedEventV1Schema>;

export const KitIssuedEventV1Schema = BaseEventSchema.extend({
  type: z.literal('inventory.kit.issued.v1'),
  data: z
    .object({
      kitId: z.string().uuid(),
      kitNumber: z.string(),
      workOrderId: z.string(),
      assignedTechnicianId: z.string().optional().nullable(),
    })
    .strict(),
}).strict();
export type KitIssuedEventV1 = z.infer<typeof KitIssuedEventV1Schema>;

export const CountClosedEventV1Schema = BaseEventSchema.extend({
  type: z.literal('inventory.count.closed.v1'),
  data: z
    .object({
      countPlanId: z.string().uuid(),
      planNumber: z.string(),
      warehouseId: z.string().uuid(),
      totalVariances: z.number().int(),
    })
    .strict(),
}).strict();
export type CountClosedEventV1 = z.infer<typeof CountClosedEventV1Schema>;

export const AdjustmentApprovedEventV1Schema = BaseEventSchema.extend({
  type: z.literal('inventory.adjustment.approved.v1'),
  data: z
    .object({
      adjustmentId: z.string().uuid(),
      adjustmentNumber: z.string(),
      productId: z.string().uuid(),
      quantity: DecimalQuantitySchema,
      reason: LedgerMovementReasonSchema,
      approverActorId: z.string(),
    })
    .strict(),
}).strict();
export type AdjustmentApprovedEventV1 = z.infer<typeof AdjustmentApprovedEventV1Schema>;

export type InventoryEventV1 =
  | ReceiptCompletedEventV1
  | StockMovedEventV1
  | StockBalanceChangedEventV1
  | ReservationChangedEventV1
  | KitStagedEventV1
  | KitIssuedEventV1
  | CountClosedEventV1
  | AdjustmentApprovedEventV1;
