import type { TenantContext } from '@gigalibs/contracts';
import { prisma } from '@gigalibs/db';
import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

type RequestShape = {
  tenant?: TenantContext;
  user?: { sub?: string; tid?: string };
  headers?: Record<string, unknown>;
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
};

@Injectable()
export class TenantBoundaryGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic =
      Reflect.getMetadata('isPublic', context.getHandler()) === true ||
      Reflect.getMetadata('isPublic', context.getClass()) === true;
    if (isPublic) return true;
    const skipTenantBoundary =
      Reflect.getMetadata('skipTenantBoundary', context.getHandler()) === true ||
      Reflect.getMetadata('skipTenantBoundary', context.getClass()) === true;
    if (skipTenantBoundary) return true;

    const request = context.switchToHttp().getRequest<RequestShape>();
    const headerTenantId = request.headers?.['x-tenant-id'];
    const requestedIdentifiers = [
      typeof headerTenantId === 'string' ? headerTenantId : undefined,
      request.params?.tenantId,
      request.query?.tenantId,
      request.body?.tenantId,
    ].filter((value): value is string => typeof value === 'string' && value.length > 0);

    const tokenTenantId = request.user?.tid;
    if (!tokenTenantId && requestedIdentifiers.length === 0) {
      return true;
    }
    if (!tokenTenantId || !request.user?.sub) {
      throw new ForbiddenException('Select an authorized tenant before accessing tenant data');
    }

    const membership = await prisma.tenantMember.findUnique({
      where: {
        userId_tenantId: {
          userId: request.user.sub,
          tenantId: tokenTenantId,
        },
      },
      select: {
        status: true,
        tenant: {
          select: {
            id: true,
            slug: true,
            status: true,
            features: true,
            plan: true,
            trialEndsAt: true,
          },
        },
      },
    });
    const allowedTenantStatuses = Reflect.getMetadata(
      'allowedTenantStatuses',
      context.getHandler(),
    ) ??
      Reflect.getMetadata('allowedTenantStatuses', context.getClass()) ?? ['ACTIVE', 'TRIAL'];
    if (
      !membership ||
      membership.status !== 'ACTIVE' ||
      !allowedTenantStatuses.includes(membership.tenant.status) ||
      (membership.tenant.status === 'TRIAL' &&
        (!membership.tenant.trialEndsAt || membership.tenant.trialEndsAt <= new Date()))
    ) {
      throw new ForbiddenException('Tenant membership is inactive or has been revoked');
    }

    request.tenant = {
      tenantId: membership.tenant.id,
      tenantSlug: membership.tenant.slug,
      features: membership.tenant.features,
      plan: membership.tenant.plan,
    };

    const allowedIdentifiers = new Set([membership.tenant.id, membership.tenant.slug]);
    if (requestedIdentifiers.some((identifier) => !allowedIdentifiers.has(identifier))) {
      throw new ForbiddenException(
        'Tenant identifier is outside the authenticated tenant boundary',
      );
    }
    return true;
  }
}
