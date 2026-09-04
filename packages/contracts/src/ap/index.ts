import { z } from 'zod';
import {
  DataClassificationSchema,
  OperationalJsonObjectSchema,
} from '../operational-intelligence/index.js';

const DecimalQuantitySchema = z
  .string()
  .trim()
  .regex(/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,6})?$/)
  .refine((value) => Number(value) > 0, 'Quantity must be greater than zero.');

const CurrencySchema = z.string().regex(/^[A-Z]{3}$/);
const MinorAmountSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

export const PurchaseOrderPayloadSchema = z.object({
  purchaseOrderId: z.string().trim().min(1).max(128),
  supplierId: z.string().trim().min(1).max(128),
  supplierName: z.string().trim().min(1).max(200),
  currency: CurrencySchema,
  status: z.string().trim().min(1).max(80),
  orderedAt: z.string().datetime({ offset: true }),
  lines: z
    .array(
      z.object({
        lineNumber: z.number().int().positive(),
        itemCode: z.string().trim().max(128).nullable().optional(),
        description: z.string().trim().min(1).max(1_000),
        quantity: DecimalQuantitySchema,
        unitPriceMinor: MinorAmountSchema,
      }),
    )
    .min(1)
    .max(10_000),
});

export const GoodsReceiptPayloadSchema = z.object({
  goodsReceiptId: z.string().trim().min(1).max(128),
  purchaseOrderId: z.string().trim().min(1).max(128),
  receivedAt: z.string().datetime({ offset: true }),
  lines: z
    .array(
      z.object({
        purchaseOrderLineNumber: z.number().int().positive(),
        quantityReceived: DecimalQuantitySchema,
      }),
    )
    .min(1)
    .max(10_000),
});

export const SupplierInvoicePayloadSchema = z.object({
  supplierInvoiceId: z.string().trim().min(1).max(128),
  invoiceNumber: z.string().trim().min(1).max(128),
  supplierId: z.string().trim().min(1).max(128),
  supplierName: z.string().trim().min(1).max(200),
  purchaseOrderId: z.string().trim().min(1).max(128),
  currency: CurrencySchema,
  invoiceDate: z.string().datetime({ offset: true }),
  dueDate: z.string().datetime({ offset: true }).nullable().optional(),
  taxMinor: MinorAmountSchema,
  totalMinor: MinorAmountSchema,
  lines: z
    .array(
      z.object({
        lineNumber: z.number().int().positive(),
        purchaseOrderLineNumber: z.number().int().positive(),
        description: z.string().trim().min(1).max(1_000),
        quantity: DecimalQuantitySchema,
        unitPriceMinor: MinorAmountSchema,
        totalMinor: MinorAmountSchema,
      }),
    )
    .min(1)
    .max(10_000),
});

export const CreateApRuleSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2_000).optional(),
  kind: z.enum(['AP_THREE_WAY_MATCH', 'AP_ACTION_POLICY']),
});

export const ApMatchRuleDefinitionSchema = z.object({
  amountToleranceMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  quantityToleranceBps: z.number().int().min(0).max(10_000),
  requireReceipt: z.boolean(),
  blockCurrencyMismatch: z.boolean(),
});

export const ApActionPolicyDefinitionSchema = z.object({
  actionType: z.literal('AP_APPROVE_FOR_PAYMENT'),
  risk: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  requiresApproval: z.literal(true),
  requiredApprovals: z.number().int().min(1).max(10),
  approverRoles: z
    .array(z.enum(['TENANT_ADMIN', 'MANAGER']))
    .min(1)
    .max(2)
    .refine((roles) => new Set(roles).size === roles.length, 'Approver roles must be unique.'),
  maxAmountMinor: MinorAmountSchema,
  prohibitSelfApproval: z.boolean(),
  valueOutcomeKey: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .optional(),
});

export const PublishApRuleVersionSchema = z.object({
  definition: z.union([ApMatchRuleDefinitionSchema, ApActionPolicyDefinitionSchema]),
});

export const DecideBusinessActionSchema = z.object({
  reason: z.string().trim().min(3).max(2_000),
});

const ApDocumentStatusSchema = z.enum([
  'RECEIVED',
  'MATCHING',
  'MATCHED',
  'EXCEPTION',
  'PENDING_APPROVAL',
  'APPROVED_FOR_PAYMENT',
  'REJECTED',
]);

const BusinessActionStatusSchema = z.enum([
  'PROPOSED',
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'EXECUTING',
  'SUCCEEDED',
  'FAILED',
  'RECONCILIATION_REQUIRED',
]);

const BoundedListSchema = z.object({
  environmentId: z.string().trim().min(1).optional(),
  cursor: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const ListSupplierInvoicesSchema = BoundedListSchema.extend({
  status: ApDocumentStatusSchema.optional(),
});

export const ListBusinessActionsSchema = BoundedListSchema.extend({
  status: BusinessActionStatusSchema.optional(),
});

export const ListOperationalExceptionsSchema = BoundedListSchema.extend({
  status: z
    .enum(['OPEN', 'ASSIGNED', 'RETRY_SCHEDULED', 'RESOLVED', 'RECONCILIATION_REQUIRED'])
    .optional(),
  kind: z
    .enum([
      'PROCESSING_FAILURE',
      'BUSINESS_MISMATCH',
      'MISSING_EVIDENCE',
      'ACTION_FAILURE',
      'RECONCILIATION',
    ])
    .optional(),
  assignedToId: z.string().trim().min(1).max(128).optional(),
});

export const ExceptionRecoveryCommandSchema = z.object({
  reason: z.string().trim().min(3).max(2_000),
  idempotencyKey: z.string().trim().min(8).max(128),
});

export const AssignOperationalExceptionSchema = ExceptionRecoveryCommandSchema.extend({
  assignedToId: z.string().trim().min(1).max(128),
});

export const EditAndReplayExceptionSchema = ExceptionRecoveryCommandSchema.extend({
  replacementPayload: OperationalJsonObjectSchema,
});

export const CreateValueDefinitionSchema = z.object({
  environmentId: z.string().trim().min(1).max(128),
  outcomeKey: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2_000).optional(),
  currency: CurrencySchema,
  classification: DataClassificationSchema,
});

export const ApProcessingValueAssumptionsSchema = z
  .object({
    manualMinutesPerCase: z.number().int().min(1).max(10_080),
    automatedMinutesPerCase: z.number().int().min(0).max(10_080),
    humanReviewMinutesPerCase: z.number().int().min(0).max(10_080),
    loadedHourlyCostMinor: MinorAmountSchema,
    monthlyPlatformCostMinor: MinorAmountSchema,
    monthlyIntegrationOperatingCostMinor: MinorAmountSchema,
  })
  .refine(
    (value) => value.automatedMinutesPerCase <= value.manualMinutesPerCase,
    'Automated minutes cannot exceed the manual baseline.',
  );

export const ValueBaselineSchema = z.object({
  monthlyCaseVolume: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  periodStart: z.string().date(),
  periodEnd: z.string().date(),
  evidenceReference: z.string().trim().min(1).max(512),
});

export const ValueTargetSchema = z.object({
  automationRateBps: z.number().int().min(0).max(10_000),
  targetDate: z.string().date(),
});

export const PublishValueDefinitionSchema = z.object({
  formulaKind: z.literal('AP_PROCESSING_COST_AVOIDED'),
  assumptions: ApProcessingValueAssumptionsSchema,
  baseline: ValueBaselineSchema,
  target: ValueTargetSchema,
});

export const DecideValueEventSchema = z.object({
  reason: z.string().trim().min(3).max(2_000),
});

export const ListValueDefinitionsSchema = BoundedListSchema.extend({
  status: z.enum(['DRAFT', 'ACTIVE', 'RETIRED']).optional(),
});

export const ListValueEventsSchema = BoundedListSchema.extend({
  status: z.enum(['CALCULATED', 'VERIFIED', 'REJECTED']).optional(),
  valueDefinitionId: z.string().trim().min(1).max(128).optional(),
});

export const ValueReportQuerySchema = z
  .object({
    environmentId: z.string().trim().min(1).max(128).optional(),
    occurredFrom: z.string().datetime({ offset: true }).optional(),
    occurredTo: z.string().datetime({ offset: true }).optional(),
  })
  .refine(
    (value) =>
      !value.occurredFrom ||
      !value.occurredTo ||
      new Date(value.occurredFrom) <= new Date(value.occurredTo),
    { message: 'occurredFrom must be before or equal to occurredTo.' },
  );

export type PurchaseOrderPayload = z.infer<typeof PurchaseOrderPayloadSchema>;
export type GoodsReceiptPayload = z.infer<typeof GoodsReceiptPayloadSchema>;
export type SupplierInvoicePayload = z.infer<typeof SupplierInvoicePayloadSchema>;
export type CreateApRuleDto = z.infer<typeof CreateApRuleSchema>;
export type ApMatchRuleDefinition = z.infer<typeof ApMatchRuleDefinitionSchema>;
export type ApActionPolicyDefinition = z.infer<typeof ApActionPolicyDefinitionSchema>;
export type PublishApRuleVersionDto = z.infer<typeof PublishApRuleVersionSchema>;
export type DecideBusinessActionDto = z.infer<typeof DecideBusinessActionSchema>;
export type ListSupplierInvoicesDto = z.infer<typeof ListSupplierInvoicesSchema>;
export type ListBusinessActionsDto = z.infer<typeof ListBusinessActionsSchema>;
export type ListOperationalExceptionsDto = z.infer<typeof ListOperationalExceptionsSchema>;
export type ExceptionRecoveryCommandDto = z.infer<typeof ExceptionRecoveryCommandSchema>;
export type AssignOperationalExceptionDto = z.infer<typeof AssignOperationalExceptionSchema>;
export type EditAndReplayExceptionDto = z.infer<typeof EditAndReplayExceptionSchema>;
export type CreateValueDefinitionDto = z.infer<typeof CreateValueDefinitionSchema>;
export type ApProcessingValueAssumptions = z.infer<typeof ApProcessingValueAssumptionsSchema>;
export type PublishValueDefinitionDto = z.infer<typeof PublishValueDefinitionSchema>;
export type DecideValueEventDto = z.infer<typeof DecideValueEventSchema>;
export type ListValueDefinitionsDto = z.infer<typeof ListValueDefinitionsSchema>;
export type ListValueEventsDto = z.infer<typeof ListValueEventsSchema>;
export type ValueReportQueryDto = z.infer<typeof ValueReportQuerySchema>;
