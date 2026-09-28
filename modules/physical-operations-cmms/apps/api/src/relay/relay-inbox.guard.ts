import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { RelayTokenError, type RelayTokenClaims, verifyRelayToken } from '@gigalibs/auth-core';
import { CMMS_INBOX_AUDIENCE, CMMS_RELAY_CONFIG, type CmmsRelayConfig } from './relay-config.js';

export interface RelayRequest {
  headers: Record<string, string | string[] | undefined>;
  rawBody?: Buffer;
  body?: unknown;
  relayClaims?: RelayTokenClaims;
}

/**
 * Inbox authority (ADR-0007 option A): only a relay token signed with the CMMS inbox key by Workforce, bound to
 * the exact request body, whose tenant and message id match the envelope. User contexts are refused here, and
 * relay tokens are refused by every user route (different header type and issuer).
 */
@Injectable()
export class RelayInboxGuard implements CanActivate {
  constructor(@Inject(CMMS_RELAY_CONFIG) private readonly config: CmmsRelayConfig) {}

  canActivate(context: ExecutionContext): boolean {
    if (!this.config.inboxPublicKey) throw new ServiceUnavailableException('The CMMS inbox is not configured.');
    const request = context.switchToHttp().getRequest<RelayRequest>();
    const header = request.headers.authorization;
    const match = typeof header === 'string' ? /^Bearer\s+([^\s]+)$/.exec(header.trim()) : null;
    if (!match?.[1] || !request.rawBody) throw new UnauthorizedException('A relay token and body are required.');
    let claims: RelayTokenClaims;
    try {
      claims = verifyRelayToken(match[1], this.config.inboxPublicKey, {
        audience: CMMS_INBOX_AUDIENCE,
        source: 'workforce',
        body: request.rawBody.toString('utf8'),
      });
    } catch (error) {
      throw new UnauthorizedException(error instanceof RelayTokenError ? `Relay token rejected: ${error.code}.` : 'Relay token rejected.');
    }
    const body = request.body as { tenantId?: unknown; messageId?: unknown } | undefined;
    if (body?.tenantId !== claims.tenant_id || body?.messageId !== claims.message_id) {
      throw new UnauthorizedException('The relay token does not match the envelope.');
    }
    request.relayClaims = claims;
    return true;
  }
}
