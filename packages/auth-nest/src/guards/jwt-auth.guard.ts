import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { verifyJwt } from '@gigalibs/auth-core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { prisma } from '@gigalibs/db';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly jwtSecret: string;

  constructor(private readonly reflector: Reflector) {
    const secret = process.env['JWT_ACCESS_SECRET'];
    if (!secret || secret.length < 32) {
      throw new Error('JWT_ACCESS_SECRET must be configured with at least 32 characters.');
    }
    this.jwtSecret = secret;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    const token = authHeader.substring(7);
    const payload = verifyJwt(token, this.jwtSecret);

    if (!payload) {
      throw new UnauthorizedException('Token is invalid or expired');
    }

    const session = await prisma.session.findFirst({
      where: {
        id: payload.sid,
        userId: payload.sub,
        status: 'ACTIVE',
        expiresAt: { gt: new Date() },
      },
      select: { tenantId: true },
    });
    if (!session || (session.tenantId ?? undefined) !== payload.tid) {
      throw new UnauthorizedException('Session is invalid, expired, or revoked');
    }

    request.user = payload;
    return true;
  }
}
