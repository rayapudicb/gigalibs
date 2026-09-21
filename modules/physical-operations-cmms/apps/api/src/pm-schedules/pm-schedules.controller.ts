import {
  Body, Controller, Get, HttpCode, HttpStatus,
  Param, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { AuthenticatedRequest, OidcAuthorizationGuard, RequirePermissions } from '../auth/authorization.js';
import { PmSchedulesService } from './pm-schedules.service.js';

@Controller('v1/pm-schedules')
@UseGuards(OidcAuthorizationGuard)
export class PmSchedulesController {
  constructor(private readonly svc: PmSchedulesService) {}

  @Get()
  @RequirePermissions('cmms.pm.read')
  list(@Req() req: AuthenticatedRequest, @Query('assetId') assetId?: string) {
    const departmentIds = req.principal!.departmentScope.mode === 'SCOPED_DEPARTMENTS'
      ? req.principal!.departmentScope.departmentIds
      : undefined;
    return this.svc.list(req.principal!.tenantId, assetId, departmentIds);
  }

  @Get(':id')
  @RequirePermissions('cmms.pm.read')
  getOne(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.svc.getOne(req.principal!.tenantId, id);
  }

  @Post()
  @RequirePermissions('cmms.pm.write')
  @HttpCode(HttpStatus.CREATED)
  create(@Req() req: AuthenticatedRequest, @Body() body: any) {
    return this.svc.create(req.principal!.tenantId, req.principal!.subject, body);
  }

  @Post(':id/trigger-work-order')
  @RequirePermissions('cmms.pm.write')
  @HttpCode(HttpStatus.OK)
  triggerWorkOrder(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.svc.triggerWorkOrder(req.principal!.tenantId, id, req.principal!.subject);
  }
}
