import {
  CurrentPrincipal,
  RequirePermissions,
  type ModuleCommandContext,
  type ModulePrincipal,
} from '@gigalibs/module-sdk';
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { PartnerCreditCheckRequestV1Schema } from '@gigalibs/contracts';
import { randomUUID } from 'node:crypto';
import { AuthorizationGuard } from '../authorization.js';
import { errors } from '../records/records.service.js';
import { CreditCheckService } from './credit-check.service.js';

@Controller('v1/credit-check')
@UseGuards(AuthorizationGuard)
export class CreditCheckController {
  constructor(private readonly creditCheck: CreditCheckService) {}

  @Post()
  @RequirePermissions('business-partners.credit.read')
  check(@CurrentPrincipal() principal: ModulePrincipal, @Body() body: unknown) {
    const input = errors.parseInput(PartnerCreditCheckRequestV1Schema, body);
    const context: ModuleCommandContext = { principal, correlationId: randomUUID() };
    return this.creditCheck.check(context, input);
  }
}
