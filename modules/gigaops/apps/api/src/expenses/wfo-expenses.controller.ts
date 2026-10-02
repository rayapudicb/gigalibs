import {
  Body,
  Controller,
  Get,
  Param,
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
import { WfoExpensesService } from './wfo-expenses.service.js';

@Controller('wfo/expenses')
@UseGuards(GigaOpsAuthorizationGuard)
export class WfoExpensesController {
  constructor(private readonly expensesService: WfoExpensesService) {}

  @Get('mileage-calculate')
  async calculateMileage(
    @Query('miles') miles: string,
    @Query('rate') rate?: string,
  ) {
    return this.expensesService.calculateMileage(
      Number(miles || 0),
      rate ? Number(rate) : undefined,
    );
  }

  @Post()
  async createReport(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Body() body: unknown,
  ) {
    return this.expensesService.createReport(req.principal!, body);
  }

  @Get()
  async listReports(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Query('workerId') workerId?: string,
    @Query('engagementId') engagementId?: string,
    @Query('status') status?: string,
  ) {
    return this.expensesService.listReports(req.principal!, {
      workerId,
      engagementId,
      status,
    });
  }

  @Post(':id/lines')
  async addLine(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.expensesService.addExpenseLine(req.principal!, id, body);
  }

  @Post(':id/lines/:lineId/verify')
  @RequireRoles('tenant_admin', 'workforce_admin', 'operations_manager')
  async verifyLine(
    @Req() req: AuthenticatedGigaOpsRequest,
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @Body() body: unknown,
  ) {
    return this.expensesService.verifyLine(req.principal!, id, lineId, body);
  }
}
