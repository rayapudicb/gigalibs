import { CurrentPrincipal, type ModulePrincipal, RequirePermissions } from '@gigalibs/module-sdk';
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthorizationGuard } from '../authorization.js';
import { errors } from '../records/records.service.js';
import { PartnersService } from './partners.service.js';

const ListQueryV1 = z
  .object({
    search: z.string().trim().max(200).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

@Controller('v1/partners')
@UseGuards(AuthorizationGuard)
export class PartnersController {
  constructor(private readonly partners: PartnersService) {}

  @Get()
  @RequirePermissions('business-partners.records.read')
  list(@CurrentPrincipal() principal: ModulePrincipal, @Query() rawQuery: unknown) {
    const query = errors.parseInput(ListQueryV1, rawQuery);
    return this.partners.list(principal, query.search, query.limit);
  }
}
