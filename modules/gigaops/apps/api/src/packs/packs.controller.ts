import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  GigaOpsAuthorizationGuard,
  RequireRoles,
  type AuthenticatedGigaOpsRequest,
} from '../auth/authorization.js';
import { PacksService } from './packs.service.js';

@Controller('packs')
@UseGuards(GigaOpsAuthorizationGuard)
export class PacksController {
  constructor(private readonly packsService: PacksService) {}

  @Get('industries')
  getIndustries() {
    return this.packsService.getIndustries();
  }

  @Get('countries')
  getCountries() {
    return this.packsService.getCountries();
  }

  @Get('active')
  async getActive(@Req() req: AuthenticatedGigaOpsRequest) {
    const tenantId = req.principal!.tenantId;
    return this.packsService.getActivePack(tenantId);
  }

  @Post('activate')
  @RequireRoles('org_admin')
  async activate(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Body() body: { industrySlug: string; countryCode: string },
  ) {
    const tenantId = req.principal!.tenantId;
    const actorId = req.principal!.subject;
    return this.packsService.activatePack(
      tenantId,
      body.industrySlug,
      body.countryCode,
      actorId,
    );
  }
}
