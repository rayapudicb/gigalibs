// ─── Cursor Pagination ────────────────────────────────────────────────────────

export interface CursorPage<T> {
  data: T[];
  meta: {
    nextCursor: string | null;
    prevCursor: string | null;
    hasMore: boolean;
    count: number;
  };
}

export interface CursorPageOptions {
  cursor?: string;
  limit?: number;
  direction?: 'asc' | 'desc';
}

/**
 * Build Prisma cursor pagination args from page options.
 *
 * @example
 * const args = buildCursorArgs({ cursor, limit: 20 });
 * const rows = await prisma.ticket.findMany({ ...args, where });
 * return toCursorPage(rows, 20);
 */
export const buildCursorArgs = (opts: CursorPageOptions) => {
  const limit = opts.limit ?? 20;
  return {
    take: limit + 1, // fetch one extra to detect hasMore
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    orderBy: { id: opts.direction ?? 'desc' } as const,
  };
};

/**
 * Convert a raw array (fetched with take: limit+1) into a CursorPage.
 */
export const toCursorPage = <T extends { id: string }>(
  rows: T[],
  limit: number,
): CursorPage<T> => {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  return {
    data,
    meta: {
      hasMore,
      count: data.length,
      nextCursor: hasMore ? (data[data.length - 1]?.id ?? null) : null,
      prevCursor: data[0]?.id ?? null,
    },
  };
};

// ─── Offset Pagination ────────────────────────────────────────────────────────

export interface OffsetPage<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

export interface OffsetPageOptions {
  page?: number;
  limit?: number;
}

/**
 * Build Prisma offset pagination args.
 *
 * @example
 * const args = buildOffsetArgs({ page: 2, limit: 20 });
 * const [rows, total] = await prisma.$transaction([
 *   prisma.user.findMany({ ...args }),
 *   prisma.user.count(),
 * ]);
 * return toOffsetPage(rows, total, { page: 2, limit: 20 });
 */
export const buildOffsetArgs = (opts: OffsetPageOptions) => {
  const page = opts.page ?? 1;
  const limit = opts.limit ?? 20;
  return {
    skip: (page - 1) * limit,
    take: limit,
  };
};

export const toOffsetPage = <T>(
  data: T[],
  total: number,
  opts: OffsetPageOptions,
): OffsetPage<T> => {
  const page = opts.page ?? 1;
  const limit = opts.limit ?? 20;
  const totalPages = Math.ceil(total / limit);
  return {
    data,
    meta: {
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
  };
};
