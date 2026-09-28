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
  type CreateTimeEntryDto,
  TimeEntriesService,
} from './time-entries.service.js';

@Controller('time-entries')
@UseGuards(GigaOpsAuthorizationGuard)
export class TimeEntriesController {
  constructor(private readonly timeEntriesService: TimeEntriesService) {}

  @Get()
  list(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Query('workUnitId') workUnitId?: string,
    @Query('workerId') workerId?: string,
    @Query('status') status?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const tenantId = req.principal!.tenantId;
    return this.timeEntriesService.list(tenantId, {
      workUnitId,
      workerId,
      status,
      dateFrom,
      dateTo,
      page: page ? Number.parseInt(page, 10) : undefined,
      limit: limit ? Number.parseInt(limit, 10) : undefined,
    });
  }

  @Get(':id')
  getById(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Param('id') id: string,
  ) {
    const tenantId = req.principal!.tenantId;
    return this.timeEntriesService.getById(tenantId, id);
  }

  @Post()
  create(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Body() dto: CreateTimeEntryDto,
  ) {
    const tenantId = req.principal!.tenantId;
    return this.timeEntriesService.create(tenantId, dto);
  }

  @Post(':id/clock-in')
  clockIn(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Param('id') id: string,
    @Body() body: { punchIndex: number },
  ) {
    const tenantId = req.principal!.tenantId;
    return this.timeEntriesService.clockIn(tenantId, id, body.punchIndex);
  }

  @Post(':id/clock-out')
  clockOut(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Param('id') id: string,
  ) {
    const tenantId = req.principal!.tenantId;
    return this.timeEntriesService.clockOut(tenantId, id);
  }

  @Post(':id/approve')
  @RequireRoles('time_approver', 'org_admin')
  approve(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Param('id') id: string,
  ) {
    const tenantId = req.principal!.tenantId;
    const approverId = req.principal!.subject;
    return this.timeEntriesService.approve(tenantId, id, approverId);
  }

  @Post(':id/reject')
  @RequireRoles('time_approver', 'org_admin')
  reject(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Param('id') id: string,
    @Body() body: { reason: string },
  ) {
    const tenantId = req.principal!.tenantId;
    const rejecterId = req.principal!.subject;
    return this.timeEntriesService.reject(tenantId, id, rejecterId, body?.reason);
  }
}
