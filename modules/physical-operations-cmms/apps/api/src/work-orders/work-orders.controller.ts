import {
  Body, Controller, Get, HttpCode, HttpStatus,
  Param, Patch, Post, Req, UseGuards,
} from '@nestjs/common';
import { ZodValidationPipe } from '@gigalibs/validation-nest';
import { AuthenticatedRequest, OidcAuthorizationGuard, RequirePermissions } from '../auth/authorization.js';
import { WorkOrdersService } from './work-orders.service.js';
import {
  ChangeWorkOrderStatusSchema,
  CreateWorkOrderSchema,
  UpdateWorkOrderSchema,
  WorkOrderSearchSchema,
  type ChangeWorkOrderStatus,
  type CreateWorkOrder,
  type UpdateWorkOrder,
  type WorkOrderSearch,
} from './work-orders.schemas.js';

@Controller('v1/work-orders')
@UseGuards(OidcAuthorizationGuard)
export class WorkOrdersController {
  constructor(private readonly svc: WorkOrdersService) {}

  @Post('search')
  @RequirePermissions('cmms.work-orders.read')
  @HttpCode(HttpStatus.OK)
  search(
    @Req() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(WorkOrderSearchSchema)) body: WorkOrderSearch,
  ) {
    const departmentIds = req.principal!.departmentScope.mode === 'SCOPED_DEPARTMENTS'
      ? req.principal!.departmentScope.departmentIds
      : undefined;
    return this.svc.search(req.principal!.tenantId, body, departmentIds);
  }

  @Get('urgent')
  @RequirePermissions('cmms.work-orders.read')
  getUrgent(@Req() req: AuthenticatedRequest) {
    const departmentIds = req.principal!.departmentScope.mode === 'SCOPED_DEPARTMENTS'
      ? req.principal!.departmentScope.departmentIds
      : undefined;
    return this.svc.getUrgent(req.principal!.tenantId, departmentIds);
  }

  @Get('asset/:assetId')
  @RequirePermissions('cmms.work-orders.read')
  getByAsset(@Req() req: AuthenticatedRequest, @Param('assetId') assetId: string) {
    const departmentIds = req.principal!.departmentScope.mode === 'SCOPED_DEPARTMENTS'
      ? req.principal!.departmentScope.departmentIds
      : undefined;
    return this.svc.search(req.principal!.tenantId, { assetId }, departmentIds);
  }

  @Get(':id')
  @RequirePermissions('cmms.work-orders.read')
  getOne(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.svc.getOne(req.principal!.tenantId, id);
  }

  @Get(':id/history')
  @RequirePermissions('cmms.work-orders.read')
  getHistory(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.svc.getHistory(req.principal!.tenantId, id);
  }

  @Post()
  @RequirePermissions('cmms.work-orders.write')
  @HttpCode(HttpStatus.CREATED)
  create(
    @Req() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(CreateWorkOrderSchema)) body: CreateWorkOrder,
  ) {
    return this.svc.create(req.principal!.tenantId, req.principal!.subject, body);
  }

  @Patch(':id')
  @RequirePermissions('cmms.work-orders.write')
  update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateWorkOrderSchema)) body: UpdateWorkOrder,
  ) {
    return this.svc.update(req.principal!.tenantId, id, req.principal!.subject, body);
  }

  @Patch(':id/change-status')
  @RequirePermissions('cmms.work-orders.write')
  changeStatus(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ChangeWorkOrderStatusSchema)) body: ChangeWorkOrderStatus,
  ) {
    return this.svc.changeStatus(
      req.principal!.tenantId, id, req.principal!.subject,
      body.status, body.expectedVersion, body.feedback, body.signatureData,
    );
  }
}
