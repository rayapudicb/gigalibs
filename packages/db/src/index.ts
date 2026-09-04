/**
 * @gigalibs/db
 *
 * Prisma client factory, multi-tenant helpers, pagination utilities.
 *
 * @module
 */

export * from './client.js';
export * from './multi-tenant.js';
export * from './pagination.js';
export * from './generated/prisma/enums.js';
export { Prisma } from './generated/prisma/client.js';
export type { PrismaClient } from './generated/prisma/client.js';
