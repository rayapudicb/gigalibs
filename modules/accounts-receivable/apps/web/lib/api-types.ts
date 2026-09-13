export interface ProblemDetails {
  type?: string;
  title?: string;
  detail?: string;
  status?: number;
  correlationId?: string;
}

// ─── Shared sub-types ─────────────────────────────────────────────────────────

export interface BillingAddress {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

export interface BankDetails {
  bankName?: string;
  accountName?: string;
  accountNumber?: string;
  routingNumber?: string;
  iban?: string;
  swiftBic?: string;
  sortCode?: string;
  bsb?: string;
}

// ─── Customers ────────────────────────────────────────────────────────────────

export interface Customer {
  id: string;
  tenantId?: string;
  legalName: string;
  billingEmail: string;
  externalReference?: string;
  currency: string;
  status: 'ACTIVE' | 'INACTIVE';
  phone?: string;
  website?: string;
  taxId?: string;
  taxIdType?: 'VAT' | 'GST' | 'EIN' | 'ABN' | 'GSTIN' | 'OTHER';
  billingAddress?: BillingAddress;
  paymentTermsDays?: number;
  creditLimitMinor?: number;
  notes?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerContact {
  id: string;
  customerId: string;
  name: string;
  email: string;
  phone?: string;
  role: 'BILLING' | 'PRIMARY' | 'CC' | 'TECHNICAL' | 'ACCOUNTS_PAYABLE';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Billing Entity ───────────────────────────────────────────────────────────

export interface BillingEntity {
  id: string;
  tenantId: string;
  legalName: string;
  legalIdentifier: string | null;
  tradingName: string | null;
  registrationNumber: string | null;
  taxId: string | null;
  taxIdType: string | null;
  defaultCurrency: string;
  locale: string;
  timeZone: string;
  address: BillingAddress | null;
  phone: string | null;
  email: string | null;
  emailReplyTo: string | null;
  website: string | null;
  logoUrl: string | null;
  bankDetails: BankDetails | null;
  defaultPaymentTermsDays: number;
  lateFeesBasisPoints: number;
  invoiceFooterText: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

// ─── Invoice Series ───────────────────────────────────────────────────────────

export interface InvoiceSeries {
  id: string;
  billingEntityId: string;
  code: string;
  prefix: string;
  padding: number;
  isDefault: boolean;
  nextSequence: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

// ─── Invoices ─────────────────────────────────────────────────────────────────

export interface InvoiceLine {
  position: number;
  description: string;
  quantity: string;
  unitAmountMinor: number;
  amountMinor: number;
}

export interface Invoice {
  id: string;
  billingEntityId: string;
  invoiceSeriesId: string;
  customerId: string;
  invoiceNumber: string | null;
  status: 'DRAFT' | 'ISSUED';
  currency: string;
  issueDate: string;
  dueDate: string;
  purchaseOrderReference?: string;
  lines: InvoiceLine[];
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  amountPaidMinor: number;
  amountDueMinor: number;
  isVoided: boolean;
  version: number;
  issuedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Payments ─────────────────────────────────────────────────────────────────

export type PaymentMethod = 'WIRE' | 'ACH' | 'CHECK' | 'CARD' | 'CREDIT_NOTE' | 'MANUAL';

export interface PaymentRecord {
  id: string;
  invoiceId: string;
  amountMinor: number;
  currency: string;
  paymentMethod: PaymentMethod;
  paymentReference?: string;
  notes?: string;
  paidAt: string;
  recordedBy: string;
  createdAt: string;
}

export interface VoidRecord {
  id: string;
  invoiceId: string;
  reason: string;
  voidedBy: string;
  voidedAt: string;
}

// ─── Deliveries ───────────────────────────────────────────────────────────────

export interface InvoiceDelivery {
  id: string;
  invoiceId: string;
  pdfRenderId: string;
  recipientEmail: string;
  recipientName: string;
  subjectLine: string;
  status: 'PENDING' | 'SENT' | 'FAILED';
  failureReason?: string;
  sentAt: string | null;
  deliveredBy: string;
  createdAt: string;
}

// ─── Credit notes ─────────────────────────────────────────────────────────────

export interface CreditNoteLine {
  position: number;
  description: string;
  quantity: string;
  unitAmountMinor: number;
  amountMinor: number;
}

export interface CreditNote {
  id: string;
  invoiceId: string;
  creditNoteNumber: string;
  currency: string;
  reason: string;
  issueDate: string;
  lines: CreditNoteLine[];
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  issuedBy: string;
  issuedAt: string;
}

// ─── Collections ──────────────────────────────────────────────────────────────

export type CollectionEventType = 'REMINDER_SENT' | 'ESCALATED' | 'RESOLVED' | 'NOTE_ADDED';
export type CollectionChannel = 'EMAIL' | 'PHONE' | 'LETTER' | 'PORTAL';

export interface CollectionEvent {
  id: string;
  invoiceId: string;
  eventType: CollectionEventType;
  channel: CollectionChannel | null;
  note: string | null;
  actor: string;
  occurredAt: string;
}

// ─── Aging ────────────────────────────────────────────────────────────────────

export type AgingBucket =
  | 'CURRENT'
  | 'OVERDUE_1_30'
  | 'OVERDUE_31_60'
  | 'OVERDUE_61_90'
  | 'OVERDUE_90_PLUS'
  | 'PAID'
  | 'VOIDED';

export interface AgingRow {
  invoiceId: string;
  draftId: string;
  invoiceNumber: string;
  customerId: string;
  currency: string;
  totalMinor: number;
  amountPaidMinor: number;
  amountDueMinor: number;
  dueDate: string;
  daysOverdue: number;
  agingBucket: AgingBucket;
}

// ─── Setup ────────────────────────────────────────────────────────────────────

export interface SetupResponse {
  tenantId: string;
  billingEntityId: string;
  invoiceSeriesId: string;
  legalName: string;
  legalIdentifier?: string;
  defaultCurrency: string;
  locale: string;
  timeZone: string;
  invoiceSeriesCode: string;
  invoicePrefix: string;
  invoicePadding: number;
  status: 'ACTIVE';
}
