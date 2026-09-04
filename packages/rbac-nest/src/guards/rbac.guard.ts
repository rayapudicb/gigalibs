import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionEvaluator } from '@gigalibs/rbac-core';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator.js';
import { ROLES_KEY } from '../decorators/require-roles.decorator.js';
import { RbacService } from '../rbac.service.js';

@Injectable()
export class RbacGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbacService: RbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredPermissions && !requiredRoles) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as { sub?: string; roles?: string[]; permissions?: string[]; tid?: string } | undefined;
    const tenantId = (request.tenant as { tenantId?: string } | undefined)?.tenantId ?? user?.tid;

    if (!user) {
      throw new ForbiddenException('User context missing for RBAC evaluation');
    }

    // Check Roles if required
    if (requiredRoles && requiredRoles.length > 0) {
      const userRoles = user.roles ?? [];
      const hasRole = requiredRoles.some((role) => userRoles.includes(role));
      if (!hasRole) {
        throw new ForbiddenException('Insufficient role to access this resource');
      }
    }

    // Check Permissions if required
    if (requiredPermissions && requiredPermissions.length > 0) {
      const userPermissions = await this.rbacService.getUserPermissions(user.sub, tenantId, user.roles);
      const isAllowed = PermissionEvaluator.hasAllPermissions(userPermissions, requiredPermissions, {
        ...(user.sub !== undefined ? { userId: user.sub } : {}),
        ...(tenantId !== undefined ? { tenantId } : {}),
      });

      if (!isAllowed) {
        throw new ForbiddenException('Insufficient permissions to access this resource');
      }
    }

    return true;
  }
}
