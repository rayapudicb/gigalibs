import {
  Body, Controller, Get, HttpCode, HttpStatus,
  Param, Post, Req, UseGuards,
} from '@nestjs/common';
import { AuthenticatedRequest, OidcAuthorizationGuard, RequirePermissions } from '../auth/authorization.js';
import { PurchaseOrdersService, PoStatus } from './purchase-orders.service.js';

@Controller('v1/purchase-orders')
@UseGuards(OidcAuthorizationGuard)
export class PurchaseOrdersController {
  constructor(private readonly svc: PurchaseOrdersService) {}

  @Post('search')
  @RequirePermissions('cmms.purchase-orders.read')
  @HttpCode(HttpStatus.OK)
  search(
    @Req() req: AuthenticatedRequest,
    @Body() body: { page?: number; pageSize?: number; status?: PoStatus; vendorId?: string; q?: string },
  ) {
    const departmentIds = req.principal!.departmentScope.mode === 'SCOPED_DEPARTMENTS'
      ? req.principal!.departmentScope.departmentIds
      : undefined;
    return this.svc.search(req.principal!.tenantId, body, departmentIds);
  }

  @Get(':id')
  @RequirePermissions('cmms.purchase-orders.read')
  getOne(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.svc.getOne(req.principal!.tenantId, id);
  }

  @Post()
  @RequirePermissions('cmms.purchase-orders.write')
  @HttpCode(HttpStatus.CREATED)
  create(@Req() req: AuthenticatedRequest, @Body() body: any) {
    return this.svc.create(req.principal!.tenantId, req.principal!.subject, body);
  }

  @Post(':id/status')
  @RequirePermissions('cmms.purchase-orders.write')
  @HttpCode(HttpStatus.OK)
  updateStatus(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { version: number; status: PoStatus; orderedAt?: string; receivedAt?: string },
  ) {
    const { version, status, ...extra } = body;
    return this.svc.updateStatus(req.principal!.tenantId, id, version, status, extra);
  }

  /**
   * POST /v1/purchase-orders/:id/line-items/:lineItemId/receive
   * Record partial or full receipt of a line item.
   */
  @Post(':id/line-items/:lineItemId/receive')
  @RequirePermissions('cmms.purchase-orders.write')
  @HttpCode(HttpStatus.OK)
  receiveLineItem(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('lineItemId') lineItemId: string,
    @Body() body: { quantityReceived: number },
  ) {
    return this.svc.receiveLineItem(req.principal!.tenantId, id, lineItemId, body.quantityReceived);
  }
}
