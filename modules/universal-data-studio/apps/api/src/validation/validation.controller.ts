import { Controller, Post, Body, Headers, BadRequestException, Req } from '@nestjs/common';
import { ValidationService } from './validation.service.js';

@Controller('api/data-studio/v1/validation')
export class ValidationController {
  constructor(private readonly validationService: ValidationService) {}

  private extractTenant(tenantHeader?: string): string {
    if (!tenantHeader || tenantHeader.trim() === '') {
      throw new BadRequestException('x-tenant-id header is required');
    }
    return tenantHeader.trim();
  }

  @Post('validate')
  async validate(
    @Body() body: {
      contract_code: string;
      payload: any;
      target_version?: string;
    },
    @Headers('x-tenant-id') tenantHeader?: string,
    @Req() req?: any,
  ) {
    const tenantId = this.extractTenant(tenantHeader);
    if (!body.contract_code || !body.payload) {
      throw new BadRequestException('contract_code and payload are required');
    }

    const clientIp = req?.ip || req?.headers?.['x-forwarded-for'] || 'unknown';
    return this.validationService.validatePayload(
      tenantId,
      body.contract_code,
      body.payload,
      body.target_version,
      clientIp,
    );
  }
}
