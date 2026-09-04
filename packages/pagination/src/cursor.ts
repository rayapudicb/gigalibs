import type { CursorPaginationParams, CursorPaginatedResult } from './types.js';

export function paginateCursor<T extends { id: string }>(
  items: T[],
  params: CursorPaginationParams,
): CursorPaginatedResult<T> {
  const limit = params.limit ?? 20;
  const hasMore = items.length > limit;
  const data = hasMore ? items.slice(0, limit) : items;

  return {
    data,
    meta: {
      hasMore,
      limit,
      nextCursor: hasMore && data.length > 0 ? (data[data.length - 1]?.id ?? null) : null,
      prevCursor: data.length > 0 ? (data[0]?.id ?? null) : null,
    },
  };
}
