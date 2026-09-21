import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus,
  Param, Patch, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { AuthenticatedRequest, OidcAuthorizationGuard, RequirePermissions } from '../auth/authorization.js';
import { AssetsService } from './assets.service.js';

@Controller('v1/assets')
@UseGuards(OidcAuthorizationGuard)
export class AssetsController {
  constructor(private readonly svc: AssetsService) {}

  @Post('search')
  @RequirePermissions('cmms.assets.read')
  @HttpCode(HttpStatus.OK)
  search(
    @Req() req: AuthenticatedRequest,
    @Body() body: {
      page?: number; pageSize?: number; status?: string; categoryId?: string;
      locationId?: string; criticality?: string; q?: string;
    },
  ) {
    const departmentIds = req.principal!.departmentScope.mode === 'SCOPED_DEPARTMENTS'
      ? req.principal!.departmentScope.departmentIds
      : undefined;
    return this.svc.search(req.principal!.tenantId, body, departmentIds);
  }

  @Get('barcode')
  @RequirePermissions('cmms.assets.read')
  getByBarcode(@Req() req: AuthenticatedRequest, @Query('value') value: string) {
    return this.svc.getByBarcode(req.principal!.tenantId, value);
  }

  @Get('nfc')
  @RequirePermissions('cmms.assets.read')
  getByNfc(@Req() req: AuthenticatedRequest, @Query('tag') tag: string) {
    return this.svc.getByBarcode(req.principal!.tenantId, tag);
  }

  @Get('children/:id')
  @RequirePermissions('cmms.assets.read')
  getChildren(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.svc.getChildren(req.principal!.tenantId, id);
  }

  @Get(':id')
  @RequirePermissions('cmms.assets.read')
  getOne(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.svc.getOne(req.principal!.tenantId, id);
  }

  @Post()
  @RequirePermissions('cmms.assets.write')
  @HttpCode(HttpStatus.CREATED)
  create(@Req() req: AuthenticatedRequest, @Body() body: any) {
    return this.svc.create(req.principal!.tenantId, req.principal!.subject, body);
  }

  @Patch(':id')
  @RequirePermissions('cmms.assets.write')
  update(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: any) {
    return this.svc.update(req.principal!.tenantId, id, req.principal!.subject, body);
  }

  @Delete(':id')
  @RequirePermissions('cmms.assets.write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    await this.svc.softDelete(req.principal!.tenantId, id, req.principal!.subject);
  }
}
