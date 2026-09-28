import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  GigaOpsAuthorizationGuard,
  RequireRoles,
  type AuthenticatedGigaOpsRequest,
} from '../auth/authorization.js';
import { type CreateRoleDto, RolesService } from './roles.service.js';

@Controller()
@UseGuards(GigaOpsAuthorizationGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get('work-units/:wuId/roles')
  listForWorkUnit(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Param('wuId') wuId: string,
  ) {
    const tenantId = req.principal!.tenantId;
    return this.rolesService.listForWorkUnit(tenantId, wuId);
  }

  @Post('work-units/:wuId/roles')
  @RequireRoles('workforce_manager', 'org_admin')
  create(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Param('wuId') wuId: string,
    @Body() dto: CreateRoleDto,
  ) {
    const tenantId = req.principal!.tenantId;
    return this.rolesService.create(tenantId, wuId, dto);
  }

  @Put('roles/:id')
  @RequireRoles('workforce_manager', 'org_admin')
  update(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Param('id') id: string,
    @Body() dto: Partial<CreateRoleDto>,
  ) {
    const tenantId = req.principal!.tenantId;
    return this.rolesService.update(tenantId, id, dto);
  }
}
