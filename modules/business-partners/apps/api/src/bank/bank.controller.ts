import {
  CommandContext,
  CurrentPrincipal,
  type ModuleCommandContext,
  type ModulePrincipal,
  RequirePermissions,
} from '@gigalibs/module-sdk';
import { Body, Controller, Get, Param, Post, Res, UseGuards } from '@nestjs/common';
import { AuthorizationGuard } from '../authorization.js';
import { errors } from '../records/records.service.js';
import { CreatePartnerBankV1 } from './bank.contract.js';
import { PartnerBankService } from './bank.service.js';

interface ReplayResponse {
  status(code: number): unknown;
  setHeader(name: string, value: string): unknown;
}

@Controller('v1/partners/:partyId/bank-accounts')
@UseGuards(AuthorizationGuard)
export class PartnerBankController {
  constructor(private readonly banks: PartnerBankService) {}

  @Get()
  @RequirePermissions('business-partners.accounts.read')
  list(@CurrentPrincipal() principal: ModulePrincipal, @Param('partyId') partyId: string) {
    errors.assertUuid(partyId, 'partyId');
    return this.banks.list(principal, partyId);
  }

  @Post()
  @RequirePermissions('business-partners.accounts.manage')
  async create(
    @CommandContext() context: ModuleCommandContext,
    @Param('partyId') partyId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: ReplayResponse,
  ) {
    errors.assertUuid(partyId, 'partyId');
    const { bank, replayed } = await this.banks.create(context, partyId, errors.parseInput(CreatePartnerBankV1, body));
    response.status(replayed ? 200 : 201);
    if (replayed) response.setHeader('Idempotency-Replayed', 'true');
    return bank;
  }
}
