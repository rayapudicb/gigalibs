/**
 * WI-OI-104d: how a pull logs in. API keys and bearer tokens are sent as configured; OAuth2 client credentials fetch
 * a token from the (allowlisted) token URL and reuse it until shortly before it expires. A 401 on a page drops the
 * cached token so the next request fetches a fresh one.
 */

import type { AuthConfig, PullCredentials } from './pull-source.js';
import { SourceError, type SourceHttp } from './source-http.js';

interface CachedToken {
  readonly token: string;
  readonly expiresAt: number;
}

/** Tokens per connection, shared by runs in this process. */
export class TokenCache {
  readonly #tokens = new Map<string, CachedToken>();

  get(key: string, now = Date.now()): string | null {
    const cached = this.#tokens.get(key);
    return cached && cached.expiresAt > now ? cached.token : null;
  }

  set(key: string, token: string, expiresInSeconds: number, now = Date.now()): void {
    // Refresh a minute early; honour short lifetimes without going negative.
    const lifetime = Math.max(0, Math.min(expiresInSeconds, 24 * 3600) - 60) * 1000;
    this.#tokens.set(key, { token, expiresAt: now + lifetime });
  }

  drop(key: string): void {
    this.#tokens.delete(key);
  }
}

export interface AuthorizedRequest {
  readonly headers: Record<string, string>;
  readonly query: Record<string, string>;
}

export class SourceLogin {
  constructor(
    private readonly auth: AuthConfig,
    private readonly credentials: PullCredentials | null,
    private readonly http: SourceHttp,
    private readonly cache: TokenCache,
    private readonly cacheKey: string,
  ) {
    if (auth.kind !== 'none' && (!credentials || credentials.kind !== auth.kind)) {
      throw new SourceError('refused', `This source logs in with ${auth.kind}; store matching credentials for the connection first.`);
    }
  }

  async request(): Promise<AuthorizedRequest> {
    const auth = this.auth;
    const credentials = this.credentials;
    if (auth.kind === 'none') return { headers: {}, query: {} };
    if (auth.kind === 'api-key' && credentials?.kind === 'api-key') {
      return auth.in === 'header' ? { headers: { [auth.name]: credentials.apiKey }, query: {} } : { headers: {}, query: { [auth.name]: credentials.apiKey } };
    }
    if (auth.kind === 'bearer' && credentials?.kind === 'bearer') return { headers: { Authorization: `Bearer ${credentials.token}` }, query: {} };
    if (auth.kind === 'oauth2-client-credentials' && credentials?.kind === 'oauth2-client-credentials') {
      const token = this.cache.get(this.cacheKey) ?? (await this.fetchToken(auth, credentials));
      return { headers: { Authorization: `Bearer ${token}` }, query: {} };
    }
    throw new SourceError('refused', 'The stored credentials do not match how this source logs in.');
  }

  /** After a 401: forget a cached OAuth2 token. Returns whether trying again could help. */
  rejected(): boolean {
    if (this.auth.kind !== 'oauth2-client-credentials') return false;
    this.cache.drop(this.cacheKey);
    return true;
  }

  private async fetchToken(
    auth: Extract<AuthConfig, { kind: 'oauth2-client-credentials' }>,
    credentials: Extract<PullCredentials, { kind: 'oauth2-client-credentials' }>,
  ): Promise<string> {
    const form = new URLSearchParams({ grant_type: 'client_credentials' });
    if (auth.scope) form.set('scope', auth.scope);
    const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' };
    if (auth.clientAuth === 'basic') {
      const pair = `${encodeURIComponent(credentials.clientId)}:${encodeURIComponent(credentials.clientSecret)}`;
      headers.Authorization = `Basic ${Buffer.from(pair).toString('base64')}`;
    } else {
      form.set('client_id', credentials.clientId);
      form.set('client_secret', credentials.clientSecret);
    }
    let body: unknown;
    try {
      ({ body } = await this.http.json(new URL(auth.tokenUrl), { method: 'POST', headers, body: form.toString() }));
    } catch (error) {
      if (error instanceof SourceError && error.kind === 'refused') {
        throw new SourceError('refused', `The token endpoint refused the client credentials (${error.status ?? 'error'}).`, error.status);
      }
      throw error;
    }
    const token = (body as { access_token?: unknown } | null)?.access_token;
    if (typeof token !== 'string' || token.length === 0 || token.length > 8192) throw new SourceError('invalid', 'The token endpoint answered without an access token.');
    const expiresIn = Number((body as { expires_in?: unknown }).expires_in ?? 3600);
    this.cache.set(this.cacheKey, token, Number.isFinite(expiresIn) ? expiresIn : 3600);
    return token;
  }
}
