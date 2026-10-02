import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  GigaOpsAuthorizationGuard,
  RequireRoles,
  type AuthenticatedGigaOpsRequest,
} from '../auth/authorization.js';
import { WfoForecastingService } from './wfo-forecasting.service.js';

@Controller('wfo/planning')
@UseGuards(GigaOpsAuthorizationGuard)
export class WfoForecastingController {
  constructor(private readonly forecastingService: WfoForecastingService) {}

  @Get('forecast')
  async getForecast(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('orgUnitId') orgUnitId?: string,
    @Query('skillId') skillId?: string,
    @Query('horizon') horizon?: '30' | '60' | '90',
  ) {
    const today = new Date();
    const defaultStart = today.toISOString().slice(0, 10);
    const horizonDays = horizon ? Number(horizon) : 30;
    const defaultEnd = new Date(today.getTime() + horizonDays * 86400000).toISOString().slice(0, 10);

    return this.forecastingService.getForecast(req.principal!, {
      startDate: startDate || defaultStart,
      endDate: endDate || defaultEnd,
      orgUnitId,
      skillId,
      horizon,
    });
  }

  @Get('gaps')
  async getGaps(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('orgUnitId') orgUnitId?: string,
    @Query('skillId') skillId?: string,
  ) {
    const today = new Date();
    const defaultStart = today.toISOString().slice(0, 10);
    const defaultEnd = new Date(today.getTime() + 30 * 86400000).toISOString().slice(0, 10);

    return this.forecastingService.getGaps(req.principal!, {
      startDate: startDate || defaultStart,
      endDate: endDate || defaultEnd,
      orgUnitId,
      skillId,
    });
  }

  @Get('utilisation')
  async getUtilisation(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Query('orgUnitId') orgUnitId?: string,
    @Query('period') period?: string,
  ) {
    return this.forecastingService.getUtilisation(req.principal!, orgUnitId, period);
  }

  @Post('forecast/recalculate')
  @RequireRoles('TENANT_ADMIN', 'SCHEDULER')
  async recalculateForecast(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Body() body: { orgUnitId?: string; source?: 'HISTORICAL' | 'CONNECTOR_PULL' | 'AI_MODEL' | 'MANUAL'; horizonDays?: number },
  ) {
    return this.forecastingService.recalculateForecast(req.principal!, body || {});
  }
}
