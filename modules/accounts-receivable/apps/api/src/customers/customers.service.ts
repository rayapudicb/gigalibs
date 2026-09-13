import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { ArPrincipal } from '../auth/authorization.js';
import { DatabaseService } from '../database/database.service.js';
import {
  type IdempotentResult,
  assertActiveTenant,
  hashCanonicalJson,
  lockIdempotencyScope,
  readIdempotentResult,
  storeIdempotentResult,
} from '../database/persistence-helpers.js';
import { decodeCustomerCursor, encodeCursor } from '../http/pagination.js';
import { ArConflictError } from '../http/problem.filter.js';

// ─── Schemas ────────────────────────────────────────────────────────────────

const billingAddressSchema = z
  .object({
    line1: z.string().trim().min(1).max(200).optional(),
    line2: z.string().trim().max(200).optional(),
    city: z.string().trim().min(1).max(100).optional(),
    state: z.string().trim().max(100).optional(),
    postalCode: z.string().trim().max(20).optional(),
    country: z.string().regex(/^[A-Z]{2}$/).optional(), // ISO 3166-1 alpha-2
  })
  .strict()
  .optional();

const createCustomerSchema = z
  .object({
    legalName: z.string().trim().min(1).max(200),
    billingEmail: z.email().max(320),
    externalReference: z.string().trim().min(1).max(100).optional(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    phone: z.string().trim().min(1).max(50).optional(),
    website: z.string().max(255).optional(),
    taxId: z.string().trim().min(1).max(50).optional(),
    taxIdType: z.enum(['VAT', 'GST', 'EIN', 'ABN', 'GSTIN', 'OTHER']).optional(),
    billingAddress: billingAddressSchema,
    paymentTermsDays: z.number().int().min(0).max(365).optional(),
    creditLimitMinor: z.number().int().min(0).optional(),
    notes: z.string().min(1).max(2000).optional(),
  })
  .strict();

const updateCustomerSchema = z
  .object({
    legalName: z.string().trim().min(1).max(200).optional(),
    billingEmail: z.email().max(320).optional(),
    phone: z.string().trim().min(1).max(50).nullish(),
    website: z.string().max(255).nullish(),
    taxId: z.string().trim().min(1).max(50).nullish(),
    taxIdType: z.enum(['VAT', 'GST', 'EIN', 'ABN', 'GSTIN', 'OTHER']).nullish(),
    billingAddress: billingAddressSchema,
    paymentTermsDays: z.number().int().min(0).max(365).nullish(),
    creditLimitMinor: z.number().int().min(0).nullish(),
    notes: z.string().min(1).max(2000).nullish(),
  })
  .strict()
  .refine((d) => Object.keys(d).length > 0, { message: 'At least one field required for update' });

const createContactSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    email: z.email().max(320),
    phone: z.string().trim().min(1).max(50).optional(),
    role: z
      .enum(['BILLING', 'PRIMARY', 'CC', 'TECHNICAL', 'ACCOUNTS_PAYABLE'])
      .default('BILLING'),
  })
  .strict();

// ─── Response types ─────────────────────────────────────────────────────────

export interface BillingAddress {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

export interface CustomerResponse {
  id: string;
  legalName: string;
  billingEmail: string;
  externalReference?: string;
  currency: string;
  status: 'ACTIVE' | 'INACTIVE';
  phone?: string;
  website?: string;
  taxId?: string;
  taxIdType?: string;
  billingAddress?: BillingAddress;
  paymentTermsDays?: number;
  creditLimitMinor?: number;
  notes?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ContactResponse {
  id: string;
  customerId: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Row types ───────────────────────────────────────────────────────────────

interface CustomerRow {
  id: string;
  legal_name: string;
  billing_email: string;
  external_reference: string | null;
  currency: string;
  status: 'ACTIVE' | 'INACTIVE';
  phone: string | null;
  website: string | null;
  tax_id: string | null;
  tax_id_type: string | null;
  billing_address: string | null;
  payment_terms_days: number | null;
  credit_limit_minor: string | null;
  notes: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

interface ContactRow {
  id: string;
  customer_id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class CustomersService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  // ── Create ────────────────────────────────────────────────────────────────

  async create(
    rawInput: unknown,
    principal: ArPrincipal,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<IdempotentResult<CustomerResponse>> {
    const input = createCustomerSchema.parse(rawInput);
    const requestHash = hashCanonicalJson(input);
    const scope = 'customers.create.v1';

    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      await assertActiveTenant(client, principal.tenantId, principal.issuer);
      await lockIdempotencyScope(client, principal.tenantId, scope, idempotencyKey);
      const replay = await readIdempotentResult<CustomerResponse>(
        client,
        principal.tenantId,
        scope,
        idempotencyKey,
        requestHash,
      );
      if (replay) return replay;

      const id = randomUUID();
      let created: CustomerRow;
      try {
        const result = await client.query<CustomerRow>(
          `
            INSERT INTO gigalibs_ar.customers (
              tenant_id, id, legal_name, billing_email, external_reference, currency,
              phone, website, tax_id, tax_id_type, billing_address,
              payment_terms_days, credit_limit_minor, notes,
              created_by, updated_by
            ) VALUES ($1, $2, $3, $4, $5, $6,
                      $7, $8, $9, $10, $11::jsonb,
                      $12, $13, $14,
                      $15, $15)
            RETURNING
              id, legal_name, billing_email, external_reference, currency, status,
              phone, website, tax_id, tax_id_type, billing_address::text,
              payment_terms_days, credit_limit_minor::text, notes,
              version, created_at::text, updated_at::text
          `,
          [
            principal.tenantId,
            id,
            input.legalName,
            input.billingEmail.toLowerCase(),
            input.externalReference ?? null,
            input.currency,
            input.phone ?? null,
            input.website ?? null,
            input.taxId ?? null,
            input.taxIdType ?? null,
            input.billingAddress ? JSON.stringify(input.billingAddress) : null,
            input.paymentTermsDays ?? null,
            input.creditLimitMinor ?? null,
            input.notes ?? null,
            principal.subject,
          ],
        );
        const row = result.rows[0];
        if (!row) throw new Error('Customer insert returned no record.');
        created = row;
      } catch (error) {
        if (isConstraint(error, 'customers_external_reference_unique')) {
          throw new ArConflictError(
            'CUSTOMER_EXTERNAL_REFERENCE_EXISTS',
            'A customer with this external reference already exists.',
          );
        }
        throw error;
      }

      const body = mapCustomer(created);
      await writeAuditEvent(client, {
        tenantId: principal.tenantId,
        aggregateType: 'customer',
        aggregateId: id,
        action: 'ar.customer.created',
        principal,
        newState: body,
        correlationId,
      });
      await storeIdempotentResult(client, {
        tenantId: principal.tenantId,
        scope,
        key: idempotencyKey,
        requestHash,
        status: 201,
        body,
        resourceId: id,
      });
      return { status: 201, body, replayed: false };
    });
  }

  // ── Get ───────────────────────────────────────────────────────────────────

  async get(id: string, principal: ArPrincipal): Promise<CustomerResponse> {
    const validId = z.string().uuid().parse(id);
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      await assertActiveTenant(client, principal.tenantId, principal.issuer);
      const result = await client.query<CustomerRow>(
        `
          SELECT
            id, legal_name, billing_email, external_reference, currency, status,
            phone, website, tax_id, tax_id_type, billing_address::text,
            payment_terms_days, credit_limit_minor::text, notes,
            version, created_at::text, updated_at::text
          FROM gigalibs_ar.customers
          WHERE tenant_id = $1 AND id = $2
        `,
        [principal.tenantId, validId],
      );
      if (!result.rows[0]) {
        throw new ArConflictError('CUSTOMER_NOT_FOUND', 'Customer not found.');
      }
      return mapCustomer(result.rows[0]);
    });
  }

  // ── List ──────────────────────────────────────────────────────────────────

  async list(
    principal: ArPrincipal,
    pageSize: number,
    rawCursor?: string,
    rawStatus?: string,
    search?: string,
  ): Promise<{ items: CustomerResponse[]; nextCursor: string | null }> {
    const boundedPageSize = z.number().int().min(1).max(100).parse(pageSize);
    const cursor = decodeCustomerCursor(rawCursor);
    const status = rawStatus
      ? z.enum(['ACTIVE', 'INACTIVE']).parse(rawStatus.toUpperCase())
      : undefined;
    const searchTerm = search?.trim() || undefined;

    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      await assertActiveTenant(client, principal.tenantId, principal.issuer);
      const result = await client.query<CustomerRow>(
        `
          SELECT
            id, legal_name, billing_email, external_reference, currency, status,
            phone, website, tax_id, tax_id_type, billing_address::text,
            payment_terms_days, credit_limit_minor::text, notes,
            version, created_at::text, updated_at::text
          FROM gigalibs_ar.customers
          WHERE tenant_id = $1
            AND ($2::text IS NULL OR status = $2)
            AND ($5::text IS NULL OR to_tsvector('simple',
                  coalesce(legal_name, '') || ' ' || coalesce(billing_email, ''))
                @@ plainto_tsquery('simple', $5))
            AND ($3::text IS NULL OR (legal_name, id) > ($3, $4::uuid))
          ORDER BY legal_name ASC, id ASC
          LIMIT $6
        `,
        [
          principal.tenantId,
          status ?? null,
          cursor?.n ?? null,
          cursor?.i ?? null,
          searchTerm ?? null,
          boundedPageSize + 1,
        ],
      );
      const hasMore = result.rows.length > boundedPageSize;
      const pageRows = hasMore ? result.rows.slice(0, boundedPageSize) : result.rows;
      const last = pageRows.at(-1);
      return {
        items: pageRows.map(mapCustomer),
        nextCursor: hasMore && last ? encodeCursor({ n: last.legal_name, i: last.id }) : null,
      };
    });
  }

  // ── Update ────────────────────────────────────────────────────────────────

  async update(
    id: string,
    rawInput: unknown,
    ifMatch: string | undefined,
    principal: ArPrincipal,
    correlationId: string,
  ): Promise<CustomerResponse> {
    const validId = z.string().uuid().parse(id);
    const input = updateCustomerSchema.parse(rawInput);
    const expectedVersion = parseEtag(ifMatch);

    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      await assertActiveTenant(client, principal.tenantId, principal.issuer);

      // Fetch current for optimistic concurrency + audit prior state
      const current = await client.query<CustomerRow>(
        `SELECT id, legal_name, billing_email, external_reference, currency, status,
                phone, website, tax_id, tax_id_type, billing_address::text,
                payment_terms_days, credit_limit_minor::text, notes,
                version, created_at::text, updated_at::text
         FROM gigalibs_ar.customers
         WHERE tenant_id = $1 AND id = $2
         FOR UPDATE`,
        [principal.tenantId, validId],
      );
      if (!current.rows[0]) {
        throw new ArConflictError('CUSTOMER_NOT_FOUND', 'Customer not found.');
      }
      const prior = current.rows[0];
      if (expectedVersion !== undefined && prior.version !== expectedVersion) {
        throw new ArConflictError(
          'CUSTOMER_VERSION_CONFLICT',
          `Customer version conflict: expected ${expectedVersion}, current ${prior.version}.`,
        );
      }

      // Build SET clause dynamically — only update provided fields
      const sets: string[] = ['version = version + 1', 'updated_by = $2', 'updated_at = transaction_timestamp()'];
      const params: unknown[] = [principal.tenantId, principal.subject];
      let p = 3;

      function addField(col: string, val: unknown): void {
        sets.push(`${col} = $${p++}`);
        params.push(val);
      }

      if (input.legalName !== undefined) addField('legal_name', input.legalName);
      if (input.billingEmail !== undefined) addField('billing_email', input.billingEmail.toLowerCase());
      if ('phone' in input) addField('phone', input.phone ?? null);
      if ('website' in input) addField('website', input.website ?? null);
      if ('taxId' in input) addField('tax_id', input.taxId ?? null);
      if ('taxIdType' in input) addField('tax_id_type', input.taxIdType ?? null);
      if ('billingAddress' in input) addField('billing_address', input.billingAddress ? JSON.stringify(input.billingAddress) : null);
      if ('paymentTermsDays' in input) addField('payment_terms_days', input.paymentTermsDays ?? null);
      if ('creditLimitMinor' in input) addField('credit_limit_minor', input.creditLimitMinor ?? null);
      if ('notes' in input) addField('notes', input.notes ?? null);

      params.push(validId); // last param: id
      const idParam = `$${p}`;

      let updated: CustomerRow;
      try {
        const result = await client.query<CustomerRow>(
          `UPDATE gigalibs_ar.customers
           SET ${sets.join(', ')}
           WHERE tenant_id = $1 AND id = ${idParam}
           RETURNING
             id, legal_name, billing_email, external_reference, currency, status,
             phone, website, tax_id, tax_id_type, billing_address::text,
             payment_terms_days, credit_limit_minor::text, notes,
             version, created_at::text, updated_at::text`,
          params,
        );
        const row = result.rows[0];
        if (!row) throw new Error('Customer update returned no record.');
        updated = row;
      } catch (error) {
        if (isConstraint(error, 'customers_external_reference_unique')) {
          throw new ArConflictError(
            'CUSTOMER_EXTERNAL_REFERENCE_EXISTS',
            'A customer with this external reference already exists.',
          );
        }
        throw error;
      }

      const priorBody = mapCustomer(prior);
      const newBody = mapCustomer(updated);
      await writeAuditEvent(client, {
        tenantId: principal.tenantId,
        aggregateType: 'customer',
        aggregateId: validId,
        action: 'ar.customer.updated',
        principal,
        priorState: priorBody,
        newState: newBody,
        correlationId,
      });
      return newBody;
    });
  }

  // ── Deactivate ────────────────────────────────────────────────────────────

  async deactivate(
    id: string,
    principal: ArPrincipal,
    correlationId: string,
  ): Promise<CustomerResponse> {
    return this._setStatus(id, 'INACTIVE', 'ar.customer.deactivated', principal, correlationId);
  }

  async reactivate(
    id: string,
    principal: ArPrincipal,
    correlationId: string,
  ): Promise<CustomerResponse> {
    return this._setStatus(id, 'ACTIVE', 'ar.customer.reactivated', principal, correlationId);
  }

  private async _setStatus(
    id: string,
    targetStatus: 'ACTIVE' | 'INACTIVE',
    action: string,
    principal: ArPrincipal,
    correlationId: string,
  ): Promise<CustomerResponse> {
    const validId = z.string().uuid().parse(id);
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      await assertActiveTenant(client, principal.tenantId, principal.issuer);
      const result = await client.query<CustomerRow>(
        `UPDATE gigalibs_ar.customers
         SET status = $3, version = version + 1,
             updated_by = $2, updated_at = transaction_timestamp()
         WHERE tenant_id = $1 AND id = $4 AND status != $3
         RETURNING
           id, legal_name, billing_email, external_reference, currency, status,
           phone, website, tax_id, tax_id_type, billing_address::text,
           payment_terms_days, credit_limit_minor::text, notes,
           version, created_at::text, updated_at::text`,
        [principal.tenantId, principal.subject, targetStatus, validId],
      );
      if (!result.rows[0]) {
        // Either not found or already in target state — load and return current
        const current = await client.query<CustomerRow>(
          `SELECT id, legal_name, billing_email, external_reference, currency, status,
                  phone, website, tax_id, tax_id_type, billing_address::text,
                  payment_terms_days, credit_limit_minor::text, notes,
                  version, created_at::text, updated_at::text
           FROM gigalibs_ar.customers
           WHERE tenant_id = $1 AND id = $2`,
          [principal.tenantId, validId],
        );
        if (!current.rows[0]) {
          throw new ArConflictError('CUSTOMER_NOT_FOUND', 'Customer not found.');
        }
        return mapCustomer(current.rows[0]);
      }
      const body = mapCustomer(result.rows[0]);
      await writeAuditEvent(client, {
        tenantId: principal.tenantId,
        aggregateType: 'customer',
        aggregateId: validId,
        action,
        principal,
        newState: body,
        correlationId,
      });
      return body;
    });
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  async listContacts(
    customerId: string,
    principal: ArPrincipal,
  ): Promise<{ items: ContactResponse[] }> {
    const validId = z.string().uuid().parse(customerId);
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      await assertActiveTenant(client, principal.tenantId, principal.issuer);
      const result = await client.query<ContactRow>(
        `SELECT id, customer_id, name, email, phone, role, is_active, created_at::text, updated_at::text
         FROM gigalibs_ar.customer_contacts
         WHERE tenant_id = $1 AND customer_id = $2
         ORDER BY role ASC, name ASC`,
        [principal.tenantId, validId],
      );
      return { items: result.rows.map(mapContact) };
    });
  }

  async addContact(
    customerId: string,
    rawInput: unknown,
    principal: ArPrincipal,
    correlationId: string,
  ): Promise<ContactResponse> {
    const validCustomerId = z.string().uuid().parse(customerId);
    const input = createContactSchema.parse(rawInput);

    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      await assertActiveTenant(client, principal.tenantId, principal.issuer);
      // Verify customer exists in this tenant
      const customerCheck = await client.query(
        `SELECT id FROM gigalibs_ar.customers WHERE tenant_id = $1 AND id = $2`,
        [principal.tenantId, validCustomerId],
      );
      if (!customerCheck.rows[0]) {
        throw new ArConflictError('CUSTOMER_NOT_FOUND', 'Customer not found.');
      }

      const id = randomUUID();
      const result = await client.query<ContactRow>(
        `INSERT INTO gigalibs_ar.customer_contacts
           (tenant_id, id, customer_id, name, email, phone, role)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, customer_id, name, email, phone, role, is_active, created_at::text, updated_at::text`,
        [
          principal.tenantId,
          id,
          validCustomerId,
          input.name,
          input.email.toLowerCase(),
          input.phone ?? null,
          input.role,
        ],
      );
      const row = result.rows[0];
      if (!row) throw new Error('Contact insert returned no record.');

      await writeAuditEvent(client, {
        tenantId: principal.tenantId,
        aggregateType: 'customer_contact',
        aggregateId: validCustomerId,
        action: 'ar.customer.contact_added',
        principal,
        newState: mapContact(row),
        correlationId,
      });
      return mapContact(row);
    });
  }

  async removeContact(
    customerId: string,
    contactId: string,
    principal: ArPrincipal,
    correlationId: string,
  ): Promise<void> {
    const validCustomerId = z.string().uuid().parse(customerId);
    const validContactId = z.string().uuid().parse(contactId);

    await this.database.withTenantTransaction(principal.tenantId, async (client) => {
      await assertActiveTenant(client, principal.tenantId, principal.issuer);
      const result = await client.query(
        `DELETE FROM gigalibs_ar.customer_contacts
         WHERE tenant_id = $1 AND customer_id = $2 AND id = $3
         RETURNING id`,
        [principal.tenantId, validCustomerId, validContactId],
      );
      if (!result.rows[0]) {
        throw new ArConflictError('CONTACT_NOT_FOUND', 'Contact not found.');
      }
      await writeAuditEvent(client, {
        tenantId: principal.tenantId,
        aggregateType: 'customer_contact',
        aggregateId: validCustomerId,
        action: 'ar.customer.contact_removed',
        principal,
        newState: { contactId: validContactId, removedAt: new Date().toISOString() },
        correlationId,
      });
    });
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mapCustomer(row: CustomerRow): CustomerResponse {
  return {
    id: row.id,
    legalName: row.legal_name,
    billingEmail: row.billing_email,
    ...(row.external_reference ? { externalReference: row.external_reference } : {}),
    currency: row.currency,
    status: row.status,
    ...(row.phone ? { phone: row.phone } : {}),
    ...(row.website ? { website: row.website } : {}),
    ...(row.tax_id ? { taxId: row.tax_id } : {}),
    ...(row.tax_id_type ? { taxIdType: row.tax_id_type } : {}),
    ...(row.billing_address
      ? { billingAddress: JSON.parse(row.billing_address) as BillingAddress }
      : {}),
    ...(row.payment_terms_days != null ? { paymentTermsDays: row.payment_terms_days } : {}),
    ...(row.credit_limit_minor != null
      ? { creditLimitMinor: Number(row.credit_limit_minor) }
      : {}),
    ...(row.notes ? { notes: row.notes } : {}),
    version: row.version,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function mapContact(row: ContactRow): ContactResponse {
  return {
    id: row.id,
    customerId: row.customer_id,
    name: row.name,
    email: row.email,
    ...(row.phone ? { phone: row.phone } : {}),
    role: row.role,
    isActive: row.is_active,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

async function writeAuditEvent(
  client: { query: (sql: string, params: unknown[]) => Promise<unknown> },
  opts: {
    tenantId: string;
    aggregateType: string;
    aggregateId: string;
    action: string;
    principal: ArPrincipal;
    priorState?: object;
    newState: object;
    correlationId: string;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO gigalibs_ar.audit_events
       (tenant_id, id, aggregate_type, aggregate_id, action, actor_subject,
        actor_permissions, prior_state, new_state, correlation_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10)`,
    [
      opts.tenantId,
      randomUUID(),
      opts.aggregateType,
      opts.aggregateId,
      opts.action,
      opts.principal.subject,
      [...opts.principal.permissions],
      opts.priorState ? JSON.stringify(opts.priorState) : null,
      JSON.stringify(opts.newState),
      opts.correlationId,
    ],
  );
}

function isConstraint(error: unknown, constraint: string): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === '23505' &&
      'constraint' in error &&
      error.constraint === constraint,
  );
}

function parseEtag(ifMatch: string | undefined): number | undefined {
  if (!ifMatch) return undefined;
  const stripped = ifMatch.replace(/^"(.+)"$/, '$1');
  const n = Number(stripped);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}
