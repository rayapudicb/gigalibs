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
import {
  type CreatePerDiemDto,
  PerDiemService,
} from './per-diem.service.js';

@Controller('per-diem')
@UseGuards(GigaOpsAuthorizationGuard)
export class PerDiemController {
  constructor(private readonly perDiemService: PerDiemService) {}

  @Get()
  list(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Query('workerId') workerId?: string,
    @Query('workUnitId') workUnitId?: string,
    @Query('status') status?: string,
  ) {
    const tenantId = req.principal!.tenantId;
    return this.perDiemService.list(tenantId, {
      workerId,
      workUnitId,
      status,
    });
  }

  @Post()
  create(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Body() dto: CreatePerDiemDto,
  ) {
    const tenantId = req.principal!.tenantId;
    return this.perDiemService.create(tenantId, dto);
  }

  @Post(':id/approve')
  @RequireRoles('time_approver', 'org_admin')
  approve(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Param('id') id: string,
  ) {
    const tenantId = req.principal!.tenantId;
    const reviewerId = req.principal!.subject;
    return this.perDiemService.approve(tenantId, id, reviewerId);
  }

  @Post(':id/reject')
  @RequireRoles('time_approver', 'org_admin')
  reject(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Param('id') id: string,
    @Body() body: { notes?: string },
  ) {
    const tenantId = req.principal!.tenantId;
    const reviewerId = req.principal!.subject;
    return this.perDiemService.reject(tenantId, id, reviewerId, body?.notes);
  }
}
