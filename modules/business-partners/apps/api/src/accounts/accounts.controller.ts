import {
  CommandContext, CurrentPrincipal, type ModuleCommandContext, type ModulePrincipal, RequirePermissions,
} from '@gigalibs/module-sdk';
import { Body, Controller, Get, Param, Post, Res, UseGuards } from '@nestjs/common';
import { AuthorizationGuard } from '../authorization.js';
import { errors } from '../records/records.service.js';
import { CreateCustomerAccountV1, CreateVendorAccountV1 } from './accounts.contract.js';
import { PartnerAccountsService } from './accounts.service.js';

interface ReplayResponse {
  status(code: number): unknown;
  setHeader(name: string, value: string): unknown;
}

@Controller('v1/partners/:partyId')
@UseGuards(AuthorizationGuard)
export class PartnerAccountsController {
  constructor(private readonly accounts: PartnerAccountsService) {}

  @Get('accounts')
  @RequirePermissions('business-partners.accounts.read')
  list(@CurrentPrincipal() principal: ModulePrincipal, @Param('partyId') partyId: string) {
    errors.assertUuid(partyId, 'partyId');
    return this.accounts.list(principal, partyId);
  }

  @Post('customer-accounts')
  @RequirePermissions('business-partners.accounts.manage')
  async createCustomer(
    @CommandContext() context: ModuleCommandContext,
    @Param('partyId') partyId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: ReplayResponse,
  ) {
    errors.assertUuid(partyId, 'partyId');
    const { account, replayed } = await this.accounts.createCustomer(context, partyId, errors.parseInput(CreateCustomerAccountV1, body));
    response.status(replayed ? 200 : 201);
    if (replayed) response.setHeader('Idempotency-Replayed', 'true');
    return account;
  }

  @Post('vendor-accounts')
  @RequirePermissions('business-partners.accounts.manage')
  async createVendor(
    @CommandContext() context: ModuleCommandContext,
    @Param('partyId') partyId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: ReplayResponse,
  ) {
    errors.assertUuid(partyId, 'partyId');
    const { account, replayed } = await this.accounts.createVendor(context, partyId, errors.parseInput(CreateVendorAccountV1, body));
    response.status(replayed ? 200 : 201);
    if (replayed) response.setHeader('Idempotency-Replayed', 'true');
    return account;
  }
}
