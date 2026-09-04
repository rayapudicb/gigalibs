import { createHash, timingSafeEqual } from 'node:crypto';
import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { runtimeConfig } from './config/runtime-config.js';

@Injectable()
export class MetricsTokenGuard implements CanActivate {
  private readonly expectedDigest = createHash('sha256')
    .update(runtimeConfig.observabilityMetricsToken)
    .digest();

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, unknown> }>();
    const authorization = request.headers.authorization;
    if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) {
      throw new UnauthorizedException('Metrics scraper authentication is required.');
    }
    const token = authorization.slice('Bearer '.length);
    if (!token || token.trim() !== token) {
      throw new UnauthorizedException('Metrics scraper authentication is invalid.');
    }
    const candidateDigest = createHash('sha256').update(token).digest();
    if (!timingSafeEqual(candidateDigest, this.expectedDigest)) {
      throw new UnauthorizedException('Metrics scraper authentication is invalid.');
    }
    return true;
  }
}
