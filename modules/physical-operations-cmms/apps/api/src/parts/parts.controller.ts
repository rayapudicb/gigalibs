import {
  Body, Controller, Get, HttpCode, HttpStatus,
  Param, Post, Req, UseGuards,
} from '@nestjs/common';
import { AuthenticatedRequest, OidcAuthorizationGuard, RequirePermissions } from '../auth/authorization.js';
import { PartsService } from './parts.service.js';

@Controller('v1/parts')
@UseGuards(OidcAuthorizationGuard)
export class PartsController {
  constructor(private readonly svc: PartsService) {}

  @Post('search')
  @RequirePermissions('cmms.parts.read')
  @HttpCode(HttpStatus.OK)
  search(
    @Req() req: AuthenticatedRequest,
    @Body() body: { page?: number; pageSize?: number; category?: string; lowStockOnly?: boolean; q?: string },
  ) {
    const departmentIds = req.principal!.departmentScope.mode === 'SCOPED_DEPARTMENTS'
      ? req.principal!.departmentScope.departmentIds
      : undefined;
    return this.svc.search(req.principal!.tenantId, body, departmentIds);
  }

  @Get(':id')
  @RequirePermissions('cmms.parts.read')
  getOne(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.svc.getOne(req.principal!.tenantId, id);
  }

  @Get(':id/transactions')
  @RequirePermissions('cmms.parts.read')
  getTransactions(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.svc.getTransactions(req.principal!.tenantId, id);
  }

  @Post()
  @RequirePermissions('cmms.parts.write')
  @HttpCode(HttpStatus.CREATED)
  create(@Req() req: AuthenticatedRequest, @Body() body: any) {
    return this.svc.create(req.principal!.tenantId, req.principal!.subject, body);
  }

  @Post(':id/transaction')
  @RequirePermissions('cmms.parts.write')
  @HttpCode(HttpStatus.CREATED)
  recordTransaction(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { type: 'ADD' | 'CONSUME' | 'TRANSFER' | 'ADJUSTMENT'; quantity: number; woId?: string; poId?: string; unitCost?: number; notes?: string },
  ) {
    return this.svc.recordTransaction(req.principal!.tenantId, req.principal!.subject, {
      ...body,
      partId: id,
    });
  }
}
