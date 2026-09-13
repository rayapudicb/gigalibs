'use client';

import type { ProblemDetails } from './api-types';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly problem: ProblemDetails,
  ) {
    super(problem.detail ?? problem.title ?? `Request failed (${status})`);
    this.name = 'ApiError';
  }
}

export async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/ar/${path.replace(/^\//, '')}`, {
    ...init,
    headers: {
      accept: 'application/json',
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
    cache: 'no-store',
  });
  const body = (await response.json().catch(() => ({}))) as T | ProblemDetails;
  if (!response.ok) throw new ApiError(response.status, body as ProblemDetails);
  return body as T;
}

export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

export function humanError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Your session ended. Sign in again.';
    return error.message;
  }
  return 'The request could not be completed. Try again.';
}

export function displayMinor(currency: string, amountMinor: number): string {
  return `${currency} ${amountMinor.toLocaleString()} minor units`;
}
