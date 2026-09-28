import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  AuthenticatedRequest,
  OidcAuthorizationGuard,
  RequirePermissions,
} from '../auth/authorization.js';
import { ExpensesService } from './expenses.service.js';

@Controller('v1/expenses')
@UseGuards(OidcAuthorizationGuard)
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Get()
  @RequirePermissions('spend.expenses.read')
  async list(@Req() req: AuthenticatedRequest, @Query('status') status?: string) {
    const tenantId = req.principal!.tenantId;
    return this.expensesService.listExpenses(tenantId, status);
  }

  @Post()
  @RequirePermissions('spend.expenses.write')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: {
      costCenterId: string;
      employeeName: string;
      employeeEmail: string;
      merchant: string;
      category: string;
      paymentMethod?: string;
      currency?: string;
      amountMinor: number;
      taxMinor?: number;
      receiptFilename?: string;
      receiptUrl?: string;
      policyViolationFlag?: boolean;
      policyViolationNotes?: string;
      lines?: { description: string; glCode: string; amountMinor: number; taxMinor?: number }[];
    },
  ) {
    const tenantId = req.principal!.tenantId;
    return this.expensesService.createExpense(tenantId, body);
  }

  @Post(':id/approve')
  @RequirePermissions('spend.expenses.approve')
  async approve(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Headers('if-match') ifMatch?: string,
  ) {
    const tenantId = req.principal!.tenantId;
    const approverName = req.principal!.subject || 'Operations Director';
    let expectedVersion: number | undefined;
    if (ifMatch) {
      const parsed = Number.parseInt(ifMatch.replace(/["']/g, ''), 10);
      if (Number.isFinite(parsed)) expectedVersion = parsed;
    }
    return this.expensesService.approveExpense(tenantId, id, approverName, expectedVersion);
  }

  @Post(':id/reimburse')
  @RequirePermissions('spend.expenses.write')
  async reimburse(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const tenantId = req.principal!.tenantId;
    return this.expensesService.reimburseExpense(tenantId, id);
  }
}
