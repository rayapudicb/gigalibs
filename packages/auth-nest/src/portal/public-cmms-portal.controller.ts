import { createHash, createHmac } from 'node:crypto';
import { type PlatformContextSubject } from '@gigalibs/auth-core';
import {
  PortalContextV1Schema,
  PortalReceiptV1Schema,
  PortalStatusQueryV1Schema,
  PortalStatusV1Schema,
  PortalSubmitV1Schema,
  parsePortalToken,
} from '@gigalibs/contracts';
import { prisma } from '@gigalibs/db';
import { Body, Controller, Header, Headers, HttpCode, HttpException, HttpStatus, Logger, Post } from '@nestjs/common';
import { Public } from '../decorators/public.decorator.js';
import { CMMS_TARGET, ModuleCallUnavailable, type RequestHeaders, callModule } from '../mobile/mobile-cmms-forward.js';

// WI-OI-140 M-REQ: the public (no sign-in) request portal. A link token's tenant is only a claim: this adapter checks
// the token's shape, throttles each client address, and that the tenant is live with CMMS enabled; then it calls CMMS
// as `portal:<id>` holding only cmms.portal.submit, and CMMS proves the secret, the link and the rate.

export type PortalProblemCode = 'PORTAL_LINK_INVALID' | 'PORTAL_REQUEST_INVALID' | 'PORTAL_BUSY' | 'PORTAL_UNAVAILABLE';
const PROBLEMS: Readonly<Record<PortalProblemCode, readonly [number, string]>> = {
  PORTAL_LINK_INVALID: [404, 'This request link is not valid. Tell the site team, or report the problem another way.'],
  PORTAL_REQUEST_INVALID: [400, 'Check what you entered and try again.'],
  PORTAL_BUSY: [429, 'Too many requests just now. Wait a few minutes and try again.'],
  PORTAL_UNAVAILABLE: [503, 'The service is unavailable. Try again shortly.'],
};

export class PortalProblem extends HttpException {
  constructor(readonly code: PortalProblemCode) {
    super({ code, title: PROBLEMS[code][1] }, PROBLEMS[code][0]);
  }
}

/** A fixed-window limit per client address, in this process (a shared edge limit is the open gate). */
export class PortalThrottle {
  private readonly windows = new Map<string, { start: number; count: number }>();
  constructor(private readonly limit = 30, private readonly windowMs = 60_000) {}
  allow(key: string, now = Date.now()): boolean {
    if (this.windows.size > 10_000)
      for (const [entry, window] of this.windows) if (now - window.start >= this.windowMs) this.windows.delete(entry);
    const window = this.windows.get(key);
    if (!window || now - window.start >= this.windowMs) {
      this.windows.set(key, { start: now, count: 1 });
      return true;
    }
    window.count += 1;
    return window.count <= this.limit;
  }
}

/** A contract schema, structurally (auth-nest takes no zod dependency of its own). */
type Parser<T> = { safeParse(value: unknown): { success: true; data: T } | { success: false } };

const single = (headers: RequestHeaders, name: string) => (typeof headers[name] === 'string' ? (headers[name] as string) : undefined);

@Public()
@Controller('public/cmms-portal')
export class PublicCmmsPortalController {
  private readonly logger = new Logger(PublicCmmsPortalController.name);
  private readonly throttle = new PortalThrottle();

  @Post('context')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  async context(@Headers() headers: RequestHeaders, @Body() raw: unknown) {
    const { token } = this.parse(PortalStatusQueryV1Schema, raw);
    const link = parsePortalToken(token)!;
    return this.call(headers, link.tenantId, link.id, '/v1/portal/context', { linkId: link.id, secret: link.secret }, PortalContextV1Schema);
  }

  @Post('requests')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  async submit(@Headers() headers: RequestHeaders, @Body() raw: unknown) {
    const { token, ...request } = this.parse(PortalSubmitV1Schema, raw);
    const link = parsePortalToken(token)!;
    const body = { ...request, linkId: link.id, secret: link.secret, clientKey: this.clientKey(headers) };
    return this.call(headers, link.tenantId, link.id, '/v1/portal/requests', body, PortalReceiptV1Schema);
  }

  @Post('status')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  async status(@Headers() headers: RequestHeaders, @Body() raw: unknown) {
    const { token } = this.parse(PortalStatusQueryV1Schema, raw);
    const receipt = parsePortalToken(token)!;
    return this.call(headers, receipt.tenantId, receipt.id, '/v1/portal/status',
      { submissionId: receipt.id, secret: receipt.secret }, PortalStatusV1Schema);
  }

  private parse<T>(schema: Parser<T>, raw: unknown): T {
    const parsed = schema.safeParse(raw);
    if (!parsed.success) throw new PortalProblem('PORTAL_REQUEST_INVALID');
    return parsed.data;
  }

  /** The web BFF passes the client's address; it is used only for throttling and as a keyed, daily-rotating reference. */
  private address(headers: RequestHeaders): string {
    return (single(headers, 'x-gigalibs-client-address') ?? 'unknown').slice(0, 64);
  }

  private clientKey(headers: RequestHeaders): string {
    const key = createHash('sha256').update(process.env[CMMS_TARGET.keyEnvironment] ?? '').digest();
    return createHmac('sha256', key).update(`cmms-portal-client:${new Date().toISOString().slice(0, 10)}:${this.address(headers)}`).digest('hex');
  }

  private async call<T>(
    headers: RequestHeaders, tenantId: string, capabilityId: string, path: string, body: unknown, answer: Parser<T>,
  ): Promise<T> {
    if (!this.throttle.allow(this.address(headers))) throw new PortalProblem('PORTAL_BUSY');
    const subject = await this.portalSubject(tenantId, capabilityId);
    let result: { readonly status: number; readonly value: unknown };
    try {
      const correlationId = single(headers, 'x-correlation-id');
      result = await callModule(CMMS_TARGET, subject, { method: 'POST', path, body, ...(correlationId ? { correlationId } : {}) });
    } catch (error) {
      if (error instanceof ModuleCallUnavailable) throw new PortalProblem('PORTAL_UNAVAILABLE');
      throw error;
    }
    if (result.status >= 200 && result.status < 300) {
      const parsed = answer.safeParse(result.value);
      if (parsed.success) return parsed.data;
    }
    if (result.status === 404 || result.status === 401 || result.status === 403) throw new PortalProblem('PORTAL_LINK_INVALID');
    if (result.status === 429) throw new PortalProblem('PORTAL_BUSY');
    if (result.status === 400 || result.status === 422 || result.status === 409) throw new PortalProblem('PORTAL_REQUEST_INVALID');
    this.logger.warn(`CMMS returned status ${result.status} to a portal call.`);
    throw new PortalProblem('PORTAL_UNAVAILABLE');
  }

  /** The portal principal of a live tenant with CMMS enabled; an unknown, closed or unentitled tenant is an invalid link. */
  private async portalSubject(tenantId: string, capabilityId: string): Promise<PlatformContextSubject> {
    const now = new Date();
    const tenant = await prisma.tenant.findFirst({
      where: { id: tenantId, OR: [{ status: 'ACTIVE' }, { status: 'TRIAL', trialEndsAt: { gt: now } }] },
      select: {
        id: true,
        moduleEntitlements: {
          where: { moduleKey: CMMS_TARGET.moduleKey, status: 'ENABLED', startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
          select: { moduleKey: true, status: true, updatedAt: true },
        },
      },
    });
    if (!tenant || tenant.moduleEntitlements.length === 0) throw new PortalProblem('PORTAL_LINK_INVALID');
    return {
      user: { id: `portal:${capabilityId}` },
      tenant: {
        id: tenant.id,
        entitlements: tenant.moduleEntitlements.map((item) => ({ moduleKey: item.moduleKey, status: item.status, version: item.updatedAt.toISOString() })),
      },
      roles: [], platformRoles: [], permissions: ['cmms.portal.submit'], authVersion: 0, session: null,
      orgScope: { mode: 'FLAT_TENANT' }, spatialScope: { mode: 'UNBOUNDED' },
    };
  }
}
