import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { TenantContext } from '@gigalibs/contracts';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  async use(
    _req: {
      headers: Record<string, string | string[] | undefined>;
      user?: { tid?: string };
      tenant?: TenantContext;
    },
    _res: unknown,
    next: () => void,
  ) {
    // Tenant resolution occurs in TenantBoundaryGuard after authentication.
    // Middleware must not trust a tenant header before the access token is verified.
    next();
  }
}
