import {
  Body,
  Controller,
  Get,
  Header,
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
import { WfoStaffingService } from './wfo-staffing.service.js';

@Controller('wfo')
@UseGuards(GigaOpsAuthorizationGuard)
export class WfoStaffingController {
  constructor(private readonly staffingService: WfoStaffingService) {}

  // ─── Bulk Invitation Template & Upload ─────────────────────────────────────

  @Get('engagements/:id/invitations/template')
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="invitations_template.csv"')
  async downloadTemplate(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Param('id') id: string,
  ) {
    return this.staffingService.generateInvitationTemplateCsv(req.principal!, id);
  }

  @Post('engagements/:id/invitations/bulk-preview')
  @RequireRoles('tenant_admin', 'workforce_scheduler', 'workforce_admin')
  async previewBulk(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Param('id') id: string,
    @Body('rows') rows: any[],
  ) {
    return this.staffingService.previewBulkInvitations(req.principal!, id, rows ?? []);
  }

  @Post('engagements/:id/invitations/bulk-submit')
  @RequireRoles('tenant_admin', 'workforce_scheduler', 'workforce_admin')
  async submitBulk(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.staffingService.submitBulkInvitations(req.principal!, id, body);
  }

  // ─── Invitations ───────────────────────────────────────────────────────────

  @Post('engagements/:id/invitations')
  @RequireRoles('tenant_admin', 'workforce_scheduler', 'workforce_admin')
  async createInvitation(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.staffingService.createInvitation(req.principal!, id, body);
  }

  @Get('invitations')
  async listInvitations(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Query('engagementId') engagementId?: string,
    @Query('positionId') positionId?: string,
    @Query('workerId') workerId?: string,
    @Query('status') status?: string,
  ) {
    return this.staffingService.listInvitations(req.principal!, {
      engagementId,
      positionId,
      workerId,
      status,
    });
  }

  @Post('invitations/:id/respond')
  async respondInvitation(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.staffingService.respondInvitation(req.principal!, id, body);
  }

  // ─── Digital Contracts ─────────────────────────────────────────────────────

  @Post('engagements/:id/contracts/generate')
  @RequireRoles('tenant_admin', 'workforce_scheduler', 'workforce_admin')
  async generateContract(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.staffingService.generateContract(req.principal!, id, body);
  }

  @Post('contracts/:id/sign')
  async signContract(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.staffingService.signContract(req.principal!, id, body);
  }

  @Post('contracts/:id/approve')
  @RequireRoles('tenant_admin', 'workforce_scheduler', 'workforce_admin')
  async approveContract(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Param('id') id: string,
  ) {
    return this.staffingService.approveContract(req.principal!, id);
  }
}
