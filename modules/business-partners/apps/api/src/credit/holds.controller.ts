import {
  CommandContext, CurrentPrincipal, type ModuleCommandContext, type ModulePrincipal, RequirePermissions,
} from '@gigalibs/module-sdk';
import { Body, Controller, Get, Param, Post, Res, UseGuards } from '@nestjs/common';
import { AuthorizationGuard } from '../authorization.js';
import { errors } from '../records/records.service.js';
import { CreateManualHoldV1, ReleaseHoldV1 } from './holds.contract.js';
import { CreditHoldsService } from './holds.service.js';

interface ReplayResponse {
  status(code: number): unknown;
  setHeader(name: string, value: string): unknown;
}

@Controller('v1/partners/:partyId/credit-holds')
@UseGuards(AuthorizationGuard)
export class CreditHoldsController {
  constructor(private readonly holds: CreditHoldsService) {}

  @Get()
  @RequirePermissions('business-partners.credit.read')
  list(@CurrentPrincipal() principal: ModulePrincipal, @Param('partyId') partyId: string) {
    errors.assertUuid(partyId, 'partyId');
    return this.holds.list(principal, partyId);
  }

  @Post()
  @RequirePermissions('business-partners.credit.manage')
  async createManual(
    @CommandContext() context: ModuleCommandContext,
    @Param('partyId') partyId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: ReplayResponse,
  ) {
    errors.assertUuid(partyId, 'partyId');
    const result = await this.holds.createManual(context, partyId, errors.parseInput(CreateManualHoldV1, body));
    response.status(result.replayed ? 200 : 201);
    if (result.replayed) response.setHeader('Idempotency-Replayed', 'true');
    return result.hold;
  }

  @Post(':holdId/release')
  @RequirePermissions('business-partners.credit.manage')
  release(
    @CommandContext() context: ModuleCommandContext,
    @Param('partyId') partyId: string,
    @Param('holdId') holdId: string,
    @Body() body: unknown,
  ) {
    errors.assertUuid(partyId, 'partyId');
    errors.assertUuid(holdId, 'holdId');
    return this.holds.release(context, partyId, holdId, errors.parseInput(ReleaseHoldV1, body));
  }
}
