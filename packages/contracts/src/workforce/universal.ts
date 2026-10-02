import { z } from 'zod';

// ─── Universal WorkforceOps Contracts (WI-WFO-001) ───────────────────────────

export const WfoWorkerTypeV1Schema = z.enum(['INDIVIDUAL', 'AGENCY', 'TPV', 'CONTINGENT']);
export type WfoWorkerTypeV1 = z.infer<typeof WfoWorkerTypeV1Schema>;

export const WfoWorkerLifecycleStatusV1Schema = z.enum([
  'PROSPECT_LEAD',
  'PROSPECT',
  'ONBOARDING',
  'ACTIVE',
  'INACTIVE',
  'SUSPENDED',
  'ARCHIVED',
]);
export type WfoWorkerLifecycleStatusV1 = z.infer<typeof WfoWorkerLifecycleStatusV1Schema>;

export const WfoComplianceDocStatusV1Schema = z.enum(['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED']);
export type WfoComplianceDocStatusV1 = z.infer<typeof WfoComplianceDocStatusV1Schema>;

export const WfoEngagementTypeV1Schema = z.enum([
  'EVENT',
  'PROJECT',
  'WORK_ORDER',
  'ROUTE',
  'VOYAGE',
  'ROSTER_PERIOD',
  'SHOOT_DAY',
  'POST',
  'DUTY_ROSTER',
]);
export type WfoEngagementTypeV1 = z.infer<typeof WfoEngagementTypeV1Schema>;

export const WfoEngagementSourceTypeV1Schema = z.enum([
  'MANUAL',
  'IDEMPIERE_PROJECT',
  'IDEMPIERE_WORK_ORDER',
  'IDEMPIERE_SO',
  'CRM_OPPORTUNITY',
]);
export type WfoEngagementSourceTypeV1 = z.infer<typeof WfoEngagementSourceTypeV1Schema>;

export const WfoEngagementStatusV1Schema = z.enum(['DRAFT', 'PUBLISHED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']);
export type WfoEngagementStatusV1 = z.infer<typeof WfoEngagementStatusV1Schema>;

export const WfoRateTypeV1Schema = z.enum(['HOURLY', 'DAILY', 'PIECE_RATE', 'FLAT', 'DIFFERENTIAL']);
export type WfoRateTypeV1 = z.infer<typeof WfoRateTypeV1Schema>;

export const WfoPositionStatusV1Schema = z.enum(['OPEN', 'PARTIALLY_FILLED', 'FILLED', 'CANCELLED']);
export type WfoPositionStatusV1 = z.infer<typeof WfoPositionStatusV1Schema>;

// Worker DTOs
export const CreateWfoWorkerV1Schema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().max(32).nullable().optional(),
  workerType: WfoWorkerTypeV1Schema.default('INDIVIDUAL'),
  primaryOrgUnitId: z.string().trim().max(64).nullable().optional(),
  skills: z.array(z.string().trim().min(1)).default([]),
  identityHash: z.string().trim().max(128).nullable().optional(),
  unionId: z.string().trim().max(64).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type CreateWfoWorkerV1 = z.infer<typeof CreateWfoWorkerV1Schema>;

export const UpdateWfoWorkerV1Schema = z.object({
  expectedVersion: z.number().int().positive(),
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
  phone: z.string().trim().max(32).nullable().optional(),
  primaryOrgUnitId: z.string().trim().max(64).nullable().optional(),
  skills: z.array(z.string().trim().min(1)).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type UpdateWfoWorkerV1 = z.infer<typeof UpdateWfoWorkerV1Schema>;

export const WfoWorkerRecordV1Schema = z.object({
  id: z.string().uuid(),
  tenantId: z.string(),
  portalUserId: z.string().nullable().optional(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
  phone: z.string().nullable().optional(),
  workerType: WfoWorkerTypeV1Schema,
  lifecycleStatus: WfoWorkerLifecycleStatusV1Schema,
  onboardingPct: z.number().int().min(0).max(100),
  identityHash: z.string().nullable().optional(),
  unionId: z.string().nullable().optional(),
  primaryOrgUnitId: z.string().nullable().optional(),
  skills: z.array(z.string()),
  externalIds: z.record(z.string(), z.unknown()),
  metadata: z.record(z.string(), z.unknown()),
  version: z.number().int().positive(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type WfoWorkerRecordV1 = z.infer<typeof WfoWorkerRecordV1Schema>;

// Compliance Doc DTOs
export const CreateWfoComplianceDocV1Schema = z.object({
  docType: z.string().trim().min(1).max(64),
  fileUrl: z.string().trim().url().max(1024),
  expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});
export type CreateWfoComplianceDocV1 = z.infer<typeof CreateWfoComplianceDocV1Schema>;

export const VerifyWfoComplianceDocV1Schema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  notes: z.string().trim().max(1000).nullable().optional(),
});
export type VerifyWfoComplianceDocV1 = z.infer<typeof VerifyWfoComplianceDocV1Schema>;

export const WfoComplianceDocRecordV1Schema = z.object({
  id: z.string().uuid(),
  tenantId: z.string(),
  workerId: z.string().uuid(),
  docType: z.string(),
  fileUrl: z.string(),
  status: WfoComplianceDocStatusV1Schema,
  expiresAt: z.string().nullable().optional(),
  verifiedBy: z.string().nullable().optional(),
  verifiedAt: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type WfoComplianceDocRecordV1 = z.infer<typeof WfoComplianceDocRecordV1Schema>;

// Engagement DTOs
export const CreateWfoEngagementV1Schema = z.object({
  name: z.string().trim().min(1).max(200),
  engagementType: WfoEngagementTypeV1Schema.default('EVENT'),
  sourceType: WfoEngagementSourceTypeV1Schema.default('MANUAL'),
  orgUnitId: z.string().trim().max(64).nullable().optional(),
  placeId: z.string().uuid().nullable().optional(),
  clientId: z.string().trim().max(64).nullable().optional(),
  externalId: z.string().trim().max(128).nullable().optional(),
  startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  perDiemAllowed: z.boolean().default(false),
  perDiemAmount: z.number().nonnegative().nullable().optional(),
  guaranteedHours: z.number().nonnegative().nullable().optional(),
  config: z.record(z.string(), z.unknown()).default({}),
});
export type CreateWfoEngagementV1 = z.infer<typeof CreateWfoEngagementV1Schema>;

export const UpdateWfoEngagementV1Schema = z.object({
  expectedVersion: z.number().int().positive(),
  name: z.string().trim().min(1).max(200).optional(),
  orgUnitId: z.string().trim().max(64).nullable().optional(),
  placeId: z.string().uuid().nullable().optional(),
  startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  perDiemAllowed: z.boolean().optional(),
  perDiemAmount: z.number().nonnegative().nullable().optional(),
  guaranteedHours: z.number().nonnegative().nullable().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});
export type UpdateWfoEngagementV1 = z.infer<typeof UpdateWfoEngagementV1Schema>;

export const WfoEngagementRecordV1Schema = z.object({
  id: z.string().uuid(),
  tenantId: z.string(),
  orgUnitId: z.string().nullable().optional(),
  placeId: z.string().uuid().nullable().optional(),
  sourceType: WfoEngagementSourceTypeV1Schema,
  externalId: z.string().nullable().optional(),
  clientId: z.string().nullable().optional(),
  engagementType: WfoEngagementTypeV1Schema,
  name: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
  status: WfoEngagementStatusV1Schema,
  perDiemAllowed: z.boolean(),
  perDiemAmount: z.number().nullable().optional(),
  guaranteedHours: z.number().nullable().optional(),
  config: z.record(z.string(), z.unknown()),
  version: z.number().int().positive(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type WfoEngagementRecordV1 = z.infer<typeof WfoEngagementRecordV1Schema>;

// Position DTOs
export const CreateWfoEngagementPositionV1Schema = z.object({
  title: z.string().trim().min(1).max(200),
  jobProfileId: z.string().uuid().nullable().optional(),
  orgUnitId: z.string().trim().max(64).nullable().optional(),
  quantity: z.number().int().min(1).max(1000),
  rateType: WfoRateTypeV1Schema.default('HOURLY'),
  rateAmount: z.number().nonnegative(),
  currency: z.string().trim().length(3).default('USD'),
  config: z.record(z.string(), z.unknown()).default({}),
});
export type CreateWfoEngagementPositionV1 = z.infer<typeof CreateWfoEngagementPositionV1Schema>;

export const WfoEngagementPositionRecordV1Schema = z.object({
  id: z.string().uuid(),
  tenantId: z.string(),
  engagementId: z.string().uuid(),
  jobProfileId: z.string().uuid().nullable().optional(),
  title: z.string(),
  orgUnitId: z.string().nullable().optional(),
  quantity: z.number().int(),
  filled: z.number().int(),
  rateType: WfoRateTypeV1Schema,
  rateAmount: z.number(),
  currency: z.string(),
  status: WfoPositionStatusV1Schema,
  config: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type WfoEngagementPositionRecordV1 = z.infer<typeof WfoEngagementPositionRecordV1Schema>;

// ─── Staffing & Invitations (WI-WFO-002) ─────────────────────────────────────

export const WfoInvitationStatusV1Schema = z.enum([
  'INVITED',
  'ACCEPTED',
  'DECLINED',
  'EXPIRED',
  'CANCELLED',
]);
export type WfoInvitationStatusV1 = z.infer<typeof WfoInvitationStatusV1Schema>;

export const CreateWfoInvitationV1Schema = z.object({
  positionId: z.string().uuid(),
  workerId: z.string().uuid(),
  rateOverride: z.number().nonnegative().nullable().optional(),
  message: z.string().trim().max(1000).nullable().optional(),
});
export type CreateWfoInvitationV1 = z.infer<typeof CreateWfoInvitationV1Schema>;

export const BulkInviteRowV1Schema = z.object({
  email: z.string().trim().email(),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  phone: z.string().trim().max(32).optional(),
  positionCode: z.string().trim().min(1),
  rateOverride: z.number().nonnegative().optional(),
  notes: z.string().trim().max(500).optional(),
});
export type BulkInviteRowV1 = z.infer<typeof BulkInviteRowV1Schema>;

export const BulkInviteSubmitV1Schema = z.object({
  rows: z.array(BulkInviteRowV1Schema).min(1).max(1000),
});
export type BulkInviteSubmitV1 = z.infer<typeof BulkInviteSubmitV1Schema>;

export const RespondWfoInvitationV1Schema = z.object({
  decision: z.enum(['ACCEPT', 'DECLINE']),
  reason: z.string().trim().max(500).nullable().optional(),
});
export type RespondWfoInvitationV1 = z.infer<typeof RespondWfoInvitationV1Schema>;

export const WfoInvitationRecordV1Schema = z.object({
  id: z.string().uuid(),
  tenantId: z.string(),
  engagementId: z.string().uuid(),
  positionId: z.string().uuid(),
  workerId: z.string().uuid(),
  status: WfoInvitationStatusV1Schema,
  rateOverride: z.number().nullable().optional(),
  message: z.string().nullable().optional(),
  respondedAt: z.string().nullable().optional(),
  responseReason: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type WfoInvitationRecordV1 = z.infer<typeof WfoInvitationRecordV1Schema>;

// Contracts
export const WfoContractStatusV1Schema = z.enum([
  'DRAFT',
  'SENT',
  'SIGNED',
  'APPROVED',
  'VOIDED',
]);
export type WfoContractStatusV1 = z.infer<typeof WfoContractStatusV1Schema>;

export const GenerateWfoContractV1Schema = z.object({
  positionId: z.string().uuid(),
  workerId: z.string().uuid(),
  templateCode: z.string().default('STANDARD_AGREEMENT'),
  title: z.string().trim().min(1).max(200),
  termsText: z.string().min(1),
});
export type GenerateWfoContractV1 = z.infer<typeof GenerateWfoContractV1Schema>;

export const SignWfoContractV1Schema = z.object({
  signatureHash: z.string().min(8).max(128),
  signedByIp: z.string().max(64).optional(),
});
export type SignWfoContractV1 = z.infer<typeof SignWfoContractV1Schema>;

export const WfoContractRecordV1Schema = z.object({
  id: z.string().uuid(),
  tenantId: z.string(),
  engagementId: z.string().uuid(),
  positionId: z.string().uuid(),
  workerId: z.string().uuid(),
  templateCode: z.string(),
  title: z.string(),
  status: WfoContractStatusV1Schema,
  fileUrl: z.string().nullable().optional(),
  termsText: z.string().nullable().optional(),
  signatureHash: z.string().nullable().optional(),
  signedAt: z.string().nullable().optional(),
  signedByIp: z.string().nullable().optional(),
  approvedBy: z.string().nullable().optional(),
  approvedAt: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type WfoContractRecordV1 = z.infer<typeof WfoContractRecordV1Schema>;

// ─── Expenses & Payroll Admin (WI-WFO-003) ───────────────────────────────────

export const WfoExpenseTypeV1Schema = z.enum([
  'TRAVEL',
  'MEALS',
  'EQUIPMENT',
  'MILEAGE',
  'PER_DIEM',
  'OTHER',
]);
export type WfoExpenseTypeV1 = z.infer<typeof WfoExpenseTypeV1Schema>;

export const WfoExpenseStatusV1Schema = z.enum([
  'DRAFT',
  'SUBMITTED',
  'APPROVED',
  'REJECTED',
  'PAID',
]);
export type WfoExpenseStatusV1 = z.infer<typeof WfoExpenseStatusV1Schema>;

export const CreateWfoExpenseReportV1Schema = z.object({
  engagementId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(200),
  notes: z.string().trim().max(1000).nullable().optional(),
});
export type CreateWfoExpenseReportV1 = z.infer<typeof CreateWfoExpenseReportV1Schema>;

export const AddWfoExpenseLineV1Schema = z.object({
  expenseType: WfoExpenseTypeV1Schema.default('OTHER'),
  amount: z.number().nonnegative(),
  currency: z.string().trim().length(3).default('USD'),
  mileageFrom: z.string().trim().max(200).optional(),
  mileageTo: z.string().trim().max(200).optional(),
  miles: z.number().nonnegative().optional(),
  receiptUrl: z.string().trim().url().max(1024).optional(),
  description: z.string().trim().max(500).optional(),
});
export type AddWfoExpenseLineV1 = z.infer<typeof AddWfoExpenseLineV1Schema>;

export const VerifyWfoExpenseLineV1Schema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  reason: z.string().trim().max(500).optional(),
});
export type VerifyWfoExpenseLineV1 = z.infer<typeof VerifyWfoExpenseLineV1Schema>;

export const WfoExpenseLineRecordV1Schema = z.object({
  id: z.string().uuid(),
  tenantId: z.string(),
  reportId: z.string().uuid(),
  expenseType: WfoExpenseTypeV1Schema,
  amount: z.number(),
  currency: z.string(),
  mileageFrom: z.string().nullable().optional(),
  mileageTo: z.string().nullable().optional(),
  miles: z.number().nullable().optional(),
  receiptUrl: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']),
  approvedBy: z.string().nullable().optional(),
  approvedAt: z.string().nullable().optional(),
  rejectionReason: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type WfoExpenseLineRecordV1 = z.infer<typeof WfoExpenseLineRecordV1Schema>;

export const WfoExpenseReportRecordV1Schema = z.object({
  id: z.string().uuid(),
  tenantId: z.string(),
  workerId: z.string().uuid(),
  engagementId: z.string().uuid().nullable().optional(),
  title: z.string(),
  status: WfoExpenseStatusV1Schema,
  totalAmount: z.number(),
  currency: z.string(),
  submittedAt: z.string().nullable().optional(),
  approvedBy: z.string().nullable().optional(),
  approvedAt: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type WfoExpenseReportRecordV1 = z.infer<typeof WfoExpenseReportRecordV1Schema>;

// ERP / iDempiere GL Journal Batch
export const WfoGlJournalLineV1Schema = z.object({
  lineNo: z.number().int().positive(),
  accountCode: z.string(),
  accountName: z.string(),
  debitAmount: z.number().nonnegative(),
  creditAmount: z.number().nonnegative(),
  currency: z.string(),
  description: z.string(),
  costCenter: z.string().optional(),
  engagementId: z.string().uuid().optional(),
});
export type WfoGlJournalLineV1 = z.infer<typeof WfoGlJournalLineV1Schema>;

export const WfoGlJournalBatchV1Schema = z.object({
  batchNo: z.string(),
  period: z.string(),
  totalDebit: z.number().nonnegative(),
  totalCredit: z.number().nonnegative(),
  currency: z.string(),
  isBalanced: z.boolean(),
  lines: z.array(WfoGlJournalLineV1Schema),
  generatedAt: z.string(),
});
export type WfoGlJournalBatchV1 = z.infer<typeof WfoGlJournalBatchV1Schema>;

// ─── Demand Forecasting & Shift Self-Service (WI-WFO-004) ────────────────────

export const WfoForecastSourceV1Schema = z.enum([
  'HISTORICAL',
  'CONNECTOR_PULL',
  'AI_MODEL',
  'MANUAL',
]);
export type WfoForecastSourceV1 = z.infer<typeof WfoForecastSourceV1Schema>;

export const WfoDemandForecastRecordV1Schema = z.object({
  id: z.string().uuid(),
  tenantId: z.string(),
  orgUnitId: z.string(),
  skillId: z.string().nullable().optional(),
  forecastDate: z.string(),
  demandUnits: z.number(),
  filledUnits: z.number(),
  confidencePct: z.number(),
  source: WfoForecastSourceV1Schema,
  notes: z.string().nullable().optional(),
  calculatedAt: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type WfoDemandForecastRecordV1 = z.infer<typeof WfoDemandForecastRecordV1Schema>;

export const WfoForecastQueryV1Schema = z.object({
  orgUnitId: z.string().optional(),
  skillId: z.string().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  horizon: z.enum(['30', '60', '90']).optional(),
});
export type WfoForecastQueryV1 = z.infer<typeof WfoForecastQueryV1Schema>;

export const WfoPositionsGapV1Schema = z.object({
  forecastDate: z.string(),
  orgUnitId: z.string(),
  skillId: z.string().nullable().optional(),
  demandUnits: z.number(),
  filledUnits: z.number(),
  gapUnits: z.number(),
  fillRatePct: z.number(),
  status: z.enum(['CRITICAL_GAP', 'MODERATE_GAP', 'OPTIMAL', 'OVERSTAFFED']),
});
export type WfoPositionsGapV1 = z.infer<typeof WfoPositionsGapV1Schema>;

export const WfoUtilisationReportV1Schema = z.object({
  orgUnitId: z.string(),
  period: z.string(),
  totalCapacityHours: z.number(),
  scheduledHours: z.number(),
  actualHours: z.number(),
  utilisationPct: z.number(),
  headcountActive: z.number(),
});
export type WfoUtilisationReportV1 = z.infer<typeof WfoUtilisationReportV1Schema>;

// Open Shifts Marketplace & Swaps
export const WfoOpenShiftV1Schema = z.object({
  bookingId: z.string().uuid(),
  engagementId: z.string().uuid().optional(),
  engagementTitle: z.string().optional(),
  orgUnitId: z.string(),
  positionTitle: z.string(),
  skillRequired: z.string().optional(),
  startsAt: z.string(),
  endsAt: z.string(),
  hourlyRate: z.number().optional(),
  location: z.string().optional(),
  status: z.string(),
});
export type WfoOpenShiftV1 = z.infer<typeof WfoOpenShiftV1Schema>;

export const ClaimWfoShiftV1Schema = z.object({
  bookingId: z.string().uuid(),
  workerId: z.string().uuid(),
  notes: z.string().trim().max(500).optional(),
});
export type ClaimWfoShiftV1 = z.infer<typeof ClaimWfoShiftV1Schema>;

export const CreateWfoShiftSwapV1Schema = z.object({
  fromBookingId: z.string().uuid(),
  fromWorkerId: z.string().uuid(),
  toWorkerId: z.string().uuid(),
  reason: z.string().trim().max(500).optional(),
});
export type CreateWfoShiftSwapV1 = z.infer<typeof CreateWfoShiftSwapV1Schema>;

export const RespondWfoShiftSwapV1Schema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  reason: z.string().trim().max(500).optional(),
});
export type RespondWfoShiftSwapV1 = z.infer<typeof RespondWfoShiftSwapV1Schema>;

export const WfoShiftSwapStatusV1Schema = z.enum([
  'PENDING',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
]);
export type WfoShiftSwapStatusV1 = z.infer<typeof WfoShiftSwapStatusV1Schema>;

export const WfoShiftSwapRecordV1Schema = z.object({
  id: z.string().uuid(),
  tenantId: z.string(),
  fromBookingId: z.string().uuid(),
  fromWorkerId: z.string().uuid(),
  fromWorkerName: z.string().optional(),
  toWorkerId: z.string().uuid(),
  toWorkerName: z.string().optional(),
  shiftStartsAt: z.string().optional(),
  shiftEndsAt: z.string().optional(),
  status: WfoShiftSwapStatusV1Schema,
  reason: z.string().nullable().optional(),
  rejectionReason: z.string().nullable().optional(),
  approvedBy: z.string().nullable().optional(),
  approvedAt: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type WfoShiftSwapRecordV1 = z.infer<typeof WfoShiftSwapRecordV1Schema>;

// ─── Compliance, Communications & Vendors (WI-WFO-005) ───────────────────────

export const WfoComplianceDashboardSummaryV1Schema = z.object({
  totalWorkers: z.number().int(),
  compliantWorkers: z.number().int(),
  pendingWorkers: z.number().int(),
  expiredWorkers: z.number().int(),
  complianceRatePct: z.number(),
  pendingDocumentsCount: z.number().int(),
  expiring30DaysCount: z.number().int(),
});
export type WfoComplianceDashboardSummaryV1 = z.infer<typeof WfoComplianceDashboardSummaryV1Schema>;

export const WfoComplianceAuditReportItemV1Schema = z.object({
  workerId: z.string().uuid(),
  workerName: z.string(),
  email: z.string(),
  documentType: z.string(),
  documentNumber: z.string().nullable().optional(),
  status: z.string(),
  expiresAt: z.string().nullable().optional(),
  verifiedAt: z.string().nullable().optional(),
  verifiedBy: z.string().nullable().optional(),
});
export type WfoComplianceAuditReportItemV1 = z.infer<typeof WfoComplianceAuditReportItemV1Schema>;

export const WfoSendMessageV1Schema = z.object({
  engagementId: z.string().uuid().optional(),
  recipientWorkerId: z.string().uuid().optional(),
  channel: z.enum(['EMAIL', 'PUSH', 'SMS', 'IN_APP']).default('IN_APP'),
  subject: z.string().trim().min(1).max(250),
  body: z.string().trim().min(1),
  eventType: z.string().default('BROADCAST'),
});
export type WfoSendMessageV1 = z.infer<typeof WfoSendMessageV1Schema>;

export const WfoNotificationRecordV1Schema = z.object({
  id: z.string().uuid(),
  tenantId: z.string(),
  recipientWorkerId: z.string().uuid().nullable().optional(),
  recipientName: z.string().optional(),
  channel: z.enum(['EMAIL', 'PUSH', 'SMS', 'IN_APP']),
  eventType: z.string(),
  subject: z.string(),
  body: z.string(),
  deliveryStatus: z.enum(['QUEUED', 'SENT', 'DELIVERED', 'FAILED']),
  sentAt: z.string(),
  createdAt: z.string(),
});
export type WfoNotificationRecordV1 = z.infer<typeof WfoNotificationRecordV1Schema>;

export const CreateWfoVendorV1Schema = z.object({
  name: z.string().trim().min(1).max(200),
  contactEmail: z.string().trim().email().optional(),
  contactPhone: z.string().trim().max(50).optional(),
  connectorId: z.string().optional(),
  taxId: z.string().trim().max(64).optional(),
  paymentTerms: z.string().trim().max(100).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type CreateWfoVendorV1 = z.infer<typeof CreateWfoVendorV1Schema>;

export const WfoVendorRecordV1Schema = z.object({
  id: z.string().uuid(),
  tenantId: z.string(),
  name: z.string(),
  contactEmail: z.string().nullable().optional(),
  contactPhone: z.string().nullable().optional(),
  connectorId: z.string().nullable().optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'TERMINATED']),
  taxId: z.string().nullable().optional(),
  paymentTerms: z.string().nullable().optional(),
  activeWorkersCount: z.number().int().optional(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type WfoVendorRecordV1 = z.infer<typeof WfoVendorRecordV1Schema>;

export const CreateWfoSupportTicketV1Schema = z.object({
  workerId: z.string().uuid(),
  category: z.enum(['PAYROLL', 'SCHEDULE', 'COMPLIANCE', 'EXPENSE', 'GENERAL']).default('GENERAL'),
  subject: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),
});
export type CreateWfoSupportTicketV1 = z.infer<typeof CreateWfoSupportTicketV1Schema>;

export const WfoSupportTicketRecordV1Schema = z.object({
  id: z.string().uuid(),
  tenantId: z.string(),
  workerId: z.string().uuid(),
  workerName: z.string().optional(),
  category: z.enum(['PAYROLL', 'SCHEDULE', 'COMPLIANCE', 'EXPENSE', 'GENERAL']),
  subject: z.string(),
  description: z.string(),
  status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']),
  resolutionNotes: z.string().nullable().optional(),
  assignedTo: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type WfoSupportTicketRecordV1 = z.infer<typeof WfoSupportTicketRecordV1Schema>;

// ─── Industry Packs & Workforce Analytics Reports (WI-WFO-006) ───────────────

export const WfoIndustryPackManifestV1Schema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  version: z.string(),
  description: z.string(),
  industry: z.string(),
  countryCode: z.string(),
  currency: z.string(),
  isActive: z.boolean().default(false),
  activatedAt: z.string().nullable().optional(),
  terminology: z.record(z.string(), z.unknown()).optional(),
  complianceDocsCount: z.number().int().optional(),
  earningTypesCount: z.number().int().optional(),
  rulesCount: z.number().int().optional(),
});
export type WfoIndustryPackManifestV1 = z.infer<typeof WfoIndustryPackManifestV1Schema>;

export const WfoActivatePackV1Schema = z.object({
  countryCode: z.string().length(2).default('US'),
});
export type WfoActivatePackV1 = z.infer<typeof WfoActivatePackV1Schema>;

export const WfoActivatedPackRecordV1Schema = z.object({
  id: z.string().uuid(),
  tenantId: z.string(),
  industrySlug: z.string(),
  countryCode: z.string(),
  activatedAt: z.string(),
  isActive: z.boolean(),
});
export type WfoActivatedPackRecordV1 = z.infer<typeof WfoActivatedPackRecordV1Schema>;

// Analytics Reports Schemas
export const WfoStaffingReportRowV1Schema = z.object({
  engagementId: z.string().uuid(),
  engagementTitle: z.string(),
  status: z.string(),
  positionTitle: z.string(),
  requiredHeadcount: z.number().int(),
  filledHeadcount: z.number().int(),
  fillRatePct: z.number(),
  hourlyRate: z.number().optional(),
});
export type WfoStaffingReportRowV1 = z.infer<typeof WfoStaffingReportRowV1Schema>;

export const WfoTimeLabourReportRowV1Schema = z.object({
  workerId: z.string().uuid(),
  workerName: z.string(),
  totalPunches: z.number().int(),
  totalHours: z.number(),
  regularHours: z.number(),
  overtimeHours: z.number(),
  exceptionsCount: z.number().int(),
});
export type WfoTimeLabourReportRowV1 = z.infer<typeof WfoTimeLabourReportRowV1Schema>;

export const WfoPayrollSummaryReportRowV1Schema = z.object({
  periodId: z.string(),
  periodName: z.string(),
  workerCount: z.number().int(),
  grossPay: z.number(),
  totalExpenses: z.number(),
  netPay: z.number(),
  currency: z.string(),
  status: z.string(),
});
export type WfoPayrollSummaryReportRowV1 = z.infer<typeof WfoPayrollSummaryReportRowV1Schema>;

export const WfoComplianceStatusReportRowV1Schema = z.object({
  documentType: z.string(),
  documentName: z.string(),
  totalUploaded: z.number().int(),
  verifiedCount: z.number().int(),
  pendingCount: z.number().int(),
  expiredCount: z.number().int(),
  complianceRatePct: z.number(),
});
export type WfoComplianceStatusReportRowV1 = z.infer<typeof WfoComplianceStatusReportRowV1Schema>;

export const WfoExpenseAnalyticsRowV1Schema = z.object({
  expenseType: z.string(),
  totalReports: z.number().int(),
  totalAmount: z.number(),
  approvedAmount: z.number(),
  pendingAmount: z.number(),
  currency: z.string(),
});
export type WfoExpenseAnalyticsRowV1 = z.infer<typeof WfoExpenseAnalyticsRowV1Schema>;

export const WfoUtilisationAnalyticsRowV1Schema = z.object({
  workerId: z.string().uuid(),
  workerName: z.string(),
  scheduledHours: z.number(),
  workedHours: z.number(),
  utilisationPct: z.number(),
  shiftsCompleted: z.number().int(),
});
export type WfoUtilisationAnalyticsRowV1 = z.infer<typeof WfoUtilisationAnalyticsRowV1Schema>;

export const WfoAbsenteeismReportRowV1Schema = z.object({
  workerId: z.string().uuid(),
  workerName: z.string(),
  scheduledShifts: z.number().int(),
  attendedShifts: z.number().int(),
  missedShifts: z.number().int(),
  noShowRatePct: z.number(),
});
export type WfoAbsenteeismReportRowV1 = z.infer<typeof WfoAbsenteeismReportRowV1Schema>;
