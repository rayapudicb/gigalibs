import { CurrentPrincipal, type ModulePrincipal, RequirePermissions } from '@gigalibs/module-sdk';
import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthorizationGuard } from '../authorization.js';
import { errors } from '../records/records.service.js';
import { CreditStatusService } from './status.service.js';

const QueryV1 = z.object({
  orgUnitId: z.string().trim().min(1).max(64),
  currencyCode: z.string().regex(/^[A-Z]{3}$/),
}).strict();

@Controller('v1/partners/:partyId/credit-status')
@UseGuards(AuthorizationGuard)
export class CreditStatusController {
  constructor(private readonly credit: CreditStatusService) {}

  @Get()
  @RequirePermissions('business-partners.credit.read')
  get(@CurrentPrincipal() principal: ModulePrincipal, @Param('partyId') partyId: string, @Query() rawQuery: unknown) {
    errors.assertUuid(partyId, 'partyId');
    const query = errors.parseInput(QueryV1, rawQuery);
    return this.credit.get(principal, partyId, query.orgUnitId, query.currencyCode);
  }

  @Get('explain')
  @RequirePermissions('business-partners.credit.read')
  explain(@CurrentPrincipal() principal: ModulePrincipal, @Param('partyId') partyId: string, @Query() rawQuery: unknown) {
    errors.assertUuid(partyId, 'partyId');
    const query = errors.parseInput(QueryV1, rawQuery);
    return this.credit.explain(principal, partyId, query.orgUnitId, query.currencyCode);
  }
}
