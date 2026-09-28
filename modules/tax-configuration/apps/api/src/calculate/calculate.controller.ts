import { Body, Controller, Get, Headers, Post, Req, Res, UseGuards } from '@nestjs/common';
import { type AuthenticatedRequest, OidcAuthorizationGuard, RequirePermissions } from '../auth/authorization.js';
import { calculationInputSchema, parseInput, requireIdempotencyKey } from '../validation.js';
import { CalculateService } from './calculate.service.js';

@Controller('api/tax/v1')
@UseGuards(OidcAuthorizationGuard)
export class CalculateController {
  constructor(private readonly service: CalculateService) {}

  @Post('calculate')
  @RequirePermissions('tax.calculate')
  async calculate(
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyHeader: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: { setHeader(name: string, value: string): void },
  ) {
    if (!request.principal) throw new Error('Authorization guard did not provide a principal.');
    const input = parseInput(calculationInputSchema, body);
    const result = await this.service.calculateTax(
      request.principal.tenantId,
      request.principal.subject,
      requireIdempotencyKey(idempotencyHeader),
      input,
    );
    if (result.idempotencyReplayed) response.setHeader('Idempotency-Replayed', 'true');
    return { data: result };
  }

  @Get('ledger/verify')
  @RequirePermissions('tax.ledger.read')
  async verifyLedger(@Req() request: AuthenticatedRequest) {
    if (!request.principal) throw new Error('Authorization guard did not provide a principal.');
    return { data: await this.service.verifyLedger(request.principal.tenantId) };
  }

  @Get('ledger')
  @RequirePermissions('tax.ledger.read')
  async getLedger(@Req() request: AuthenticatedRequest) {
    if (!request.principal) throw new Error('Authorization guard did not provide a principal.');
    return { data: await this.service.getLedger(request.principal.tenantId) };
  }
}
