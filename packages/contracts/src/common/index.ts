import { z } from 'zod';

// ─── Primitives ───────────────────────────────────────────────────────────────

export const UUIDSchema = z.string().uuid();
export const CUIDSchema = z.string().min(1);
export const EmailSchema = z.string().email().toLowerCase();
export const PhoneSchema = z.string().regex(/^\+[1-9]\d{1,14}$/, 'Must be E.164 format e.g. +919876543210');
export const UrlSchema = z.string().url();
export const SlugSchema = z.string().regex(/^[a-z0-9-]+$/, 'Only lowercase letters, numbers, hyphens');

export const PaginationQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  direction: z.enum(['asc', 'desc']).default('desc'),
});

export const OffsetPaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const PaginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    data: z.array(itemSchema),
    meta: z.object({
      total: z.number().int(),
      page: z.number().int(),
      limit: z.number().int(),
      totalPages: z.number().int(),
      hasNextPage: z.boolean(),
      hasPrevPage: z.boolean(),
    }),
  });

export const CursorPaginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    data: z.array(itemSchema),
    meta: z.object({
      nextCursor: z.string().nullable(),
      prevCursor: z.string().nullable(),
      hasMore: z.boolean(),
    }),
  });

// ─── Common inferred types ────────────────────────────────────────────────────

export type UUID = z.infer<typeof UUIDSchema>;
export type Email = z.infer<typeof EmailSchema>;
export type Phone = z.infer<typeof PhoneSchema>;
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;
export type OffsetPaginationQuery = z.infer<typeof OffsetPaginationQuerySchema>;
