import { Body, Controller, Get, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { type AuthenticatedRequest, OidcAuthorizationGuard, RequirePermissions } from '../auth/authorization.js';
import { type ConvertRequest, type ConvertResult, ConvertService } from './convert.service.js';

@Controller('v1')
@UseGuards(OidcAuthorizationGuard)
export class ConvertController {
  constructor(private readonly service: ConvertService) {}

  @Post('convert')
  @RequirePermissions('currency:convert')
  async convert(
    @Body() body: ConvertRequest,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) res?: any,
  ): Promise<{ data: ConvertResult }> {
    const tenantId = request.principal!.tenantId;
    const idempotencyHeader = request.headers['idempotency-key']?.toString();
    const req: ConvertRequest = {
      ...body,
      idempotencyKey: idempotencyHeader || body.idempotencyKey,
    };
    const result = await this.service.convert(tenantId, req);

    if (result.idempotencyReplayed && res) {
      res.setHeader('Idempotency-Replayed', 'true');
    }

    return { data: result };
  }

  @Post('batch-convert')
  @RequirePermissions('currency:convert')
  async batchConvert(
    @Body() body: { items: ConvertRequest[] },
    @Req() request: AuthenticatedRequest,
  ): Promise<{ data: ConvertResult[] }> {
    const tenantId = request.principal!.tenantId;
    const data = await this.service.batchConvert(tenantId, body.items || []);
    return { data };
  }

  @Get('ledger/verify')
  @RequirePermissions('currency:read')
  async verifyLedger(
    @Req() request: AuthenticatedRequest,
  ): Promise<{ data: any }> {
    const tenantId = request.principal!.tenantId;
    const verification = await this.service.verifyLedger(tenantId);
    return { data: verification };
  }

  @Get('ledger')
  @RequirePermissions('currency:read')
  async getLedger(
    @Req() request: AuthenticatedRequest,
    @Query('limit') limitStr?: string,
  ): Promise<{ data: any[] }> {
    const tenantId = request.principal!.tenantId;
    const limit = limitStr ? parseInt(limitStr, 10) : 50;
    const data = await this.service.getLedger(tenantId, limit);
    return { data };
  }
}
