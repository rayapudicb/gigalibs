import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  WfoActivatePackV1Schema,
  type WfoActivatedPackRecordV1,
  type WfoIndustryPackManifestV1,
} from '@gigalibs/contracts';
import {
  GigaOpsAuthorizationGuard,
  RequireRoles,
  type AuthenticatedGigaOpsRequest,
} from '../auth/authorization.js';
import { WfoPacksService } from './wfo-packs.service.js';

@Controller('wfo/packs')
@UseGuards(GigaOpsAuthorizationGuard)
export class WfoPacksController {
  constructor(private readonly packsService: WfoPacksService) {}

  @Get()
  async listPacks(@Req() req: AuthenticatedGigaOpsRequest): Promise<WfoIndustryPackManifestV1[]> {
    return this.packsService.listPacks(req.principal!);
  }

  @Post(':packId/activate')
  @RequireRoles('TENANT_ADMIN')
  async activatePack(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Param('packId') packId: string,
    @Body() body: unknown,
  ): Promise<WfoActivatedPackRecordV1> {
    const parsed = WfoActivatePackV1Schema.safeParse(body ?? {});
    const countryCode = parsed.success ? parsed.data.countryCode : 'US';
    return this.packsService.activatePack(req.principal!, packId, countryCode);
  }
}
