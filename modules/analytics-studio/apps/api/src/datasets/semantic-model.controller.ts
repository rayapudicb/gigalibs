import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { PlatformContextAuthorizationGuard } from '../auth/authorization.js';
import { CurrentPrincipal } from '../auth/principal.decorator.js';
import type { AnalyticsPrincipal } from '../auth/authorization.js';
import { DatasetService, CreateSemanticModelDto } from './dataset.service.js';

// ─── Semantic Model Controller ────────────────────────────────────────────────

@Controller('v1/semantic-models')
@UseGuards(PlatformContextAuthorizationGuard)
export class SemanticModelController {
  constructor(private readonly datasetService: DatasetService) {}

  /**
   * POST /v1/semantic-models
   * Create a semantic model over a READY dataset version.
   * Required scope: analytics:semantic-models:write
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createSemanticModel(
    @CurrentPrincipal() principal: AnalyticsPrincipal,
    @Body() dto: CreateSemanticModelDto,
  ) {
    return this.datasetService.createSemanticModel(principal, dto);
  }

  /**
   * GET /v1/semantic-models/:modelId
   * Retrieve a semantic model with its measures and latest version number.
   * Required scope: analytics:semantic-models:read
   */
  @Get(':modelId')
  async getSemanticModel(
    @CurrentPrincipal() principal: AnalyticsPrincipal,
    @Param('modelId') modelId: string,
  ) {
    return this.datasetService.getSemanticModel(principal, modelId);
  }
}
