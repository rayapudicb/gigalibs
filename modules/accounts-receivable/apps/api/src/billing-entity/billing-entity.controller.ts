import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Put,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  type ArPrincipal,
  type AuthenticatedRequest,
  ArAuthorizationGuard,
  RequirePermissions,
} from '../auth/authorization.js';
import { BillingEntityService } from './billing-entity.service.js';

interface PassthroughResponse {
  setHeader(name: string, value: string): void;
}

@Controller('v1/billing-entity')
@UseGuards(ArAuthorizationGuard)
export class BillingEntityController {
  constructor(
    @Inject(BillingEntityService) private readonly billingEntity: BillingEntityService,
  ) {}

  // ── GET /v1/billing-entity ────────────────────────────────────────────────

  @Get()
  @RequirePermissions('ar.settings.read')
  async get(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: PassthroughResponse,
  ): Promise<object> {
    const entity = await this.billingEntity.get(requirePrincipal(request));
    response.setHeader('ETag', `"${entity.version}"`);
    return entity;
  }

  // ── PUT /v1/billing-entity ────────────────────────────────────────────────

  @Put()
  @RequirePermissions('ar.settings.manage')
  async update(
    @Body() body: unknown,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: PassthroughResponse,
  ): Promise<object> {
    const updated = await this.billingEntity.update(
      body,
      ifMatch,
      requirePrincipal(request),
      request.correlationId ?? 'unavailable',
    );
    response.setHeader('ETag', `"${updated.version}"`);
    return updated;
  }
}

function requirePrincipal(request: AuthenticatedRequest): ArPrincipal {
  if (!request.principal) throw new Error('Authorization guard did not provide a principal.');
  return request.principal;
}
