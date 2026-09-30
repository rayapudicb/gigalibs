/**
 * WI-OI-104d: every request to an outside source. Each URL (resource pages, next links, token endpoints) must pass the
 * outbound allowlist. Responses are size-capped while streaming. Throttling (429), server errors and network failures
 * are retried with backoff, honouring Retry-After, within the run's deadline.
 */

import { assertAllowedConnectorUrl } from '../runtime-config.js';

/** `unavailable` may succeed later (retry the run); `refused` and `invalid` need someone to fix the source or login. */
export class SourceError extends Error {
  constructor(
    readonly kind: 'unavailable' | 'refused' | 'invalid',
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export interface SourceHttpOptions {
  readonly allowedOutboundHosts: ReadonlySet<string>;
  readonly allowInsecureOutbound: boolean;
  /** Epoch ms after which no new attempt starts. */
  readonly deadline: number;
  readonly fetchImpl?: typeof fetch;
  readonly maxBytes?: number;
  readonly timeoutMs?: number;
  readonly maxAttempts?: number;
  readonly sleep?: (ms: number) => Promise<void>;
}

const RETRYABLE = new Set([429, 500, 502, 503, 504]);

export class SourceHttp {
  #requests = 0;

  constructor(private readonly options: SourceHttpOptions) {}

  get requests(): number {
    return this.#requests;
  }

  allowed(url: string | URL): URL {
    try {
      return assertAllowedConnectorUrl(url.toString(), this.options);
    } catch {
      throw new SourceError('refused', `${new URL(url.toString()).host} is not on the outbound allowlist for this workspace.`);
    }
  }

  async json(url: URL, init: { method?: 'GET' | 'POST'; headers?: Record<string, string>; body?: string } = {}): Promise<{ status: number; body: unknown }> {
    const target = this.allowed(url);
    const maxAttempts = this.options.maxAttempts ?? 4;
    for (let attempt = 1; ; attempt += 1) {
      let response: Response;
      try {
        this.#requests += 1;
        response = await (this.options.fetchImpl ?? fetch)(target, {
          method: init.method ?? 'GET',
          headers: { Accept: 'application/json', ...init.headers },
          ...(init.body !== undefined ? { body: init.body } : {}),
          redirect: 'manual',
          signal: AbortSignal.timeout(this.options.timeoutMs ?? 20_000),
        });
      } catch (error) {
        await this.backoff(attempt, maxAttempts, null, `The source could not be reached: ${(error as Error).message}`);
        continue;
      }
      if (RETRYABLE.has(response.status)) {
        await response.body?.cancel().catch(() => undefined);
        await this.backoff(attempt, maxAttempts, response.headers.get('retry-after'), `The source answered ${response.status}.`, response.status);
        continue;
      }
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel().catch(() => undefined);
        throw new SourceError('invalid', `The source redirected (${response.status}); set the final URL instead.`, response.status);
      }
      if (!response.ok) {
        const detail = (await this.readText(response).catch(() => '')).slice(0, 200);
        throw new SourceError('refused', `The source refused the request (${response.status})${detail ? `: ${detail}` : ''}.`, response.status);
      }
      const raw = await this.readText(response);
      try {
        return { status: response.status, body: raw ? JSON.parse(raw) : null };
      } catch {
        throw new SourceError('invalid', 'The source did not answer with JSON.');
      }
    }
  }

  private async backoff(attempt: number, maxAttempts: number, retryAfter: string | null, message: string, status?: number): Promise<void> {
    const wait = Math.min(retryAfterMs(retryAfter) ?? 500 * 2 ** (attempt - 1), 30_000);
    if (attempt >= maxAttempts || Date.now() + wait > this.options.deadline) throw new SourceError('unavailable', message, status);
    await (this.options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))))(wait);
  }

  private async readText(response: Response): Promise<string> {
    const limit = this.options.maxBytes ?? 5 * 1024 * 1024;
    const declared = Number(response.headers.get('content-length') ?? 0);
    if (declared > limit) {
      await response.body?.cancel().catch(() => undefined);
      throw new SourceError('invalid', `The source answered more than ${Math.round(limit / 1024 / 1024)} MB in one page; use a smaller page size.`);
    }
    if (!response.body) return '';
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel().catch(() => undefined);
        throw new SourceError('invalid', `The source answered more than ${Math.round(limit / 1024 / 1024)} MB in one page; use a smaller page size.`);
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString('utf8');
  }
}

function retryAfterMs(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}
