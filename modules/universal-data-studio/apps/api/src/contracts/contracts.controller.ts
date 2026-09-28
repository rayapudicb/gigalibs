import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Headers,
  BadRequestException,
} from '@nestjs/common';
import { ContractsService } from './contracts.service.js';

@Controller('api/data-studio/v1/contracts')
export class ContractsController {
  constructor(private readonly contractsService: ContractsService) {}

  private extractTenant(tenantHeader?: string): string {
    if (!tenantHeader || tenantHeader.trim() === '') {
      throw new BadRequestException('x-tenant-id header is required');
    }
    return tenantHeader.trim();
  }

  @Get()
  async listContracts(
    @Headers('x-tenant-id') tenantHeader?: string,
    @Query('domain') domain?: string,
    @Query('search') search?: string,
  ) {
    const tenantId = this.extractTenant(tenantHeader);
    const contracts = await this.contractsService.getContracts(tenantId, domain, search);
    return {
      success: true,
      count: contracts.length,
      contracts,
    };
  }

  @Get('ledger/verify')
  async verifyLedger(@Headers('x-tenant-id') tenantHeader?: string) {
    const tenantId = this.extractTenant(tenantHeader);
    const verification = await this.contractsService.verifyLedger(tenantId);
    return {
      success: verification.valid,
      verification,
    };
  }

  @Get(':id')
  async getContract(
    @Param('id') id: string,
    @Headers('x-tenant-id') tenantHeader?: string,
  ) {
    const tenantId = this.extractTenant(tenantHeader);
    const contract = await this.contractsService.getContractById(tenantId, id);
    return {
      success: true,
      contract,
    };
  }

  @Post()
  async createContract(
    @Body() body: any,
    @Headers('x-tenant-id') tenantHeader?: string,
  ) {
    const tenantId = this.extractTenant(tenantHeader || body.tenant_id);
    const contract = await this.contractsService.createContract(tenantId, body);
    return {
      success: true,
      contract,
    };
  }

  @Post(':id/versions')
  async publishVersion(
    @Param('id') id: string,
    @Body() body: any,
    @Headers('x-tenant-id') tenantHeader?: string,
  ) {
    const tenantId = this.extractTenant(tenantHeader);
    const version = await this.contractsService.publishVersion(tenantId, id, body);
    return {
      success: true,
      version,
    };
  }

  @Delete(':id/versions/:version')
  async deleteVersion(
    @Param('id') id: string,
    @Param('version') version: string,
    @Headers('x-tenant-id') tenantHeader?: string,
  ) {
    const tenantId = this.extractTenant(tenantHeader);
    return this.contractsService.deleteVersion(tenantId, id, version);
  }

  @Post(':id/deprecate')
  async deprecateContract(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @Headers('x-tenant-id') tenantHeader?: string,
  ) {
    const tenantId = this.extractTenant(tenantHeader);
    const contract = await this.contractsService.deprecateContract(tenantId, id, reason);
    return {
      success: true,
      contract,
    };
  }
}
