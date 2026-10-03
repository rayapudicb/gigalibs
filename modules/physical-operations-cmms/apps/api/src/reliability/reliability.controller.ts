import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  CmmsAuthorizationGuard,
  CommandContext,
  CurrentPrincipal,
  RequirePermissions,
  type CmmsCommandContext,
  type CmmsPrincipal,
} from '../auth/authorization.js';
import { ReliabilityService } from './reliability.service.js';

@Controller('v1')
@UseGuards(CmmsAuthorizationGuard)
export class ReliabilityController {
  constructor(private readonly service: ReliabilityService) {}

  // ─── Failure Codes ──────────────────────────────────────────────────────────

  @Get('failure-codes/tree')
  @RequirePermissions('cmms.assets.read')
  async getFailureHierarchyTree(
    @CurrentPrincipal() principal: CmmsPrincipal,
    @Query('type') type?: string,
  ) {
    const items = await this.service.getFailureHierarchyTree(principal, type);
    return { items };
  }

  @Get('failure-codes')
  @RequirePermissions('cmms.assets.read')
  async listFailureCodes(
    @CurrentPrincipal() principal: CmmsPrincipal,
    @Query('type') type?: string,
  ) {
    const items = await this.service.listFailureCodes(principal, type);
    return { items };
  }

  @Post('failure-codes')
  @RequirePermissions('cmms.assets.write')
  async createFailureCode(@CommandContext() context: CmmsCommandContext, @Body() body: unknown) {
    return this.service.createFailureCode(context, body);
  }

  @Patch('failure-codes/:id')
  @RequirePermissions('cmms.assets.write')
  async updateFailureCode(
    @CommandContext() context: CmmsCommandContext,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.service.updateFailureCode(context, id, body);
  }

  @Delete('failure-codes/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('cmms.assets.write')
  async deleteFailureCode(@CommandContext() context: CmmsCommandContext, @Param('id') id: string) {
    await this.service.deleteFailureCode(context, id);
  }

  // ─── Job Plans ───────────────────────────────────────────────────────────────

  @Get('job-plans')
  @RequirePermissions('cmms.assets.read')
  async listJobPlans(
    @CurrentPrincipal() principal: CmmsPrincipal,
    @Query('classificationId') classificationId?: string,
  ) {
    const items = await this.service.listJobPlans(principal, classificationId);
    return { items };
  }

  @Get('job-plans/:id')
  @RequirePermissions('cmms.assets.read')
  async getJobPlan(@CurrentPrincipal() principal: CmmsPrincipal, @Param('id') id: string) {
    return this.service.getJobPlan(principal, id);
  }

  @Post('job-plans')
  @RequirePermissions('cmms.assets.write')
  async createJobPlan(@CommandContext() context: CmmsCommandContext, @Body() body: unknown) {
    return this.service.createJobPlan(context, body);
  }

  @Patch('job-plans/:id')
  @RequirePermissions('cmms.assets.write')
  async updateJobPlan(
    @CommandContext() context: CmmsCommandContext,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.service.updateJobPlan(context, id, body);
  }

  // ─── Apply Job Plan to Work Order ────────────────────────────────────────────

  @Post('job-plans/:id/apply-to-work-order/:workOrderId')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.assets.write')
  async applyJobPlanToWorkOrder(
    @CommandContext() context: CmmsCommandContext,
    @Param('id') jobPlanId: string,
    @Param('workOrderId') workOrderId: string,
    @Body() body: unknown,
  ) {
    await this.service.applyJobPlanToWorkOrder(context, jobPlanId, workOrderId, body);
    return { success: true };
  }

  // ─── Failure Attribution ─────────────────────────────────────────────────────

  @Post('work-orders/:id/failure-attribution')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.assets.write')
  async recordFailureAttribution(
    @CommandContext() context: CmmsCommandContext,
    @Param('id') workOrderId: string,
    @Body() body: unknown,
  ) {
    await this.service.recordFailureAttribution(context, workOrderId, body);
    return { success: true };
  }
}
