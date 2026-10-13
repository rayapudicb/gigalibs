import {
  type LookupOption,
  type ModulePrincipal,
  type RecordCommandContext,
  type RecordFieldPolicy,
  type RecordListQuery,
  type RecordPage,
  type RecordValues,
  RecordVersionConflict,
} from '@gigalibs/module-sdk';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { GigaOpsPrincipal } from '../auth/authorization.js';

// WI-OI-120u (M-WF1): what every Workforce record adapter shares. Window field keys are the dictionary's kebab-case
// keys; the domain speaks camelCase.

export const camel = (key: string) =>
  key.replace(/-([a-z0-9])/g, (_match, letter: string) => letter.toUpperCase());

/** The record controller sits behind GigaOpsAuthorizationGuard, so the principal it passes is the Workforce one. */
export const domain = (principal: ModulePrincipal) => principal as unknown as GigaOpsPrincipal;

export const command = (context: RecordCommandContext) => ({
  principal: domain(context.principal),
  correlationId: context.correlationId,
});

export interface FieldSpec {
  readonly key: string;
  readonly writable?: boolean;
  readonly writePermission?: string;
  /** A value the domain may clear (null); other empty values are left out of a change. */
  readonly clearable?: boolean;
  readonly domain?: string;
  readonly toDomain?: (value: unknown) => unknown;
  readonly toWindow?: (value: unknown) => unknown;
}

/** A window DATE (YYYY-MM-DD) for a domain timestamp, and back. */
export const DATE_AS_TIMESTAMP: Pick<FieldSpec, 'toDomain' | 'toWindow'> = {
  toDomain: (value) =>
    typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? `${value}T00:00:00.000Z`
      : value,
  toWindow: (value) => (typeof value === 'string' ? value.slice(0, 10) : value),
};

export const domainName = (field: FieldSpec) => field.domain ?? camel(field.key);

export function fieldPolicies(fields: readonly FieldSpec[]): Record<string, RecordFieldPolicy> {
  return Object.fromEntries(
    fields.map((field) => [
      field.key,
      {
        writable: field.writable ?? false,
        ...(field.writePermission ? { writePermission: field.writePermission } : {}),
      },
    ]),
  );
}

export function toWindow(fields: readonly FieldSpec[], record: object): RecordValues {
  const source = record as Record<string, unknown>;
  const values: Record<string, unknown> = { id: source.id };
  if (source.version !== undefined) values.version = source.version;
  for (const field of fields) {
    const raw = source[domainName(field)];
    values[field.key] =
      raw === undefined || raw === null ? null : field.toWindow ? field.toWindow(raw) : raw;
  }
  return values;
}

export function toDomain(
  fields: readonly FieldSpec[],
  values: RecordValues,
): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const field of fields) {
    if (!field.writable || !(field.key in values)) continue;
    const value = values[field.key];
    if (value === null || value === '') {
      if (field.clearable) input[domainName(field)] = null;
      continue;
    }
    input[domainName(field)] = field.toDomain ? field.toDomain(value) : value;
  }
  return input;
}

/** A Workforce version conflict (409) becomes the window's 412 ("someone else changed this record"). */
export async function versioned<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    const code =
      error instanceof ConflictException
        ? (error.getResponse() as { code?: unknown }).code
        : undefined;
    if (code === 'WORKFORCE_RESOURCE_VERSION_CONFLICT' || code === 'WORKFORCE_VERSION_CONFLICT')
      throw new RecordVersionConflict();
    throw error;
  }
}

export async function orNull<T>(run: () => Promise<T>): Promise<T | null> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof NotFoundException) return null;
    throw error;
  }
}

/** The version the screen read, which every action carries (WI-OI-120g); without it the action is refused. */
export function expectedVersion(parameters: RecordValues): number {
  const version = parameters.expectedVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new BadRequestException({
      code: 'WORKFORCE_VALIDATION_FAILED',
      message: 'The action needs the version of the record you read.',
    });
  }
  return version;
}

export const reasonOf = (parameters: RecordValues) =>
  typeof parameters.reason === 'string' && parameters.reason.trim()
    ? { reason: parameters.reason.trim() }
    : {};

/** One page of a list the domain returns whole. */
export function pageOf<T = RecordValues>(
  items: readonly T[],
  query: RecordListQuery,
): Omit<RecordPage, 'items'> & { readonly items: T[] } {
  const start = (query.page - 1) * query.pageSize;
  return {
    items: items.slice(start, start + query.pageSize),
    total: items.length,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export type LookupRequest = {
  readonly search?: string;
  readonly ids?: readonly string[];
  readonly limit: number;
};

/** Options matching the search, or the ones named by id (to show the names of values a record already holds). */
export function pick<T>(
  items: readonly T[],
  request: LookupRequest,
  option: (item: T) => LookupOption & { readonly active: boolean },
): LookupOption[] {
  const options = items.map(option);
  const named = new Set(request.ids ?? []);
  if (named.size > 0)
    return options
      .filter((candidate) => named.has(candidate.value))
      .map(({ value, label }) => ({ value, label }));
  const search = request.search?.toLowerCase();
  return options
    .filter(
      (candidate) =>
        candidate.active && (!search || candidate.label.toLowerCase().includes(search)),
    )
    .slice(0, request.limit)
    .map(({ value, label }) => ({ value, label }));
}
