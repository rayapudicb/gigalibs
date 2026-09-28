import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  OidcAuthorizationGuard,
  Principal,
  RequirePermissions,
  type SagaPrincipal,
} from '../auth/authorization.js';
import { type ExecuteSagaDto, SagaService } from './saga.service.js';

@Controller('api/v1/saga')
@UseGuards(OidcAuthorizationGuard)
export class SagaController {
  constructor(private readonly sagaService: SagaService) {}

  @Get('instances')
  @RequirePermissions('saga:read')
  async listInstances(@Principal() principal: SagaPrincipal) {
    return this.sagaService.listInstances(principal.tenantId);
  }

  @Get('instances/:sagaId')
  @RequirePermissions('saga:read')
  async getInstance(
    @Principal() principal: SagaPrincipal,
    @Param('sagaId') sagaId: string,
  ) {
    return this.sagaService.getInstance(principal.tenantId, sagaId);
  }

  @Get('stats')
  @RequirePermissions('saga:read')
  async getStats(@Principal() principal: SagaPrincipal) {
    return this.sagaService.getStats(principal.tenantId);
  }

  @Post('execute')
  @RequirePermissions('saga:write')
  async executeSaga(
    @Principal() principal: SagaPrincipal,
    @Body() body: ExecuteSagaDto,
  ) {
    if (!body?.sagaType) {
      throw new BadRequestException('sagaType is required.');
    }
    return this.sagaService.executeSaga(principal.tenantId, body);
  }
}
