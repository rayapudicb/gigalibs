import {
  Body,
  Controller,
  Get,
  Param,
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
import { WfoEngagementsService } from './wfo-engagements.service.js';

@Controller('wfo/engagements')
@UseGuards(GigaOpsAuthorizationGuard)
export class WfoEngagementsController {
  constructor(private readonly engagementsService: WfoEngagementsService) {}

  @Post()
  @RequireRoles('tenant_admin', 'workforce_scheduler', 'workforce_admin')
  async createEngagement(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Body() body: unknown,
  ) {
    return this.engagementsService.createEngagement(req.principal!, body);
  }

  @Get()
  async listEngagements(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Query('orgUnitId') orgUnitId?: string,
    @Query('clientId') clientId?: string,
    @Query('status') status?: string,
    @Query('engagementType') engagementType?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.engagementsService.listEngagements(req.principal!, {
      orgUnitId,
      clientId,
      status,
      engagementType,
      dateFrom,
      dateTo,
      page: page ? Number.parseInt(page, 10) : undefined,
      limit: limit ? Number.parseInt(limit, 10) : undefined,
    });
  }

  @Get(':id')
  async getEngagement(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Param('id') id: string,
  ) {
    return this.engagementsService.getEngagement(req.principal!, id);
  }

  @Post(':id/publish')
  @RequireRoles('tenant_admin', 'workforce_scheduler', 'workforce_admin')
  async publishEngagement(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Param('id') id: string,
  ) {
    return this.engagementsService.publishEngagement(req.principal!, id);
  }

  // ─── Positions ─────────────────────────────────────────────────────────────

  @Post(':id/positions')
  @RequireRoles('tenant_admin', 'workforce_scheduler', 'workforce_admin')
  async createPosition(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.engagementsService.createPosition(req.principal!, id, body);
  }

  @Get(':id/positions')
  async listPositions(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Param('id') id: string,
  ) {
    return this.engagementsService.listPositions(req.principal!, id);
  }
}
