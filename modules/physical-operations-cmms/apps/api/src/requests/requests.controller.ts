import {
  Body, Controller, Get, HttpCode, HttpStatus,
  Param, Post, Req, UseGuards,
} from '@nestjs/common';
import { AuthenticatedRequest, OidcAuthorizationGuard, RequirePermissions } from '../auth/authorization.js';
import { RequestsService } from './requests.service.js';

@Controller('v1/requests')
@UseGuards(OidcAuthorizationGuard)
export class RequestsController {
  constructor(private readonly svc: RequestsService) {}

  @Post('search')
  @RequirePermissions('cmms.requests.read')
  @HttpCode(HttpStatus.OK)
  search(
    @Req() req: AuthenticatedRequest,
    @Body() body: { page?: number; pageSize?: number; status?: any; priority?: any; q?: string },
  ) {
    const departmentIds = req.principal!.departmentScope.mode === 'SCOPED_DEPARTMENTS'
      ? req.principal!.departmentScope.departmentIds
      : undefined;
    return this.svc.search(req.principal!.tenantId, body, departmentIds);
  }

  @Get(':id')
  @RequirePermissions('cmms.requests.read')
  getOne(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.svc.getOne(req.principal!.tenantId, id);
  }

  @Post()
  @RequirePermissions('cmms.requests.write')
  @HttpCode(HttpStatus.CREATED)
  create(@Req() req: AuthenticatedRequest, @Body() body: any) {
    return this.svc.create(req.principal!.tenantId, req.principal!.subject, body);
  }

  @Post(':id/approve')
  @RequirePermissions('cmms.requests.write')
  @HttpCode(HttpStatus.OK)
  approve(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { version: number },
  ) {
    return this.svc.approve(req.principal!.tenantId, id, body.version);
  }

  @Post(':id/cancel')
  @RequirePermissions('cmms.requests.write')
  @HttpCode(HttpStatus.OK)
  cancel(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { version: number },
  ) {
    return this.svc.cancel(req.principal!.tenantId, id, body.version);
  }

  /**
   * POST /v1/requests/:id/convert
   * Converts an APPROVED request into a Work Order atomically.
   */
  @Post(':id/convert')
  @RequirePermissions('cmms.requests.write')
  @HttpCode(HttpStatus.OK)
  convertToWorkOrder(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { version: number; assignedTo?: string; dueDate?: string },
  ) {
    const { version, ...woData } = body;
    return this.svc.convertToWorkOrder(req.principal!.tenantId, req.principal!.subject, id, version, woData);
  }
}
