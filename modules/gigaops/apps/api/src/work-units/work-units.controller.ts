import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  GigaOpsAuthorizationGuard,
  RequireRoles,
  type AuthenticatedGigaOpsRequest,
} from '../auth/authorization.js';
import {
  type CreateWorkUnitDto,
  WorkUnitsService,
} from './work-units.service.js';

@Controller('work-units')
@UseGuards(GigaOpsAuthorizationGuard)
export class WorkUnitsController {
  constructor(private readonly workUnitsService: WorkUnitsService) {}

  @Get()
  list(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Query('status') status?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const tenantId = req.principal!.tenantId;
    return this.workUnitsService.list(tenantId, {
      status,
      dateFrom,
      dateTo,
      page: page ? Number.parseInt(page, 10) : undefined,
      limit: limit ? Number.parseInt(limit, 10) : undefined,
    });
  }

  @Get(':id')
  getById(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Param('id') id: string,
  ) {
    const tenantId = req.principal!.tenantId;
    return this.workUnitsService.getById(tenantId, id);
  }

  @Get(':id/dashboard')
  getDashboard(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Param('id') id: string,
  ) {
    const tenantId = req.principal!.tenantId;
    return this.workUnitsService.getDashboard(tenantId, id);
  }

  @Post()
  @RequireRoles('workforce_manager', 'org_admin')
  create(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Body() dto: CreateWorkUnitDto,
  ) {
    const tenantId = req.principal!.tenantId;
    return this.workUnitsService.create(tenantId, dto);
  }

  @Put(':id')
  @RequireRoles('workforce_manager', 'org_admin')
  update(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Param('id') id: string,
    @Body() dto: Partial<CreateWorkUnitDto>,
  ) {
    const tenantId = req.principal!.tenantId;
    return this.workUnitsService.update(tenantId, id, dto);
  }

  @Post(':id/activate')
  @RequireRoles('workforce_manager', 'org_admin')
  activate(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Param('id') id: string,
  ) {
    const tenantId = req.principal!.tenantId;
    return this.workUnitsService.activate(tenantId, id);
  }

  @Post(':id/close')
  @RequireRoles('workforce_manager', 'org_admin')
  close(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Param('id') id: string,
  ) {
    const tenantId = req.principal!.tenantId;
    return this.workUnitsService.close(tenantId, id);
  }
}
