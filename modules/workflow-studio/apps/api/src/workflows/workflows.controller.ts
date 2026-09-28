import { Controller, Get, Post, Patch, Put, Delete, Body, Param, Query, Headers, BadRequestException } from '@nestjs/common';
import { WorkflowsService, CreateWorkflowDto, UpdateWorkflowDto } from './workflows.service.js';

@Controller('api/workflow/v1/workflows')
export class WorkflowsController {
  constructor(private readonly workflowsService: WorkflowsService) {}

  private extractTenantId(tenantHeader?: string, tenantQuery?: string, bodyTenant?: string): string {
    const tenantId = tenantHeader || tenantQuery || bodyTenant;
    if (!tenantId) {
      throw new BadRequestException('X-Tenant-Id header is required');
    }
    return tenantId;
  }

  @Get()
  async listWorkflows(
    @Headers('x-tenant-id') tenantHeader?: string,
    @Query('tenant_id') tenantQuery?: string,
    @Query('category') category?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    const tenantId = this.extractTenantId(tenantHeader, tenantQuery);
    const workflows = await this.workflowsService.getWorkflows(tenantId, category, status, search);
    return {
      success: true,
      count: workflows.length,
      workflows,
    };
  }

  @Get(':idOrCode')
  async getWorkflow(
    @Param('idOrCode') idOrCode: string,
    @Headers('x-tenant-id') tenantHeader?: string,
    @Query('tenant_id') tenantQuery?: string,
  ) {
    const tenantId = this.extractTenantId(tenantHeader, tenantQuery);
    const workflow = await this.workflowsService.getWorkflowById(tenantId, idOrCode);
    return {
      success: true,
      workflow,
    };
  }

  @Post()
  async createWorkflow(
    @Body() body: CreateWorkflowDto & { tenant_id?: string },
    @Headers('x-tenant-id') tenantHeader?: string,
    @Query('tenant_id') tenantQuery?: string,
  ) {
    const tenantId = this.extractTenantId(tenantHeader, tenantQuery, body.tenant_id);
    const workflow = await this.workflowsService.createWorkflow(tenantId, body);
    return {
      success: true,
      workflow,
    };
  }

  @Patch(':idOrCode')
  async patchWorkflow(
    @Param('idOrCode') idOrCode: string,
    @Body() body: UpdateWorkflowDto & { tenant_id?: string },
    @Headers('x-tenant-id') tenantHeader?: string,
    @Query('tenant_id') tenantQuery?: string,
  ) {
    const tenantId = this.extractTenantId(tenantHeader, tenantQuery, body?.tenant_id);
    const workflow = await this.workflowsService.updateWorkflow(tenantId, idOrCode, body);
    return {
      success: true,
      workflow,
    };
  }

  @Put(':idOrCode')
  async putWorkflow(
    @Param('idOrCode') idOrCode: string,
    @Body() body: UpdateWorkflowDto & { tenant_id?: string },
    @Headers('x-tenant-id') tenantHeader?: string,
    @Query('tenant_id') tenantQuery?: string,
  ) {
    const tenantId = this.extractTenantId(tenantHeader, tenantQuery, body?.tenant_id);
    const workflow = await this.workflowsService.updateWorkflow(tenantId, idOrCode, body);
    return {
      success: true,
      workflow,
    };
  }
}
