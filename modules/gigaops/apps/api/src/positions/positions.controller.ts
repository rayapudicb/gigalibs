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
import {
  type CreatePositionDto,
  PositionsService,
} from './positions.service.js';

@Controller()
@UseGuards(GigaOpsAuthorizationGuard)
export class PositionsController {
  constructor(private readonly positionsService: PositionsService) {}

  @Get('roles/:roleId/positions')
  listForRole(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Param('roleId') roleId: string,
  ) {
    const tenantId = req.principal!.tenantId;
    return this.positionsService.listForRole(tenantId, roleId);
  }

  @Post('roles/:roleId/positions')
  @RequireRoles('workforce_manager', 'org_admin')
  create(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Param('roleId') roleId: string,
    @Body() dto: CreatePositionDto,
  ) {
    const tenantId = req.principal!.tenantId;
    return this.positionsService.create(tenantId, roleId, dto);
  }

  @Put('positions/:id')
  @RequireRoles('workforce_manager', 'org_admin')
  update(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Param('id') id: string,
    @Body() dto: Partial<CreatePositionDto>,
  ) {
    const tenantId = req.principal!.tenantId;
    return this.positionsService.update(tenantId, id, dto);
  }

  @Post('positions/:id/assign')
  @RequireRoles('workforce_manager', 'org_admin')
  assign(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Param('id') id: string,
    @Body() body: { workerId: string },
  ) {
    const tenantId = req.principal!.tenantId;
    return this.positionsService.assign(tenantId, id, body.workerId);
  }

  @Post('positions/:id/unassign')
  @RequireRoles('workforce_manager', 'org_admin')
  unassign(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Param('id') id: string,
  ) {
    const tenantId = req.principal!.tenantId;
    return this.positionsService.unassign(tenantId, id);
  }
}
