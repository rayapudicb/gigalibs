import { randomUUID } from 'node:crypto';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import type { ArPrincipal } from '../auth/authorization.js';
import { DatabaseService } from '../database/database.service.js';
import { ArConflictError } from '../http/problem.filter.js';

// ─── Schemas ─────────────────────────────────────────────────────────────────

const addressSchema = z
  .object({
    line1: z.string().trim().min(1).max(200).optional(),
    line2: z.string().trim().min(1).max(200).optional(),
    city: z.string().trim().min(1).max(100).optional(),
    state: z.string().trim().min(1).max(100).optional(),
    postalCode: z.string().trim().min(1).max(20).optional(),
    country: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .optional(),
  })
  .strict()
  .optional();

const bankDetailsSchema = z
  .object({
    bankName: z.string().trim().min(1).max(200).optional(),
    accountName: z.string().trim().min(1).max(200).optional(),
    accountNumber: z.string().trim().min(1).max(50).optional(),
    routingNumber: z.string().trim().min(1).max(50).optional(),
    iban: z.string().trim().min(1).max(50).optional(),
    swiftBic: z.string().trim().min(1).max(20).optional(),
    sortCode: z.string().trim().min(1).max(20).optional(),
    bsb: z.string().trim().min(1).max(20).optional(),
  })
  .strict()
  .optional();

const updateBillingEntitySchema = z
  .object({
    legalName: z.string().trim().min(1).max(200).optional(),
    legalIdentifier: z.string().trim().min(1).max(100).nullish(),
    tradingName: z.string().trim().min(1).max(200).nullish(),
    registrationNumber: z.string().trim().min(1).max(100).nullish(),
    taxId: z.string().trim().min(1).max(50).nullish(),
    taxIdType: z
      .enum(['VAT', 'GST', 'EIN', 'ABN', 'GSTIN', 'OTHER'])
      .nullish(),
    defaultCurrency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .optional(),
    locale: z.string().trim().min(2).max(35).optional(),
    timeZone: z.string().trim().min(1).max(100).optional(),
    address: addressSchema,
    phone: z.string().trim().min(1).max(50).nullish(),
    email: z.string().email().max(320).nullish(),
    emailReplyTo: z.string().email().max(320).nullish(),
    website: z.string().url().max(500).nullish(),
    logoUrl: z.string().url().max(500).nullish(),
    bankDetails: bankDetailsSchema,
    defaultPaymentTermsDays: z.number().int().min(0).max(365).optional(),
    lateFeesBasisPoints: z.number().int().min(0).max(5000).optional(),
    invoiceFooterText: z.string().trim().max(2000).nullish(),
  })
  .strict()
  .refine((d) => Object.keys(d).length > 0, {
    message: 'At least one field must be provided.',
  });

// ─── Response shape ───────────────────────────────────────────────────────────

export interface BillingEntityResponse {
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
  address: object | null;
  phone: string | null;
  email: string | null;
  emailReplyTo: string | null;
  website: string | null;
  logoUrl: string | null;
  bankDetails: object | null;
  defaultPaymentTermsDays: number;
  lateFeesBasisPoints: number;
  invoiceFooterText: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

// ─── DB row → response ────────────────────────────────────────────────────────

function rowToResponse(row: Record<string, unknown>): BillingEntityResponse {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    legalName: row.legal_name as string,
    legalIdentifier: (row.legal_identifier as string | null) ?? null,
    tradingName: (row.trading_name as string | null) ?? null,
    registrationNumber: (row.registration_number as string | null) ?? null,
    taxId: (row.tax_id as string | null) ?? null,
    taxIdType: (row.tax_id_type as string | null) ?? null,
    defaultCurrency: row.default_currency as string,
    locale: row.locale as string,
    timeZone: row.time_zone as string,
    address: (row.address as object | null) ?? null,
    phone: (row.phone as string | null) ?? null,
    email: (row.email as string | null) ?? null,
    emailReplyTo: (row.email_reply_to as string | null) ?? null,
    website: (row.website as string | null) ?? null,
    logoUrl: (row.logo_url as string | null) ?? null,
    bankDetails: (row.bank_details as object | null) ?? null,
    defaultPaymentTermsDays: (row.default_payment_terms_days as number) ?? 30,
    lateFeesBasisPoints: (row.late_fees_basis_points as number) ?? 0,
    invoiceFooterText: (row.invoice_footer_text as string | null) ?? null,
    version: row.version as number,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class BillingEntityService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  // ── GET /v1/billing-entity ────────────────────────────────────────────────

  async get(principal: ArPrincipal): Promise<BillingEntityResponse> {
    const result = await this.database.withTenantTransaction(principal.tenantId, async (client) => {
      return client.query<Record<string, unknown>>(
        `SELECT * FROM gigalibs_ar.billing_entities WHERE tenant_id = $1 LIMIT 1`,
        [principal.tenantId],
      );
    });
    if (!result.rows[0]) {
      throw new NotFoundException('No billing entity configured. Complete workspace setup first.');
    }
    return rowToResponse(result.rows[0]);
  }

  // ── PUT /v1/billing-entity ────────────────────────────────────────────────

  async update(
    rawInput: unknown,
    ifMatch: string | undefined,
    principal: ArPrincipal,
    correlationId: string,
  ): Promise<BillingEntityResponse> {
    const input = updateBillingEntitySchema.parse(rawInput);
    const expectedVersion = parseEtag(ifMatch);

    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      // Lock the row
      const lockResult = await client.query<Record<string, unknown>>(
        `SELECT * FROM gigalibs_ar.billing_entities WHERE tenant_id = $1 LIMIT 1 FOR UPDATE`,
        [principal.tenantId],
      );
      if (!lockResult.rows[0]) {
        throw new NotFoundException('No billing entity configured.');
      }
      const current = lockResult.rows[0];

      // Optimistic concurrency check
      if (expectedVersion !== undefined && (current.version as number) !== expectedVersion) {
        throw new ArConflictError(
          'OPTIMISTIC_LOCK_CONFLICT',
          `Billing entity was modified (current version: ${current.version as number}).`,
        );
      }

      // Validate locale/timezone if changing
      if (input.locale || input.timeZone) {
        validateLocaleAndTimeZone(
          (input.locale ?? current.locale) as string,
          (input.timeZone ?? current.time_zone) as string,
        );
      }

      // Build SET clause
      const setParts: string[] = [];
      const values: unknown[] = [principal.tenantId];
      let idx = 2;

      function addSet(col: string, val: unknown) {
        setParts.push(`${col} = $${idx++}`);
        values.push(val);
      }

      if (input.legalName !== undefined) addSet('legal_name', input.legalName);
      if ('legalIdentifier' in input) addSet('legal_identifier', input.legalIdentifier ?? null);
      if ('tradingName' in input) addSet('trading_name', input.tradingName ?? null);
      if ('registrationNumber' in input) addSet('registration_number', input.registrationNumber ?? null);
      if ('taxId' in input) addSet('tax_id', input.taxId ?? null);
      if ('taxIdType' in input) addSet('tax_id_type', input.taxIdType ?? null);
      if (input.defaultCurrency !== undefined) addSet('default_currency', input.defaultCurrency);
      if (input.locale !== undefined) addSet('locale', input.locale);
      if (input.timeZone !== undefined) addSet('time_zone', input.timeZone);
      if (input.address !== undefined)
        addSet('address', input.address ? JSON.stringify(input.address) : null);
      if ('phone' in input) addSet('phone', input.phone ?? null);
      if ('email' in input) addSet('email', input.email ?? null);
      if ('emailReplyTo' in input) addSet('email_reply_to', input.emailReplyTo ?? null);
      if ('website' in input) addSet('website', input.website ?? null);
      if ('logoUrl' in input) addSet('logo_url', input.logoUrl ?? null);
      if (input.bankDetails !== undefined)
        addSet('bank_details', input.bankDetails ? JSON.stringify(input.bankDetails) : null);
      if (input.defaultPaymentTermsDays !== undefined)
        addSet('default_payment_terms_days', input.defaultPaymentTermsDays);
      if (input.lateFeesBasisPoints !== undefined)
        addSet('late_fees_basis_points', input.lateFeesBasisPoints);
      if ('invoiceFooterText' in input) addSet('invoice_footer_text', input.invoiceFooterText ?? null);

      setParts.push(`version = version + 1`);
      setParts.push(`updated_at = NOW()`);
      if ('legalName' in input || 'defaultCurrency' in input) {
        addSet('updated_by', principal.subject);
      }

      const updatedResult = await client.query<Record<string, unknown>>(
        `UPDATE gigalibs_ar.billing_entities SET ${setParts.join(', ')}
         WHERE tenant_id = $1 RETURNING *`,
        values,
      );
      const updated = updatedResult.rows[0]!;

      // Audit
      await client.query(
        `INSERT INTO gigalibs_ar.audit_events (
           tenant_id, id, aggregate_type, aggregate_id, action,
           actor_subject, actor_permissions, prior_state, new_state, correlation_id
         ) VALUES ($1, $2, 'billing-entity', $3, 'ar.billing-entity.updated', $4, $5, $6::jsonb, $7::jsonb, $8)`,
        [
          principal.tenantId,
          randomUUID(),
          current.id,
          principal.subject,
          [...principal.permissions],
          JSON.stringify(rowToResponse(current)),
          JSON.stringify(rowToResponse(updated)),
          correlationId,
        ],
      );

      return rowToResponse(updated);
    });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseEtag(ifMatch: string | undefined): number | undefined {
  if (!ifMatch) return undefined;
  const stripped = ifMatch.replace(/^"(.+)"$/, '$1');
  const n = Number(stripped);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

function validateLocaleAndTimeZone(locale: string, timeZone: string): void {
  try {
    Intl.getCanonicalLocales(locale);
    new Intl.DateTimeFormat(locale, { timeZone }).format(new Date(0));
  } catch {
    throw new ArConflictError('INVALID_LOCALIZATION', 'Locale or time zone is not supported.');
  }
}
