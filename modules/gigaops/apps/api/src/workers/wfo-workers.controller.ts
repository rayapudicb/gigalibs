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
import { WfoWorkersService } from './wfo-workers.service.js';

@Controller('wfo/workers')
@UseGuards(GigaOpsAuthorizationGuard)
export class WfoWorkersController {
  constructor(private readonly workersService: WfoWorkersService) {}

  @Post()
  @RequireRoles('tenant_admin', 'workforce_scheduler', 'workforce_admin')
  async createWorker(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Body() body: unknown,
  ) {
    return this.workersService.createWorker(req.principal!, body);
  }

  @Get()
  async listWorkers(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Query('status') status?: string,
    @Query('workerType') workerType?: string,
    @Query('orgUnitId') orgUnitId?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.workersService.listWorkers(req.principal!, {
      status,
      workerType,
      orgUnitId,
      search,
      page: page ? Number.parseInt(page, 10) : undefined,
      limit: limit ? Number.parseInt(limit, 10) : undefined,
    });
  }

  @Get(':id')
  async getWorker(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Param('id') id: string,
  ) {
    return this.workersService.getWorker(req.principal!, id);
  }

  @Put(':id')
  @RequireRoles('tenant_admin', 'workforce_scheduler', 'workforce_admin')
  async updateWorker(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.workersService.updateWorker(req.principal!, id, body);
  }

  @Post(':id/approve')
  @RequireRoles('tenant_admin', 'workforce_admin')
  async approveWorker(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Param('id') id: string,
  ) {
    return this.workersService.setLifecycleStatus(req.principal!, id, 'ACTIVE');
  }

  @Post(':id/deactivate')
  @RequireRoles('tenant_admin', 'workforce_admin')
  async deactivateWorker(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Param('id') id: string,
  ) {
    return this.workersService.setLifecycleStatus(req.principal!, id, 'INACTIVE');
  }

  // ─── Compliance Documents ──────────────────────────────────────────────────

  @Post(':id/compliance-docs')
  async addComplianceDoc(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.workersService.addComplianceDoc(req.principal!, id, body);
  }

  @Get(':id/compliance-docs')
  async listComplianceDocs(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Param('id') id: string,
  ) {
    return this.workersService.listComplianceDocs(req.principal!, id);
  }

  @Post(':id/compliance-docs/:docId/verify')
  @RequireRoles('tenant_admin', 'workforce_admin', 'compliance_officer')
  async verifyComplianceDoc(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Param('id') id: string,
    @Param('docId') docId: string,
    @Body() body: unknown,
  ) {
    return this.workersService.verifyComplianceDoc(req.principal!, id, docId, body);
  }
}
