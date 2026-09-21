import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus,
  Param, Patch, Post, Req, UseGuards,
} from '@nestjs/common';
import { AuthenticatedRequest, OidcAuthorizationGuard, RequirePermissions } from '../auth/authorization.js';
import { LocationsService } from './locations.service.js';

@Controller('v1/locations')
@UseGuards(OidcAuthorizationGuard)
export class LocationsController {
  constructor(private readonly svc: LocationsService) {}

  @Get()
  @RequirePermissions('cmms.locations.read')
  list(@Req() req: AuthenticatedRequest) {
    const departmentIds = req.principal!.departmentScope.mode === 'SCOPED_DEPARTMENTS'
      ? req.principal!.departmentScope.departmentIds
      : undefined;
    return this.svc.list(req.principal!.tenantId, departmentIds);
  }

  @Get(':id')
  @RequirePermissions('cmms.locations.read')
  getOne(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.svc.getOne(req.principal!.tenantId, id);
  }

  @Post()
  @RequirePermissions('cmms.locations.write')
  @HttpCode(HttpStatus.CREATED)
  create(@Req() req: AuthenticatedRequest, @Body() body: any) {
    return this.svc.create(req.principal!.tenantId, body);
  }

  @Patch(':id')
  @RequirePermissions('cmms.locations.write')
  update(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: any) {
    return this.svc.update(req.principal!.tenantId, id, body);
  }

  @Delete(':id')
  @RequirePermissions('cmms.locations.write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    await this.svc.delete(req.principal!.tenantId, id);
  }
}
