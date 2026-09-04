export interface SearchQuery {
  term: string;
  filters?: Record<string, unknown>;
  limit?: number;
  offset?: number;
}

export interface SearchHit<T> {
  item: T;
  score: number;
  highlights?: Record<string, string>;
}

export interface SearchResult<T> {
  hits: SearchHit<T>[];
  total: number;
  durationMs: number;
}
