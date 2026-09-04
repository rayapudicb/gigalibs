import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common'
import { CurrentUser } from '@gigalibs/auth-nest'
import {
  CreateWorkflowSchema,
  PublishWorkflowSchema,
  UpdateWorkflowDraftSchema,
  type CreateWorkflowDto,
  type PublishWorkflowDto,
  type UpdateWorkflowDraftDto,
} from '@gigalibs/contracts'
import { RequirePermissions } from '@gigalibs/rbac-nest'
import { CurrentTenant } from '@gigalibs/tenancy-nest'
import { ZodValidationPipe } from '@gigalibs/validation-nest'
import { WorkflowService } from './workflow.service.js'

@Controller('workflows')
export class WorkflowController {
  constructor(private readonly workflowService: WorkflowService) {}

  @Get('pipelines')
  @RequirePermissions('workflows:read')
  getPipelines(@CurrentTenant('tenantId') tenantId: string) {
    return this.workflowService.getPipelines(tenantId)
  }

  @Post('pipelines')
  @RequirePermissions('workflows:create')
  createPipeline(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Body(new ZodValidationPipe(CreateWorkflowSchema)) dto: CreateWorkflowDto,
  ) {
    return this.workflowService.createPipeline(tenantId, userId, dto)
  }

  @Get('pipelines/:pipelineId')
  @RequirePermissions('workflows:read')
  getPipeline(
    @CurrentTenant('tenantId') tenantId: string,
    @Param('pipelineId') pipelineId: string,
  ) {
    return this.workflowService.getPipeline(tenantId, pipelineId)
  }

  @Patch('pipelines/:pipelineId/draft')
  @RequirePermissions('workflows:update')
  updateDraft(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Param('pipelineId') pipelineId: string,
    @Body(new ZodValidationPipe(UpdateWorkflowDraftSchema)) dto: UpdateWorkflowDraftDto,
  ) {
    return this.workflowService.updateDraft(tenantId, userId, pipelineId, dto)
  }

  @Post('pipelines/:pipelineId/publish')
  @RequirePermissions('workflows:publish')
  publish(
    @CurrentTenant('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Param('pipelineId') pipelineId: string,
    @Body(new ZodValidationPipe(PublishWorkflowSchema)) dto: PublishWorkflowDto,
  ) {
    return this.workflowService.publish(tenantId, userId, pipelineId, dto)
  }

  @Get('pipelines/:pipelineId/versions')
  @RequirePermissions('workflows:read')
  getVersions(
    @CurrentTenant('tenantId') tenantId: string,
    @Param('pipelineId') pipelineId: string,
  ) {
    return this.workflowService.getVersions(tenantId, pipelineId)
  }

  @Get('pipelines/:pipelineId/execution-spec')
  @RequirePermissions('workflows:execute')
  getExecutionSpec(
    @CurrentTenant('tenantId') tenantId: string,
    @Param('pipelineId') pipelineId: string,
  ) {
    return this.workflowService.getExecutionSpec(tenantId, pipelineId)
  }

  @Get('streams')
  @RequirePermissions('workflows:read')
  getStreams(@CurrentTenant('tenantId') tenantId: string) {
    return this.workflowService.getIngestionStreams(tenantId)
  }
}
