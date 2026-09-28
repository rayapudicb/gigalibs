import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  AuthenticatedRequest,
  OidcAuthorizationGuard,
  RequirePermissions,
} from '../auth/authorization.js';
import { BudgetsService } from './budgets.service.js';

@Controller('v1/cost-centers')
@UseGuards(OidcAuthorizationGuard)
export class BudgetsController {
  constructor(private readonly budgetsService: BudgetsService) {}

  @Get()
  @RequirePermissions('spend.budgets.read')
  async list(@Req() req: AuthenticatedRequest) {
    const tenantId = req.principal!.tenantId;
    return this.budgetsService.listCostCenters(tenantId);
  }

  @Post()
  @RequirePermissions('spend.budgets.write')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: {
      code: string;
      name: string;
      managerName: string;
      managerEmail: string;
      currency?: string;
      allocatedBudgetMinor: number;
      fiscalYear?: number;
    },
  ) {
    const tenantId = req.principal!.tenantId;
    return this.budgetsService.createCostCenter(tenantId, body);
  }

  @Patch(':id/budget')
  @RequirePermissions('spend.budgets.write')
  async adjust(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { allocatedBudgetMinor: number },
  ) {
    const tenantId = req.principal!.tenantId;
    return this.budgetsService.adjustBudget(tenantId, id, body.allocatedBudgetMinor);
  }
}
