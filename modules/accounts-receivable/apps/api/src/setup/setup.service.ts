import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { ArPrincipal } from '../auth/authorization.js';
import { DatabaseService } from '../database/database.service.js';
import {
  type IdempotentResult,
  hashCanonicalJson,
  lockIdempotencyScope,
  readIdempotentResult,
  storeIdempotentResult,
} from '../database/persistence-helpers.js';
import { ArConflictError } from '../http/problem.filter.js';

const setupSchema = z
  .object({
    legalName: z.string().trim().min(1).max(200),
    legalIdentifier: z.string().trim().min(1).max(100).optional(),
    defaultCurrency: z.string().regex(/^[A-Z]{3}$/),
    locale: z.string().trim().min(2).max(35),
    timeZone: z.string().trim().min(1).max(100),
    invoiceSeriesCode: z.string().regex(/^[A-Z0-9_-]{1,40}$/),
    invoicePrefix: z.string().regex(/^[A-Z0-9-]{0,20}$/),
    invoicePadding: z.number().int().min(1).max(12),
  })
  .strict();

export type SetupRequest = z.infer<typeof setupSchema>;

export interface SetupResponse {
  tenantId: string;
  billingEntityId: string;
  invoiceSeriesId: string;
  legalName: string;
  defaultCurrency: string;
  locale: string;
  timeZone: string;
  invoiceSeriesCode: string;
  invoicePrefix: string;
  invoicePadding: number;
  status: 'ACTIVE';
}

@Injectable()
export class SetupService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async configure(
    rawInput: unknown,
    principal: ArPrincipal,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<IdempotentResult<SetupResponse>> {
    const input = setupSchema.parse(rawInput);
    validateLocaleAndTimeZone(input.locale, input.timeZone);
    const requestHash = hashCanonicalJson(input);
    const scope = 'setup.configure.v1';

    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      await lockIdempotencyScope(client, principal.tenantId, scope, idempotencyKey);

      await client.query(
        `
          INSERT INTO gigalibs_ar.module_tenants (id, oidc_issuer, external_tenant_subject)
          VALUES ($1, $2, $3)
          ON CONFLICT (id) DO NOTHING
        `,
        [principal.tenantId, principal.issuer, principal.tenantId],
      );
      const identity = await client.query<{ oidc_issuer: string; external_tenant_subject: string }>(
        'SELECT oidc_issuer, external_tenant_subject FROM gigalibs_ar.module_tenants WHERE id = $1',
        [principal.tenantId],
      );
      if (
        identity.rows[0]?.oidc_issuer !== principal.issuer ||
        identity.rows[0]?.external_tenant_subject !== principal.tenantId
      ) {
        throw new ArConflictError(
          'TENANT_IDENTITY_CONFLICT',
          'The verified tenant identity conflicts with existing setup.',
        );
      }

      const replay = await readIdempotentResult<SetupResponse>(
        client,
        principal.tenantId,
        scope,
        idempotencyKey,
        requestHash,
      );
      if (replay) return replay;

      const existing = await client.query(
        'SELECT 1 FROM gigalibs_ar.billing_entities WHERE tenant_id = $1 LIMIT 1',
        [principal.tenantId],
      );
      if (existing.rowCount) {
        throw new ArConflictError(
          'SETUP_ALREADY_COMPLETED',
          'Module setup already exists; use the versioned settings API to change it.',
        );
      }

      const billingEntityId = randomUUID();
      const invoiceSeriesId = randomUUID();
      await client.query(
        `
          INSERT INTO gigalibs_ar.billing_entities (
            tenant_id, id, legal_name, legal_identifier, default_currency, locale, time_zone
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
        [
          principal.tenantId,
          billingEntityId,
          input.legalName,
          input.legalIdentifier ?? null,
          input.defaultCurrency,
          input.locale,
          input.timeZone,
        ],
      );
      await client.query(
        `
          INSERT INTO gigalibs_ar.invoice_series (
            tenant_id, id, billing_entity_id, code, prefix, padding, is_default
          ) VALUES ($1, $2, $3, $4, $5, $6, true)
        `,
        [
          principal.tenantId,
          invoiceSeriesId,
          billingEntityId,
          input.invoiceSeriesCode,
          input.invoicePrefix,
          input.invoicePadding,
        ],
      );

      const body: SetupResponse = {
        tenantId: principal.tenantId,
        billingEntityId,
        invoiceSeriesId,
        legalName: input.legalName,
        defaultCurrency: input.defaultCurrency,
        locale: input.locale,
        timeZone: input.timeZone,
        invoiceSeriesCode: input.invoiceSeriesCode,
        invoicePrefix: input.invoicePrefix,
        invoicePadding: input.invoicePadding,
        status: 'ACTIVE',
      };
      await client.query(
        `
          INSERT INTO gigalibs_ar.audit_events (
            tenant_id, id, aggregate_type, aggregate_id, action, actor_subject,
            actor_permissions, new_state, correlation_id
          ) VALUES ($1, $2, 'billing-entity', $3, 'ar.setup.completed', $4, $5, $6::jsonb, $7)
        `,
        [
          principal.tenantId,
          randomUUID(),
          billingEntityId,
          principal.subject,
          [...principal.permissions],
          JSON.stringify(body),
          correlationId,
        ],
      );
      await storeIdempotentResult(client, {
        tenantId: principal.tenantId,
        scope,
        key: idempotencyKey,
        requestHash,
        status: 201,
        body,
        resourceId: billingEntityId,
      });
      return { status: 201, body, replayed: false };
    });
  }
}

function validateLocaleAndTimeZone(locale: string, timeZone: string): void {
  try {
    Intl.getCanonicalLocales(locale);
    new Intl.DateTimeFormat(locale, { timeZone }).format(new Date(0));
  } catch {
    throw new ArConflictError('INVALID_LOCALIZATION', 'Locale or time zone is not supported.');
  }
}
