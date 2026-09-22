import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus,
  Param, Patch, Post, Req, UseGuards,
} from '@nestjs/common';
import { AuthenticatedRequest, OidcAuthorizationGuard, RequirePermissions } from '../auth/authorization.js';
import { VendorsService } from './vendors.service.js';

@Controller('v1/vendors')
@UseGuards(OidcAuthorizationGuard)
export class VendorsController {
  constructor(private readonly svc: VendorsService) {}

  @Post('search')
  @RequirePermissions('cmms.vendors.read')
  @HttpCode(HttpStatus.OK)
  search(
    @Req() req: AuthenticatedRequest,
    @Body() body: { page?: number; pageSize?: number; q?: string },
  ) {
    return this.svc.search(req.principal!.tenantId, body);
  }

  @Get(':id')
  @RequirePermissions('cmms.vendors.read')
  getOne(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.svc.getOne(req.principal!.tenantId, id);
  }

  @Post()
  @RequirePermissions('cmms.vendors.write')
  @HttpCode(HttpStatus.CREATED)
  create(@Req() req: AuthenticatedRequest, @Body() body: any) {
    return this.svc.create(req.principal!.tenantId, req.principal!.subject, body);
  }

  @Patch(':id')
  @RequirePermissions('cmms.vendors.write')
  update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { version: number; [key: string]: any },
  ) {
    const { version, ...data } = body;
    return this.svc.update(req.principal!.tenantId, id, version, data);
  }

  @Delete(':id')
  @RequirePermissions('cmms.vendors.write')
  @HttpCode(HttpStatus.NO_CONTENT)
  softDelete(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { version: number },
  ) {
    return this.svc.softDelete(req.principal!.tenantId, id, body.version);
  }
}
