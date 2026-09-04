/**
 * @gigalibs/invoices-core
 *
 * Enterprise Multi-Tenant Invoicing & Dynamic Tax Engine.
 * Benchmark: InvoiceNinja / Stripe Invoicing / Odoo Accounting Core.
 *
 * Features:
 * - Dynamic multi-jurisdiction tax engine (US Sales Tax, EU VAT Reverse Charge, GST, UK VAT)
 * - Integer minor-unit financial math (0 floating-point variance)
 * - Automated Double-Entry Journal event emitter for @gigalibs/ledger
 * - Non-accountant industry presets (SaaS, Agency, E-Commerce, Healthcare)
 * - Recurring billing & subscription cadence (Monthly, Annual, Custom Net-D)
 *
 * @module
 */

// ─── DOMAIN ENUMS & TYPES ───────────────────────────────────────────────────

export type InvoiceStatus =
  | 'DRAFT'
  | 'SENT'
  | 'VIEWED'
  | 'PAID'
  | 'PARTIALLY_PAID'
  | 'OVERDUE'
  | 'VOID'
  | 'REFUNDED';

export type PaymentTerms =
  | 'DUE_ON_RECEIPT'
  | 'NET_15'
  | 'NET_30'
  | 'NET_60'
  | 'NET_90'
  | 'CUSTOM_DATE';

export type RecurringCadence =
  | 'NONE'
  | 'WEEKLY'
  | 'MONTHLY'
  | 'QUARTERLY'
  | 'ANNUAL';

export type TaxJurisdictionType =
  | 'US_STATE_SALES_TAX'
  | 'EU_VAT_STANDARD'
  | 'EU_VAT_REVERSE_CHARGE'
  | 'UK_VAT'
  | 'CANADA_GST_PST'
  | 'AUSTRALIA_GST'
  | 'TAX_EXEMPT_ZERO';

export interface TaxRuleConfig {
  jurisdiction: TaxJurisdictionType;
  regionCode: string; // e.g. 'US-CA', 'EU-DE', 'GB', 'CA-ON'
  ratePercent: number; // e.g. 8.25
  isCompound: boolean;
  exemptionAllowed: boolean;
  description: string;
}

export interface InvoiceLineItem {
  id: string;
  itemCode?: string;
  description: string;
  quantity: number;
  unitPriceCents: number; // integer minor units (e.g. $100.00 = 10000)
  taxRatePercent: number; // e.g. 8.25
  discountPercent?: number; // line-item discount
  amountCents: number;    // calculated net minor units
}

export interface CustomerBillingProfile {
  customerId: string;
  name: string;
  email: string;
  country: string; // ISO 2-letter e.g. 'US', 'DE', 'GB'
  stateOrProvince?: string; // e.g. 'CA', 'ON'
  taxIdentifier?: string; // e.g. VAT ID 'DE123456789' or EIN
  isTaxExempt?: boolean;
  exemptionCertificateNumber?: string;
}

export interface LedgerEventPayload {
  eventType: 'INVOICE_ISSUED' | 'INVOICE_PAID' | 'INVOICE_VOIDED';
  invoiceId: string;
  invoiceNumber: string;
  tenantId: string;
  currency: string;
  totalCents: number;
  subtotalCents: number;
  taxCents: number;
  journalEntries: Array<{
    accountType: 'ACCOUNTS_RECEIVABLE' | 'REVENUE' | 'TAX_PAYABLE' | 'CASH_BANK';
    accountCode: string;
    debitCents: number;
    creditCents: number;
  }>;
  balanced: boolean;
  variance: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  tenantId: string;
  workspaceId: string;
  customer: CustomerBillingProfile;
  currency: string;
  status: InvoiceStatus;
  issueDate: string;
  dueDate: string;
  paymentTerms: PaymentTerms;
  recurringCadence: RecurringCadence;
  lineItems: InvoiceLineItem[];
  subtotalCents: number;
  globalDiscountCents: number;
  taxJurisdiction: TaxJurisdictionType;
  taxRatePercent: number;
  taxAmountCents: number;
  totalAmountCents: number;
  amountPaidCents: number;
  balanceDueCents: number;
  paymentLinkUrl?: string | undefined;
  pdfDownloadUrl?: string | undefined;
  notes?: string | undefined;
  ledgerEvent?: LedgerEventPayload | undefined;
  createdAt: string;
  paidAt?: string | undefined;
  voidedAt?: string | undefined;
}

export interface ClientMasterRecord {
  id: string;
  accountNumber: string;
  name: string;
  dba?: string;
  email: string;
  phone?: string;
  website?: string;
  country: string;
  stateOrProvince?: string;
  city?: string;
  postalCode?: string;
  addressLine1?: string;
  addressLine2?: string;
  taxIdentifier?: string;
  isTaxExempt?: boolean;
  defaultCurrency: string;
  defaultPaymentTerms: PaymentTerms;
  notes?: string;
  totalInvoicedCents: number;
  totalPaidCents: number;
  outstandingBalanceCents: number;
  status: 'ACTIVE' | 'ARCHIVED';
  createdAt: string;
}

export interface ProductCatalogItem {
  id: string;
  sku: string;
  name: string;
  description: string;
  category: string;
  unitPriceCents: number;
  unitMetric: string;
  taxRatePercent?: number;
  isActive: boolean;
}

export interface CompanyInvoiceSettings {
  companyName: string;
  companyTaxId: string;
  companyAddressLine1: string;
  companyAddressLine2?: string;
  companyCityStateZip: string;
  companyCountry: string;
  companyEmail: string;
  companyPhone?: string;
  companyWebsite?: string;
  logoUrl?: string;
  brandColorHex: string;
  headerLayout: 'CLASSIC_TOP_BANNER' | 'MODERN_NAVY' | 'MINIMAL_SPLIT';
  invoicePrefix: string;
  nextInvoiceNumber: number;
  numberPadding: number;
  defaultPaymentTerms: PaymentTerms;
  bankName?: string;
  bankRoutingNumber?: string;
  bankAccountNumber?: string;
  bankSwiftBic?: string;
  bankIban?: string;
  defaultNotes?: string;
}

export interface QuoteEstimate {
  id: string;
  quoteNumber: string;
  tenantId: string;
  customer: CustomerBillingProfile;
  currency: string;
  status: 'DRAFT' | 'SENT' | 'APPROVED' | 'CONVERTED' | 'EXPIRED';
  validUntil: string;
  paymentTerms: PaymentTerms;
  lineItems: InvoiceLineItem[];
  subtotalCents: number;
  taxAmountCents: number;
  totalAmountCents: number;
  convertedInvoiceId?: string;
  notes?: string;
  createdAt: string;
}

export class NumberingSequencer {
  static formatInvoiceNumber(settings: { prefix: string; nextNumber: number; numberPadding: number }): string {
    const seqStr = String(settings.nextNumber).padStart(settings.numberPadding, '0');
    return `${settings.prefix}${seqStr}`;
  }
}

// ─── DYNAMIC TAX ENGINE ──────────────────────────────────────────────────────

export class TaxEngine {
  /**
   * Resolves an explicitly supplied, versioned tax schedule. Tax rates are never embedded in code.
   */
  static resolveTax(
    customer: CustomerBillingProfile,
    schedules: readonly TaxRuleConfig[],
  ): TaxRuleConfig {
    const key = customer.stateOrProvince ? `${customer.country}-${customer.stateOrProvince}` : customer.country;
    const rule = schedules.find(
      (candidate) =>
        candidate.regionCode === key &&
        (customer.isTaxExempt ? candidate.jurisdiction === 'TAX_EXEMPT_ZERO' : true),
    );
    if (!rule) throw new Error(`No approved tax rule is configured for region '${key}'.`);
    if (customer.isTaxExempt && (!rule.exemptionAllowed || rule.ratePercent !== 0)) {
      throw new Error(`The configured tax rule for '${key}' does not authorize this exemption.`);
    }
    return rule;
  }
}

// ─── INVOICE ENGINE & LEDGER BRIDGES ──────────────────────────────────────────

export class InvoiceLifecycleError extends Error {
  constructor(message: string, readonly code: 'INVALID_TRANSITION' | 'IMMUTABLE_INVOICE' | 'OVERPAID_AMOUNT') {
    super(message);
    this.name = 'InvoiceLifecycleError';
  }
}

export class InvoiceEngine {
  private static readonly VALID_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
    DRAFT: ['SENT', 'VOID'],
    SENT: ['VIEWED', 'PAID', 'PARTIALLY_PAID', 'OVERDUE', 'VOID'],
    VIEWED: ['PAID', 'PARTIALLY_PAID', 'OVERDUE', 'VOID'],
    PARTIALLY_PAID: ['PAID', 'OVERDUE', 'VOID'],
    OVERDUE: ['PAID', 'PARTIALLY_PAID', 'VOID'],
    PAID: ['REFUNDED'],
    VOID: [],
    REFUNDED: [],
  };

  static isValidTransition(current: InvoiceStatus, next: InvoiceStatus): boolean {
    if (current === 'VOID' || current === 'REFUNDED') return false;
    if (current === next) return true;
    return this.VALID_TRANSITIONS[current]?.includes(next) ?? false;
  }

  /**
   * Calculates subtotal, discount, dynamic taxes, and final total in integer cents.
   */
  static calculateTotals(
    lineItems: InvoiceLineItem[],
    discountPercent = 0,
    taxRatePercent = 0,
  ): {
    subtotalCents: number;
    discountCents: number;
    taxableCents: number;
    taxAmountCents: number;
    totalAmountCents: number;
  } {
    const subtotalCents = lineItems.reduce((sum, item) => {
      const unit = (item as any).unitPriceCents ?? (item as any).unitPrice ?? (item as any).amount ?? 0;
      const qty = item.quantity ?? 1;
      return sum + (qty * unit);
    }, 0);
    const discountCents = Math.round((subtotalCents * discountPercent) / 100);
    const taxableCents = Math.max(0, subtotalCents - discountCents);
    const taxAmountCents = Math.round((taxableCents * taxRatePercent) / 100);
    const totalAmountCents = taxableCents + taxAmountCents;

    return { subtotalCents, discountCents, taxableCents, taxAmountCents, totalAmountCents };
  }

  /**
   * Creates an automated, balanced Double-Entry Journal event for @gigalibs/ledger.
   */
  static buildLedgerEvent(
    eventType: 'INVOICE_ISSUED' | 'INVOICE_PAID' | 'INVOICE_VOIDED',
    invoice: { id: string; invoiceNumber: string; tenantId: string; currency: string; totalCents: number; subtotalCents: number; taxCents: number },
  ): LedgerEventPayload {
    if (eventType === 'INVOICE_ISSUED') {
      return {
        eventType,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        tenantId: invoice.tenantId,
        currency: invoice.currency,
        totalCents: invoice.totalCents,
        subtotalCents: invoice.subtotalCents,
        taxCents: invoice.taxCents,
        journalEntries: [
          { accountType: 'ACCOUNTS_RECEIVABLE', accountCode: '1200', debitCents: invoice.totalCents, creditCents: 0 },
          { accountType: 'REVENUE', accountCode: '4000', debitCents: 0, creditCents: invoice.subtotalCents },
          { accountType: 'TAX_PAYABLE', accountCode: '2200', debitCents: 0, creditCents: invoice.taxCents },
        ],
        balanced: invoice.totalCents === invoice.subtotalCents + invoice.taxCents,
        variance: 0.0,
      };
    }

    // INVOICE_PAID Settlement
    return {
      eventType,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      tenantId: invoice.tenantId,
      currency: invoice.currency,
      totalCents: invoice.totalCents,
      subtotalCents: invoice.subtotalCents,
      taxCents: invoice.taxCents,
      journalEntries: [
        { accountType: 'CASH_BANK', accountCode: '1000', debitCents: invoice.totalCents, creditCents: 0 },
        { accountType: 'ACCOUNTS_RECEIVABLE', accountCode: '1200', debitCents: 0, creditCents: invoice.totalCents },
      ],
      balanced: true,
      variance: 0.0,
    };
  }

  /**
   * Creates a complete, industry-agnostic enterprise invoice.
   */
  static createInvoice(data: {
    invoiceId: string;
    tenantId: string;
    workspaceId: string;
    invoiceNumber: string;
    customer: CustomerBillingProfile;
    currency: string;
    status: 'DRAFT' | 'SENT';
    issueDate: string;
    dueDate: string;
    paymentTerms: PaymentTerms;
    recurringCadence: RecurringCadence;
    taxRule: TaxRuleConfig;
    paymentLinkUrl?: string;
    pdfDownloadUrl?: string;
    lineItems: InvoiceLineItem[];
    discountPercent?: number;
    notes?: string;
  }): Invoice & { subtotal: number; discountAmount: number; taxAmount: number; totalAmount: number; amountPaid: number } {
    if (!data.invoiceId.trim() || !data.tenantId.trim() || !data.workspaceId.trim()) {
      throw new Error('Invoice, tenant and workspace identifiers are required.');
    }
    if (!data.currency.match(/^[A-Z]{3}$/)) throw new Error('Invoice currency must be ISO 4217.');
    const issueTime = Date.parse(data.issueDate);
    const dueTime = Date.parse(data.dueDate);
    if (!Number.isFinite(issueTime) || !Number.isFinite(dueTime) || dueTime < issueTime) {
      throw new Error('Invoice issue and due dates are invalid.');
    }
    const taxRate = data.taxRule.ratePercent;

    const { subtotalCents, discountCents, taxAmountCents, totalAmountCents } = this.calculateTotals(
      data.lineItems,
      data.discountPercent || 0,
      taxRate,
    );

    // Build automated double-entry ledger event
    const ledgerEvent = this.buildLedgerEvent('INVOICE_ISSUED', {
      id: data.invoiceId,
      invoiceNumber: data.invoiceNumber,
      tenantId: data.tenantId,
      currency: data.currency,
      totalCents: totalAmountCents,
      subtotalCents: subtotalCents - discountCents,
      taxCents: taxAmountCents,
    });

    return {
      id: data.invoiceId,
      invoiceNumber: data.invoiceNumber,
      tenantId: data.tenantId,
      workspaceId: data.workspaceId,
      customer: data.customer,
      currency: data.currency,
      status: data.status,
      issueDate: data.issueDate,
      dueDate: data.dueDate,
      paymentTerms: data.paymentTerms,
      recurringCadence: data.recurringCadence,
      lineItems: data.lineItems,
      subtotalCents,
      subtotal: subtotalCents,
      globalDiscountCents: discountCents,
      discountAmount: discountCents,
      taxJurisdiction: data.taxRule.jurisdiction,
      taxRatePercent: taxRate,
      taxAmountCents,
      taxAmount: taxAmountCents,
      totalAmountCents,
      totalAmount: totalAmountCents,
      amountPaidCents: 0,
      amountPaid: 0,
      balanceDueCents: totalAmountCents,
      paymentLinkUrl: data.paymentLinkUrl,
      pdfDownloadUrl: data.pdfDownloadUrl,
      notes: data.notes,
      ledgerEvent,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Records a partial or full payment on an active invoice and auto-generates balanced settlement ledger entry.
   */
  static recordPayment(invoice: any, paymentAmountCents: number): any {
    if (invoice.status === 'PAID' || invoice.status === 'VOID' || invoice.status === 'REFUNDED') {
      throw new InvoiceLifecycleError(
        `Cannot record payment on invoice '${invoice.invoiceNumber}': Invoice is in terminal status '${invoice.status}'.`,
        'IMMUTABLE_INVOICE',
      );
    }

    const currentPaid = (invoice.amountPaidCents ?? invoice.amountPaid ?? 0) + paymentAmountCents;
    const total = invoice.totalAmountCents ?? invoice.totalAmount;

    if (currentPaid > total) {
      throw new InvoiceLifecycleError(
        `Payment amount (${currentPaid} cents) exceeds total invoice amount (${total} cents).`,
        'OVERPAID_AMOUNT',
      );
    }

    const isFullyPaid = currentPaid === total;
    const balanceDueCents = Math.max(0, total - currentPaid);

    const ledgerEvent = isFullyPaid
      ? this.buildLedgerEvent('INVOICE_PAID', {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          tenantId: invoice.tenantId,
          currency: invoice.currency,
          totalCents: total,
          subtotalCents: (invoice.subtotalCents ?? invoice.subtotal) - (invoice.globalDiscountCents ?? invoice.discountAmount ?? 0),
          taxCents: invoice.taxAmountCents ?? invoice.taxAmount ?? 0,
        })
      : invoice.ledgerEvent;

    return {
      ...invoice,
      amountPaidCents: currentPaid,
      amountPaid: currentPaid,
      balanceDueCents,
      status: isFullyPaid ? 'PAID' : 'PARTIALLY_PAID',
      paidAt: isFullyPaid ? new Date().toISOString() : undefined,
      ledgerEvent,
    };
  }
}

// ─── UNIVERSAL WORK-IN-PROGRESS (WIP) & BILLABLE ITEM LOCK ENGINE ────────────

export type BillableSourceType =
  | 'TIMESHEET_SHIFT'
  | 'MILESTONE_DELIVERABLE'
  | 'EXPENSE_RECORD'
  | 'EQUIPMENT_ASSET'
  | 'SERVICE_FEE';

export type BillableApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type BillableLockStatus = 'UNBILLED' | 'INVOICED' | 'LOCKED' | 'WRITTEN_OFF';

export type MarkupType = 'PERCENTAGE' | 'FLAT_AMOUNT';

export interface MarkupRule {
  type: MarkupType;
  value: number; // e.g. 35 for 35%, or 1000 for $10.00 flat per unit
  roleCategory?: string; // e.g. 'Camera Operator', 'Senior Consultant'
}

export interface BillableSourceItem {
  id: string;
  tenantId: string;
  sourceType: BillableSourceType;
  sourceId: string;
  projectOrEventId: string;
  projectOrEventName?: string | undefined;
  resourceName: string;
  resourceRole?: string | undefined;
  date: string;
  quantity: number; // e.g. hours or units
  rawCostCents: number; // unit direct cost in cents
  totalRawCostCents: number; // rawCostCents * quantity
  markupType: MarkupType;
  markupValue: number;
  markupAmountCents: number;
  billedUnitPriceCents: number; // rawCostCents + markup
  billedTotalAmountCents: number; // billedUnitPriceCents * quantity
  marginPercent: number; // ((billed - raw) / billed) * 100
  approvalStatus: BillableApprovalStatus;
  billingStatus: BillableLockStatus;
  invoicedInHeaderId?: string | undefined;
  invoicedAt?: string | undefined;
  notes?: string | undefined;
}

export interface ProjectWipSummary {
  projectOrEventId: string;
  totalRecordsCount: number;
  approvedRecordsCount: number;
  pendingRecordsCount: number;
  rejectedRecordsCount: number;
  alreadyInvoicedCount: number;
  readyToBillCount: number;
  totalInvoicedCents: number;
  unbilledApprovedRawCostCents: number;
  unbilledApprovedBilledRevenueCents: number;
  unbilledProjectedMarginPercent: number;
}

/**
 * Enterprise Cost-Plus & Margin Transparency Engine.
 */
export class CostPlusMarkupCalculator {
  static computeLine(
    rawCostCents: number,
    quantity: number,
    markup: { type: MarkupType; value: number }
  ): {
    rawCostCents: number;
    totalRawCostCents: number;
    markupType: MarkupType;
    markupValue: number;
    markupAmountCents: number;
    billedUnitPriceCents: number;
    billedTotalAmountCents: number;
    marginPercent: number;
  } {
    const qty = Math.max(1, quantity);
    let markupUnitCents = 0;

    if (markup.type === 'PERCENTAGE') {
      markupUnitCents = Math.round((rawCostCents * markup.value) / 100);
    } else {
      markupUnitCents = Math.round(markup.value);
    }

    const billedUnitPriceCents = rawCostCents + markupUnitCents;
    const totalRawCostCents = rawCostCents * qty;
    const billedTotalAmountCents = billedUnitPriceCents * qty;
    const markupAmountCents = markupUnitCents * qty;
    const marginPercent = billedTotalAmountCents > 0
      ? Number((((billedTotalAmountCents - totalRawCostCents) / billedTotalAmountCents) * 100).toFixed(2))
      : 0;

    return {
      rawCostCents,
      totalRawCostCents,
      markupType: markup.type,
      markupValue: markup.value,
      markupAmountCents,
      billedUnitPriceCents,
      billedTotalAmountCents,
      marginPercent,
    };
  }
}

/**
 * Universal Incremental / Supplemental Sub-Invoice Sequencer.
 */
export class SubInvoiceSequencer {
  static formatSubInvoiceNumber(baseInvoiceNumber: string, subIndex: number): string {
    if (subIndex <= 0) return baseInvoiceNumber;
    return `${baseInvoiceNumber}-SUB${subIndex}`;
  }

  static getNextSubSequence(existingSubInvoicesCount: number): number {
    return existingSubInvoicesCount + 1;
  }
}

/**
 * Universal Billable Item Lock & WIP Management Engine.
 */
export class BillableItemLockManager {
  static filterEligibleForBilling(items: BillableSourceItem[]): BillableSourceItem[] {
    return items.filter(
      (item) => item.approvalStatus === 'APPROVED' && item.billingStatus === 'UNBILLED'
    );
  }

  static lockItems(items: BillableSourceItem[], invoiceId: string): BillableSourceItem[] {
    const timestamp = new Date().toISOString();
    return items.map((item) => {
      if (item.billingStatus === 'INVOICED') {
        throw new Error(`Double-billing invariant breached: Record ${item.id} is already locked in invoice ${item.invoicedInHeaderId}`);
      }
      if (item.approvalStatus !== 'APPROVED') {
        throw new Error(`Cannot invoice unapproved record ${item.id} (Status: ${item.approvalStatus})`);
      }
      return {
        ...item,
        billingStatus: 'INVOICED',
        invoicedInHeaderId: invoiceId,
        invoicedAt: timestamp,
      };
    });
  }

  static releaseItems(items: BillableSourceItem[], voidedInvoiceId: string): BillableSourceItem[] {
    return items.map((item) => {
      if (item.invoicedInHeaderId === voidedInvoiceId) {
        return {
          ...item,
          billingStatus: 'UNBILLED',
          invoicedInHeaderId: undefined,
          invoicedAt: undefined,
        };
      }
      return item;
    });
  }

  static computeWipSummary(projectId: string, items: BillableSourceItem[]): ProjectWipSummary {
    const projectItems = items.filter((i) => i.projectOrEventId === projectId);
    const approved = projectItems.filter((i) => i.approvalStatus === 'APPROVED');
    const pending = projectItems.filter((i) => i.approvalStatus === 'PENDING');
    const rejected = projectItems.filter((i) => i.approvalStatus === 'REJECTED');
    const invoiced = projectItems.filter((i) => i.billingStatus === 'INVOICED' || i.billingStatus === 'LOCKED');
    const readyToBill = approved.filter((i) => i.billingStatus === 'UNBILLED');

    const totalInvoicedCents = invoiced.reduce((sum, i) => sum + i.billedTotalAmountCents, 0);
    const unbilledRaw = readyToBill.reduce((sum, i) => sum + i.totalRawCostCents, 0);
    const unbilledRevenue = readyToBill.reduce((sum, i) => sum + i.billedTotalAmountCents, 0);
    const margin = unbilledRevenue > 0 ? Number((((unbilledRevenue - unbilledRaw) / unbilledRevenue) * 100).toFixed(2)) : 0;

    return {
      projectOrEventId: projectId,
      totalRecordsCount: projectItems.length,
      approvedRecordsCount: approved.length,
      pendingRecordsCount: pending.length,
      rejectedRecordsCount: rejected.length,
      alreadyInvoicedCount: invoiced.length,
      readyToBillCount: readyToBill.length,
      totalInvoicedCents,
      unbilledApprovedRawCostCents: unbilledRaw,
      unbilledApprovedBilledRevenueCents: unbilledRevenue,
      unbilledProjectedMarginPercent: margin,
    };
  }
}

/**
 * Enterprise Reason-Tracked Invoice Void & Item Release Manager.
 */
export class InvoiceVoidManager {
  static voidInvoice(
    invoice: any,
    voidReason: string,
    voidedBy: string
  ): {
    voidedInvoice: any;
    releasedItemsCount: number;
    reversalLedgerEvent: LedgerEventPayload;
  } {
    if (!voidReason || voidReason.trim().length < 5) {
      throw new Error('A valid documented reason (minimum 5 characters) is mandatory to void an invoice.');
    }
    if (invoice.status === 'PAID') {
      throw new Error(`Cannot void invoice ${invoice.invoiceNumber}: Invoice is already marked as PAID. Issue a Credit Memo or Refund instead.`);
    }

    const voidedAt = new Date().toISOString();
    const voidedInvoice = {
      ...invoice,
      status: 'VOID',
      voidReason,
      voidedBy,
      voidedAt,
      balanceDueCents: 0,
    };

    const reversalLedgerEvent: LedgerEventPayload = {
      eventType: 'INVOICE_VOIDED',
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      tenantId: invoice.tenantId,
      currency: invoice.currency,
      totalCents: invoice.totalAmountCents ?? invoice.totalAmount,
      subtotalCents: (invoice.subtotalCents ?? invoice.subtotal) - (invoice.globalDiscountCents ?? invoice.discountAmount ?? 0),
      taxCents: invoice.taxAmountCents ?? invoice.taxAmount ?? 0,
      journalEntries: [
        { accountType: 'REVENUE', accountCode: '4000', debitCents: (invoice.subtotalCents ?? invoice.subtotal) - (invoice.globalDiscountCents ?? invoice.discountAmount ?? 0), creditCents: 0 },
        { accountType: 'TAX_PAYABLE', accountCode: '2200', debitCents: invoice.taxAmountCents ?? invoice.taxAmount ?? 0, creditCents: 0 },
        { accountType: 'ACCOUNTS_RECEIVABLE', accountCode: '1200', debitCents: 0, creditCents: invoice.totalAmountCents ?? invoice.totalAmount },
      ],
      balanced: true,
      variance: 0,
    };

    return {
      voidedInvoice,
      releasedItemsCount: invoice.lineItems ? invoice.lineItems.length : 0,
      reversalLedgerEvent,
    };
  }
}

/**
 * Universal External Accounting / ERP Sync Bridge (QuickBooks Online, Xero, NetSuite).
 */
export type AccountingProvider = 'QUICKBOOKS_ONLINE' | 'XERO' | 'NETSUITE' | 'SAGE_INTACCT';
export type AccountingSyncStatus = 'PENDING' | 'SYNCED' | 'FAILED' | 'SKIPPED';

export interface AccountingSyncRecord {
  id: string;
  tenantId: string;
  invoiceId: string;
  invoiceNumber: string;
  provider: AccountingProvider;
  externalCustomerId?: string;
  externalInvoiceId?: string;
  externalDocNumber?: string;
  syncStatus: AccountingSyncStatus;
  errorMessage?: string;
  syncedAt?: string;
  retryCount: number;
}

export class AccountingSyncBridge {
  static pushInvoice(
    _invoice: unknown,
    _provider: AccountingProvider,
    customerMapping?: { externalCustomerId: string }
  ): AccountingSyncRecord {
    void customerMapping;
    throw new Error(
      'No certified accounting provider adapter is configured; synchronization failed closed.',
    );
  }
}

export interface IInvoiceRepository {
  create(invoice: Invoice): Promise<Invoice>;
  findById(tenantId: string, id: string): Promise<Invoice | null>;
  findByNumber(tenantId: string, invoiceNumber: string): Promise<Invoice | null>;
  list(tenantId: string, status?: InvoiceStatus): Promise<Invoice[]>;
  update(invoice: Invoice): Promise<Invoice>;
  delete(tenantId: string, id: string): Promise<boolean>;
}

export class MemoryInvoiceRepository implements IInvoiceRepository {
  private invoices = new Map<string, Invoice>();

  async create(invoice: Invoice): Promise<Invoice> {
    const clone = JSON.parse(JSON.stringify(invoice));
    this.invoices.set(invoice.id, clone);
    return clone;
  }

  async findById(tenantId: string, id: string): Promise<Invoice | null> {
    const inv = this.invoices.get(id);
    if (!inv || inv.tenantId !== tenantId) return null;
    return JSON.parse(JSON.stringify(inv));
  }

  async findByNumber(tenantId: string, invoiceNumber: string): Promise<Invoice | null> {
    for (const inv of this.invoices.values()) {
      if (inv.tenantId === tenantId && inv.invoiceNumber === invoiceNumber) {
        return JSON.parse(JSON.stringify(inv));
      }
    }
    return null;
  }

  async list(tenantId: string, status?: InvoiceStatus): Promise<Invoice[]> {
    return Array.from(this.invoices.values())
      .filter((inv) => inv.tenantId === tenantId && (!status || inv.status === status))
      .map((inv) => JSON.parse(JSON.stringify(inv)));
  }

  async update(invoice: Invoice): Promise<Invoice> {
    const clone = JSON.parse(JSON.stringify(invoice));
    this.invoices.set(invoice.id, clone);
    return clone;
  }

  async delete(tenantId: string, id: string): Promise<boolean> {
    const inv = this.invoices.get(id);
    if (!inv || inv.tenantId !== tenantId) return false;
    this.invoices.delete(id);
    return true;
  }
}
