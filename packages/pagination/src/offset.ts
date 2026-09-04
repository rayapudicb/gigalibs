import type { OffsetPaginationParams, OffsetPaginatedResult } from './types.js';

export function paginateOffset<T>(
  items: T[],
  total: number,
  params: OffsetPaginationParams,
): OffsetPaginatedResult<T> {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.max(1, params.limit ?? 20);
  const totalPages = Math.ceil(total / limit);

  return {
    data: items,
    meta: {
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
  };
}
