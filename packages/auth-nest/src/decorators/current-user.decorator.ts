import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { TokenPayload } from '@gigalibs/auth-core';

export const CurrentUser = createParamDecorator(
  (data: keyof TokenPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as TokenPayload | undefined;

    if (!user) return null;
    return data ? user[data] : user;
  },
);
