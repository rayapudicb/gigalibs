import { createHash } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { ArConflictError } from '../http/problem.filter.js';

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/;

interface IdempotencyRow {
  request_hash: string;
  response_status: number;
  response_body: unknown;
}

export interface IdempotentResult<T> {
  status: number;
  body: T;
  replayed: boolean;
}

export function requireIdempotencyKey(value: string | undefined): string {
  if (!value || !IDEMPOTENCY_KEY_PATTERN.test(value)) {
    throw new BadRequestException('Idempotency-Key must contain 16–128 safe characters.');
  }
  return value;
}

export function hashCanonicalJson(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(value)))
    .digest('hex');
}

export async function lockIdempotencyScope(
  client: PoolClient,
  tenantId: string,
  scope: string,
  key: string,
): Promise<void> {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
    `${tenantId}:${scope}:${key}`,
  ]);
}

export async function readIdempotentResult<T>(
  client: PoolClient,
  tenantId: string,
  scope: string,
  key: string,
  requestHash: string,
): Promise<IdempotentResult<T> | undefined> {
  const result = await client.query<IdempotencyRow>(
    `
      SELECT request_hash, response_status, response_body
      FROM gigalibs_ar.idempotency_records
      WHERE tenant_id = $1 AND scope = $2 AND idempotency_key = $3
    `,
    [tenantId, scope, key],
  );
  const existing = result.rows[0];
  if (!existing) return undefined;
  if (existing.request_hash !== requestHash) {
    throw new ArConflictError(
      'IDEMPOTENCY_PAYLOAD_MISMATCH',
      'The idempotency key was already used with a different request.',
    );
  }
  return {
    status: existing.response_status,
    body: existing.response_body as T,
    replayed: true,
  };
}

export async function storeIdempotentResult<T extends object>(
  client: PoolClient,
  input: {
    tenantId: string;
    scope: string;
    key: string;
    requestHash: string;
    status: number;
    body: T;
    resourceId: string;
  },
): Promise<void> {
  await client.query(
    `
      INSERT INTO gigalibs_ar.idempotency_records (
        tenant_id, scope, idempotency_key, request_hash, response_status, response_body, resource_id
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
    `,
    [
      input.tenantId,
      input.scope,
      input.key,
      input.requestHash,
      input.status,
      JSON.stringify(input.body),
      input.resourceId,
    ],
  );
}

export async function assertActiveTenant(
  client: PoolClient,
  tenantId: string,
  issuer: string,
): Promise<void> {
  const result = await client.query<{ status: string; oidc_issuer: string }>(
    'SELECT status, oidc_issuer FROM gigalibs_ar.module_tenants WHERE id = $1',
    [tenantId],
  );
  const tenant = result.rows[0];
  if (!tenant) {
    throw new ArConflictError('MODULE_NOT_CONFIGURED', 'The AR module has not been configured.');
  }
  if (tenant.oidc_issuer !== issuer || tenant.status !== 'ACTIVE') {
    throw new ArConflictError('TENANT_UNAVAILABLE', 'The AR tenant is not available.');
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}
