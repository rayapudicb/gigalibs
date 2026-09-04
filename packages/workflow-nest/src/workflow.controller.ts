import { Controller, Get, Post, Body } from '@nestjs/common';
import { WorkflowService } from './workflow.service.js';
import type { WorkflowRule } from '@gigalibs/workflow-engine';

@Controller('workflows')
export class WorkflowController {
  constructor(private readonly workflowService: WorkflowService) {}

  @Get('rules')
  async getRules() {
    return this.workflowService.getRules();
  }

  @Post('rules')
  async createRule(@Body() body: Omit<WorkflowRule, 'id'>) {
    return this.workflowService.createRule(body);
  }

  @Post('trigger')
  async triggerEvent(@Body() body: { event: string; data: Record<string, unknown> }) {
    return this.workflowService.triggerEvent(body.event, body.data);
  }
}
