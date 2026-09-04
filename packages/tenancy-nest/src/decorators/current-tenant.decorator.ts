import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { TenantContext } from '@gigalibs/contracts';

export const CurrentTenant = createParamDecorator(
  (data: keyof TenantContext | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const tenant = request.tenant as TenantContext | undefined;

    if (!tenant) return null;
    return data ? tenant[data] : tenant;
  },
);
