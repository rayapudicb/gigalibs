import { Controller, Post, Body, Param, Headers, BadRequestException } from '@nestjs/common';
import { ExecutionService, ExecuteRequest } from './execution.service.js';

@Controller('api/workflow/v1')
export class ExecutionController {
  constructor(private readonly executionService: ExecutionService) {}

  private extractTenantId(tenantHeader?: string, bodyTenant?: string): string {
    const tenantId = tenantHeader || bodyTenant;
    if (!tenantId) {
      throw new BadRequestException('X-Tenant-Id header is required');
    }
    return tenantId;
  }

  @Post('workflows/:idOrCode/execute')
  async execute(
    @Param('idOrCode') idOrCode: string,
    @Body() body: ExecuteRequest & { tenant_id?: string },
    @Headers('x-tenant-id') tenantHeader?: string,
  ) {
    const tenantId = this.extractTenantId(tenantHeader, body.tenant_id);
    return this.executionService.executeWorkflow(tenantId, idOrCode, body);
  }

  @Post('runs/:runId/replay')
  async replay(
    @Param('runId') runId: string,
    @Headers('x-tenant-id') tenantHeader?: string,
  ) {
    const tenantId = this.extractTenantId(tenantHeader);
    return this.executionService.replayRun(tenantId, runId);
  }

  @Post('runs/:runId/approve')
  async approve(
    @Param('runId') runId: string,
    @Body() body: { approver_id: string; decision?: 'APPROVE' | 'REJECT' },
    @Headers('x-tenant-id') tenantHeader?: string,
  ) {
    const tenantId = this.extractTenantId(tenantHeader);
    return this.executionService.approveRun(tenantId, runId, body.approver_id, body.decision || 'APPROVE');
  }
}
