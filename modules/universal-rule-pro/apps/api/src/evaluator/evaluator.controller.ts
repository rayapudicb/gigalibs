import { Controller, Post, Body, Headers, BadRequestException } from '@nestjs/common';
import { EvaluatorService, EvaluationRequest } from './evaluator.service.js';

@Controller('api/rules/v1/evaluate')
export class EvaluatorController {
  constructor(private readonly evaluatorService: EvaluatorService) {}

  @Post()
  async evaluate(
    @Body() body: EvaluationRequest & { tenant_id?: string },
    @Headers('x-tenant-id') tenantHeader?: string,
  ) {
    const tenantId = tenantHeader || body.tenant_id;
    if (!tenantId) {
      throw new BadRequestException('X-Tenant-Id header is required for rule evaluation');
    }
    return this.evaluatorService.evaluate(tenantId, body);
  }
}
