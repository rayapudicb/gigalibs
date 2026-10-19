import { Body, Controller, Headers, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import {
  type AuthenticatedRequest,
  ArAuthorizationGuard,
  RequirePermissions,
} from '../auth/authorization.js';
import { requireIdempotencyKey } from '../database/persistence-helpers.js';
import { SetupService } from './setup.service.js';

interface PassthroughResponse {
  status(code: number): void;
  setHeader(name: string, value: string): void;
}

@Controller('v1/setup')
@UseGuards(ArAuthorizationGuard)
export class SetupController {
  constructor(@Inject(SetupService) private readonly setup: SetupService) {}

  @Post()
  @RequirePermissions('ar.settings.manage')
  async configure(
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyHeader: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: PassthroughResponse,
  ): Promise<object> {
    const principal = requirePrincipal(request);
    const idempotencyKey = requireIdempotencyKey(idempotencyHeader);
    const result = await this.setup.configure(
      body,
      principal,
      idempotencyKey,
      request.correlationId ?? 'unavailable',
    );
    response.status(result.replayed ? 200 : result.status);
    response.setHeader('Idempotency-Replayed', String(result.replayed));
    return result.body;
  }
}

function requirePrincipal(request: AuthenticatedRequest) {
  if (!request.principal) throw new Error('Authorization guard did not provide a principal.');
  return request.principal;
}
