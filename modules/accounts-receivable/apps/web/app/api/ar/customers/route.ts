/**
 * GET /api/ar/customers
 *
 * Lightweight customer list for the CustomerLookup control.
 * Returns a projected subset of customer fields — just what the control needs.
 *
 * Query params:
 *   pageSize  – maximum records to return (default 500, max 500)
 *   status    – "ACTIVE" | "INACTIVE" | "ALL" (default "ACTIVE")
 */

import { randomUUID } from 'node:crypto';
import { webConfig } from '@/lib/config';
import { oidcConfiguration } from '@/lib/oidc';
import {
  type ArWebSession,
  clearAuthCookies,
  now,
  openSession,
  sealSession,
  sessionCookieName,
  setSessionCookie,
} from '@/lib/session';
import type { Customer } from '@/lib/api-types';
import { type NextRequest, NextResponse } from 'next/server';
import * as client from 'openid-client';

export const runtime = 'nodejs';

export interface CustomerOption {
  id: string;
  legalName: string;
  billingEmail: string;
  currency: string;
  externalReference?: string;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const config = webConfig();

  let session = await openSession(request.cookies.get(sessionCookieName())?.value);
  if (!session) return problem(401, 'Sign in is required.');

  let refreshed = false;
  if (session.expiresAt <= now() + 30) {
    session = await refreshSession(session);
    if (!session) {
      const response = problem(401, 'Your session expired. Sign in again.');
      clearAuthCookies(response);
      return response;
    }
    refreshed = true;
  }

  const { searchParams } = new URL(request.url);
  const rawPageSize = searchParams.get('pageSize');
  const pageSize = Math.min(
    500,
    rawPageSize && /^\d+$/.test(rawPageSize) ? parseInt(rawPageSize, 10) : 500,
  );
  const status = searchParams.get('status') ?? 'ACTIVE';

  const upstreamUrl = new URL(`${config.apiBaseUrl}/v1/customers`);
  upstreamUrl.searchParams.set('pageSize', String(pageSize));
  if (status !== 'ALL') upstreamUrl.searchParams.set('status', status);

  const correlationId = request.headers.get('x-correlation-id') ?? randomUUID();

  try {
    const upstream = await fetch(upstreamUrl, {
      method: 'GET',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
        accept: 'application/json',
        'x-correlation-id': correlationId,
      },
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });

    if (!upstream.ok) {
      const body = await upstream.json().catch(() => ({}));
      const response = new NextResponse(JSON.stringify(body), { status: upstream.status });
      response.headers.set('content-type', 'application/problem+json');
      response.headers.set('cache-control', 'no-store');
      return response;
    }

    const raw = (await upstream.json()) as { items: Customer[] };
    const items: CustomerOption[] = (raw.items ?? []).map((c) => {
      const opt: CustomerOption = {
        id: c.id,
        legalName: c.legalName,
        billingEmail: c.billingEmail,
        currency: c.currency,
      };
      if (c.externalReference !== undefined) {
        opt.externalReference = c.externalReference;
      }
      return opt;
    });

    const response = NextResponse.json(
      { items },
      {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'cache-control': 'private, max-age=30',
          'x-correlation-id': correlationId,
        },
      },
    );
    if (refreshed) setSessionCookie(response, await sealSession(session));
    return response;
  } catch {
    return problem(502, 'The AR service is temporarily unavailable.');
  }
}

async function refreshSession(session: ArWebSession): Promise<ArWebSession | undefined> {
  if (!session.refreshToken) return undefined;
  try {
    const tokens = await client.refreshTokenGrant(await oidcConfiguration(), session.refreshToken);
    if (!tokens.access_token) return undefined;
    return {
      sub: session.sub,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? session.refreshToken,
      expiresAt: now() + Math.max(60, Math.min(tokens.expires_in ?? 300, 86_400)),
    };
  } catch {
    return undefined;
  }
}

function problem(status: number, title: string): NextResponse {
  return NextResponse.json(
    { type: 'about:blank', title, status, correlationId: randomUUID() },
    {
      status,
      headers: { 'content-type': 'application/problem+json', 'cache-control': 'no-store' },
    },
  );
}
