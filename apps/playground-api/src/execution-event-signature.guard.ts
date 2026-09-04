import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { runtimeConfig } from './config/runtime-config.js';

interface SignedExecutionEventRequest {
  rawBody?: Buffer;
  headers: Record<string, string | string[] | undefined>;
}

@Injectable()
export class ExecutionEventSignatureGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<SignedExecutionEventRequest>();
    const source = singleHeader(request.headers['x-gigalibs-source']);
    const timestamp = singleHeader(request.headers['x-gigalibs-timestamp']);
    const signature = singleHeader(request.headers['x-gigalibs-signature']);
    this.verify(request.rawBody, source, timestamp, signature);
    return true;
  }

  private verify(
    rawBody: Buffer | undefined,
    source: string | undefined,
    timestamp: string | undefined,
    signature: string | undefined,
  ): void {
    if (source !== runtimeConfig.executionEventSourceId || !rawBody || !timestamp || !signature) {
      throw new UnauthorizedException('Execution event signature is missing or invalid.');
    }
    const timestampSeconds = Number(timestamp);
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (
      !Number.isSafeInteger(timestampSeconds) ||
      Math.abs(nowSeconds - timestampSeconds) > runtimeConfig.executionEventMaxSkewSeconds
    ) {
      throw new UnauthorizedException('Execution event timestamp is outside the accepted window.');
    }
    const expected = `sha256=${createHmac('sha256', runtimeConfig.executionEventSigningSecret)
      .update(timestamp)
      .update('.')
      .update(rawBody)
      .digest('hex')}`;
    const suppliedBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (
      suppliedBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(suppliedBuffer, expectedBuffer)
    ) {
      throw new UnauthorizedException('Execution event signature is missing or invalid.');
    }
  }
}

function singleHeader(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
