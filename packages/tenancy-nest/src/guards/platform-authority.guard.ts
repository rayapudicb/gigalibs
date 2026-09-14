import type { PlatformRole } from '@gigalibs/contracts';
import { prisma } from '@gigalibs/db';
import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PLATFORM_ROLES_KEY } from '../decorators/require-platform-roles.decorator.js';

@Injectable()
export class PlatformAuthorityGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ user?: { sub?: string } }>();
    const userId = request.user?.sub;
    if (!userId) throw new ForbiddenException('Authenticated platform identity is required');

    const required = (Reflect.getMetadata(PLATFORM_ROLES_KEY, context.getHandler()) as
      | PlatformRole[]
      | undefined) ??
      (Reflect.getMetadata(PLATFORM_ROLES_KEY, context.getClass()) as
        | PlatformRole[]
        | undefined) ?? ['PLATFORM_OWNER', 'PLATFORM_ADMIN', 'PLATFORM_AUDITOR'];
    const assignments = await prisma.platformRoleAssignment.findMany({
      where: {
        userId,
        status: 'ACTIVE',
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { role: true },
    });
    const roles = assignments.map((assignment) => assignment.role);
    if (!roles.some((role) => required.includes(role))) {
      throw new ForbiddenException('Global platform authority is required');
    }
    (request as { platformRoles?: PlatformRole[] }).platformRoles = roles;
    return true;
  }
}
