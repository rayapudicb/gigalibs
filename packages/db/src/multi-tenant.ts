import type { PrismaClient } from './generated/prisma/client.js';
import type { TenantContext } from '@gigalibs/contracts';
import { AsyncLocalStorage } from 'node:async_hooks';

// ─── Tenant Context Storage ───────────────────────────────────────────────────

const tenantStorage = new AsyncLocalStorage<TenantContext>();

/**
 * Run fn() within a tenant context.
 * All DB operations inside automatically get the tenantId injected.
 */
export const withTenant = <T>(context: TenantContext, fn: () => T): T =>
  tenantStorage.run(context, fn);

/**
 * Get the current tenant context from AsyncLocalStorage.
 * Returns undefined if called outside a tenant context.
 */
export const getCurrentTenant = (): TenantContext | undefined =>
  tenantStorage.getStore();

/**
 * Get the current tenantId or throw if not in a tenant context.
 * Use inside services that must always run within a tenant scope.
 */
export const requireTenantId = (): string => {
  const ctx = tenantStorage.getStore();
  if (!ctx) throw new Error('No tenant context found. Did you forget TenantMiddleware?');
  return ctx.tenantId;
};

// ─── Tenant-scoped Query Helpers ──────────────────────────────────────────────

/**
 * Create a where clause that always includes the current tenantId.
 * Prevents cross-tenant data leakage at the application layer.
 *
 * @example
 * const tickets = await prisma.ticket.findMany({
 *   where: tenantWhere({ status: 'OPEN' }),
 * });
 */
export const tenantWhere = <T extends Record<string, unknown>>(
  where?: T,
): T & { tenantId: string } => ({
  ...((where ?? {}) as T),
  tenantId: requireTenantId(),
});

/**
 * Create a data object that always includes the current tenantId.
 * Use when creating new tenant-scoped records.
 *
 * @example
 * await prisma.ticket.create({
 *   data: tenantData({ title: 'Bug report', priority: 'HIGH' }),
 * });
 */
export const tenantData = <T extends Record<string, unknown>>(
  data: T,
): T & { tenantId: string } => ({
  ...data,
  tenantId: requireTenantId(),
});

// ─── Transaction helpers ──────────────────────────────────────────────────────

export type PrismaTransaction = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];
