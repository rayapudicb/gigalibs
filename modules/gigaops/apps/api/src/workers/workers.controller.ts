import {
  Body,
  Controller,
  Delete,
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
import { type CreateWorkerDto, WorkersService } from './workers.service.js';

@Controller('workers')
@UseGuards(GigaOpsAuthorizationGuard)
export class WorkersController {
  constructor(private readonly workersService: WorkersService) {}

  @Get()
  list(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Query('classification') classification?: string,
    @Query('skillTag') skillTag?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const tenantId = req.principal!.tenantId;
    return this.workersService.list(tenantId, {
      classification,
      skillTag,
      page: page ? Number.parseInt(page, 10) : undefined,
      limit: limit ? Number.parseInt(limit, 10) : undefined,
    });
  }

  @Get('search')
  search(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Query('q') q: string,
  ) {
    const tenantId = req.principal!.tenantId;
    return this.workersService.search(tenantId, q ?? '');
  }

  @Get(':id')
  getById(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Param('id') id: string,
  ) {
    const tenantId = req.principal!.tenantId;
    return this.workersService.getById(tenantId, id);
  }

  @Post()
  @RequireRoles('workforce_manager', 'org_admin')
  create(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Body() dto: CreateWorkerDto,
  ) {
    const tenantId = req.principal!.tenantId;
    return this.workersService.create(tenantId, dto);
  }

  @Put(':id')
  @RequireRoles('workforce_manager', 'org_admin')
  update(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Param('id') id: string,
    @Body() dto: Partial<CreateWorkerDto>,
  ) {
    const tenantId = req.principal!.tenantId;
    return this.workersService.update(tenantId, id, dto);
  }

  @Get(':id/skills')
  getSkills(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Param('id') id: string,
  ) {
    const tenantId = req.principal!.tenantId;
    return this.workersService.getSkills(tenantId, id);
  }

  @Post(':id/skills')
  @RequireRoles('workforce_manager', 'org_admin')
  addSkill(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Param('id') id: string,
    @Body() body: { tagSlug: string },
  ) {
    const tenantId = req.principal!.tenantId;
    return this.workersService.addSkill(tenantId, id, body.tagSlug);
  }

  @Delete(':id/skills/:tagSlug')
  @RequireRoles('workforce_manager', 'org_admin')
  removeSkill(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Param('id') id: string,
    @Param('tagSlug') tagSlug: string,
  ) {
    const tenantId = req.principal!.tenantId;
    return this.workersService.removeSkill(tenantId, id, tagSlug);
  }

  @Get(':id/timesheet')
  getTimesheet(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Param('id') id: string,
    @Query('workUnitId') workUnitId?: string,
  ) {
    const tenantId = req.principal!.tenantId;
    return this.workersService.getTimesheet(tenantId, id, workUnitId);
  }
}
