import { timingSafeEqual } from 'node:crypto';
import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

interface PlatformServiceRequest {
  readonly path?: string;
  readonly url?: string;
  readonly headers?: Readonly<Record<string, string | string[] | undefined>>;
  readonly socket?: { readonly remoteAddress?: string };
}

const SERVICE_TOKEN_HEADER = 'x-gigalibs-service-token';
const MINIMUM_SERVICE_TOKEN_BYTES = 32;

@Injectable()
export class PlatformServiceAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<PlatformServiceRequest>();
    if (requestPath(request) === '/health') return true;

    const configuredToken = process.env.PLATFORM_RBAC_SERVICE_TOKEN?.trim();
    if (!configuredToken) {
      if (allowsDevelopmentLoopback(request)) return true;
      throw new ServiceUnavailableException('Platform service authentication is not configured.');
    }

    const expected = Buffer.from(configuredToken, 'utf8');
    if (expected.byteLength < MINIMUM_SERVICE_TOKEN_BYTES) {
      throw new ServiceUnavailableException(
        `PLATFORM_RBAC_SERVICE_TOKEN must contain at least ${MINIMUM_SERVICE_TOKEN_BYTES} bytes.`,
      );
    }

    const presentedValue = request.headers?.[SERVICE_TOKEN_HEADER];
    if (typeof presentedValue !== 'string') {
      throw new UnauthorizedException('Authenticated platform service identity is required.');
    }
    const presented = Buffer.from(presentedValue, 'utf8');
    if (presented.byteLength !== expected.byteLength || !timingSafeEqual(presented, expected)) {
      throw new UnauthorizedException('Authenticated platform service identity is required.');
    }
    return true;
  }
}

function requestPath(request: PlatformServiceRequest): string {
  const path = request.path ?? request.url ?? '';
  return path.split('?', 1)[0] ?? '';
}

function allowsDevelopmentLoopback(request: PlatformServiceRequest): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  const remoteAddress = request.socket?.remoteAddress;
  return remoteAddress === '127.0.0.1' || remoteAddress === '::1' || remoteAddress === '::ffff:127.0.0.1';
}
