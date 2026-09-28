import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  GigaOpsAuthorizationGuard,
  RequireRoles,
  type AuthenticatedGigaOpsRequest,
} from '../auth/authorization.js';
import { MetaService } from './meta.service.js';

@Controller('meta')
@UseGuards(GigaOpsAuthorizationGuard)
export class MetaController {
  constructor(private readonly metaService: MetaService) {}

  @Get('worker-classifications')
  getWorkerClassifications() {
    return this.metaService.getWorkerClassifications();
  }

  @Get('pay-types')
  getPayTypes() {
    return this.metaService.getPayTypes();
  }

  @Get('skill-tags')
  getSkillTags(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Query('industrySlug') industrySlug?: string,
  ) {
    const tenantId = req.principal!.tenantId;
    return this.metaService.getSkillTags(tenantId, industrySlug);
  }

  @Post('skill-tags')
  @RequireRoles('org_admin')
  createSkillTag(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Body() body: { slug: string; label: string; industrySlug?: string },
  ) {
    const tenantId = req.principal!.tenantId;
    return this.metaService.createTenantSkillTag(
      tenantId,
      body.slug,
      body.label,
      body.industrySlug,
    );
  }
}
