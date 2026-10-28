import { CurrentPrincipal, type ModulePrincipal, RequirePermissions } from '@gigalibs/module-sdk';
import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthorizationGuard } from '../authorization.js';
import { errors } from '../records/records.service.js';
import { NettingService } from './netting.service.js';

const QueryV1 = z
  .object({
    orgUnitId: z.string().trim().min(1).max(64),
    currencyCode: z.string().regex(/^[A-Z]{3}$/),
  })
  .strict();

@Controller('v1/partners/:partyId/netting')
@UseGuards(AuthorizationGuard)
export class NettingController {
  constructor(private readonly netting: NettingService) {}

  @Get()
  @RequirePermissions('business-partners.credit.read')
  get(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('partyId') partyId: string,
    @Query() rawQuery: unknown,
  ) {
    errors.assertUuid(partyId, 'partyId');
    const query = errors.parseInput(QueryV1, rawQuery);
    return this.netting.get(principal, partyId, query.orgUnitId, query.currencyCode);
  }
}
