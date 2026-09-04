export type SortDirection = 'asc' | 'desc';

export interface CursorPaginationParams {
  cursor?: string;
  limit?: number;
  direction?: SortDirection;
}

export interface CursorPaginationMeta {
  nextCursor: string | null;
  prevCursor: string | null;
  hasMore: boolean;
  limit: number;
}

export interface CursorPaginatedResult<T> {
  data: T[];
  meta: CursorPaginationMeta;
}

export interface OffsetPaginationParams {
  page?: number;
  limit?: number;
}

export interface OffsetPaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface OffsetPaginatedResult<T> {
  data: T[];
  meta: OffsetPaginationMeta;
}
