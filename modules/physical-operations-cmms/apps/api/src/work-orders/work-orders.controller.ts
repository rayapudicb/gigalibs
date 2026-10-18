import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Res, UseGuards } from '@nestjs/common';
import {
  CmmsAuthorizationGuard,
  CommandContext,
  CurrentPrincipal,
  RequirePermissions,
  type CmmsCommandContext,
  type CmmsPrincipal,
} from '../auth/authorization.js';
import { WorkOrdersService } from './work-orders.service.js';

interface ReplayResponse {
  status(code: number): unknown;
  setHeader(name: string, value: string): unknown;
}

@Controller('v1/work-orders')
@UseGuards(CmmsAuthorizationGuard)
export class WorkOrdersController {
  constructor(private readonly workOrders: WorkOrdersService) {}

  @Post('search')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.work-orders.read')
  search(@CurrentPrincipal() principal: CmmsPrincipal, @Body() body: unknown) {
    return this.workOrders.search(principal, body);
  }

  @Get(':workOrderId')
  @RequirePermissions('cmms.work-orders.read')
  get(@CurrentPrincipal() principal: CmmsPrincipal, @Param('workOrderId') workOrderId: string) {
    return this.workOrders.get(principal, workOrderId);
  }

  @Get(':workOrderId/history')
  @RequirePermissions('cmms.work-orders.read')
  history(@CurrentPrincipal() principal: CmmsPrincipal, @Param('workOrderId') workOrderId: string) {
    return this.workOrders.history(principal, workOrderId);
  }

  /** 201 for a new work order; 200 with `Idempotency-Replayed: true` when the request key was seen before. */
  @Post()
  @RequirePermissions('cmms.work-orders.write')
  async create(
    @CommandContext() context: CmmsCommandContext,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: ReplayResponse,
  ) {
    const { replayed, ...workOrder } = await this.workOrders.create(context, body);
    if (replayed) {
      response.status(HttpStatus.OK);
      response.setHeader('Idempotency-Replayed', 'true');
    }
    return workOrder;
  }

  @Patch(':workOrderId')
  @RequirePermissions('cmms.work-orders.write')
  update(@CommandContext() context: CmmsCommandContext, @Param('workOrderId') workOrderId: string, @Body() body: unknown) {
    return this.workOrders.update(context, workOrderId, body);
  }

  @Post(':workOrderId/status')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.work-orders.write')
  status(@CommandContext() context: CmmsCommandContext, @Param('workOrderId') workOrderId: string, @Body() body: unknown) {
    return this.workOrders.changeStatus(context, workOrderId, body);
  }

  @Post(':workOrderId/sign-off')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.work-orders.write')
  signOff(@CommandContext() context: CmmsCommandContext, @Param('workOrderId') workOrderId: string, @Body() body: unknown) {
    return this.workOrders.signOff(context, workOrderId, body);
  }

  @Post(':workOrderId/tasks')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.work-orders.write')
  addTask(@CommandContext() context: CmmsCommandContext, @Param('workOrderId') workOrderId: string, @Body() body: unknown) {
    return this.workOrders.addTask(context, workOrderId, body);
  }

  @Patch(':workOrderId/tasks/:taskId')
  @RequirePermissions('cmms.work-orders.write')
  recordTask(
    @CommandContext() context: CmmsCommandContext,
    @Param('workOrderId') workOrderId: string,
    @Param('taskId') taskId: string,
    @Body() body: unknown,
  ) {
    return this.workOrders.recordTask(context, workOrderId, taskId, body);
  }

  @Post(':workOrderId/labour')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.work-orders.write')
  labour(@CommandContext() context: CmmsCommandContext, @Param('workOrderId') workOrderId: string, @Body() body: unknown) {
    return this.workOrders.logLabour(context, workOrderId, body);
  }

  @Post(':workOrderId/parts')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.work-orders.write')
  parts(@CommandContext() context: CmmsCommandContext, @Param('workOrderId') workOrderId: string, @Body() body: unknown) {
    return this.workOrders.issuePart(context, workOrderId, body);
  }

  /** Asks Workforce to staff the work order (WI-OI-068); the answer arrives asynchronously. */
  @Post(':workOrderId/staffing')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.work-orders.write')
  requestStaffing(@CommandContext() context: CmmsCommandContext, @Param('workOrderId') workOrderId: string, @Body() body: unknown) {
    return this.workOrders.requestStaffing(context, workOrderId, body);
  }

  @Post(':workOrderId/staffing/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.work-orders.write')
  cancelStaffing(@CommandContext() context: CmmsCommandContext, @Param('workOrderId') workOrderId: string, @Body() body: unknown) {
    return this.workOrders.cancelStaffing(context, workOrderId, body);
  }

  @Post(':workOrderId/notes')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.work-orders.write')
  note(@CommandContext() context: CmmsCommandContext, @Param('workOrderId') workOrderId: string, @Body() body: unknown) {
    return this.workOrders.addNote(context, workOrderId, body);
  }
}
