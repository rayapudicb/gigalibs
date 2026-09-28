import { type RelayTokenClaims, RelayTokenError, verifyRelayToken } from '@gigalibs/auth-core';
import {
  type CanActivate,
  type ExecutionContext,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { RelayConfig } from './relay-config.js';

export interface RelayRequest {
  headers: Record<string, string | string[] | undefined>;
  rawBody?: Buffer;
  body?: unknown;
  relayClaims?: RelayTokenClaims;
}

export interface RelayInboxGuardOptions {
  /** This module's inbox audience. */
  readonly audience: string;
  /** The only accepted relay token source (the peer module). */
  readonly source: string;
  /** Used in the "inbox is not configured" message, for example "CMMS". */
  readonly label: string;
}

/**
 * Inbox authority (ADR-0007 option A): only a relay token signed with this module's inbox key by the peer, bound
 * to the exact request body, whose tenant and message id match the envelope. User contexts are refused here, and
 * relay tokens are refused by every user route (different header type and issuer).
 */
export class RelayInboxGuardBase implements CanActivate {
  constructor(
    private readonly guardConfig: RelayConfig,
    private readonly guardOptions: RelayInboxGuardOptions,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const inboxPublicKey = this.guardConfig.inboxPublicKey;
    if (!inboxPublicKey)
      throw new ServiceUnavailableException(
        `The ${this.guardOptions.label} inbox is not configured.`,
      );
    const request = context.switchToHttp().getRequest<RelayRequest>();
    const header = request.headers.authorization;
    const match = typeof header === 'string' ? /^Bearer\s+([^\s]+)$/.exec(header.trim()) : null;
    if (!match?.[1] || !request.rawBody)
      throw new UnauthorizedException('A relay token and body are required.');
    let claims: RelayTokenClaims;
    try {
      claims = verifyRelayToken(match[1], inboxPublicKey, {
        audience: this.guardOptions.audience,
        source: this.guardOptions.source,
        body: request.rawBody.toString('utf8'),
      });
    } catch (error) {
      throw new UnauthorizedException(
        error instanceof RelayTokenError
          ? `Relay token rejected: ${error.code}.`
          : 'Relay token rejected.',
      );
    }
    const body = request.body as { tenantId?: unknown; messageId?: unknown } | undefined;
    if (body?.tenantId !== claims.tenant_id || body?.messageId !== claims.message_id) {
      throw new UnauthorizedException('The relay token does not match the envelope.');
    }
    request.relayClaims = claims;
    return true;
  }
}
