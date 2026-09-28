import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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
import { ImprestService } from './imprest.service.js';

@Controller('v1/imprest')
@UseGuards(OidcAuthorizationGuard)
export class ImprestController {
  constructor(private readonly imprestService: ImprestService) {}

  @Get('wallets')
  @RequirePermissions('spend.imprest.read')
  async listWallets(@Req() req: AuthenticatedRequest) {
    const tenantId = req.principal!.tenantId;
    return this.imprestService.listWallets(tenantId);
  }

  @Post('wallets')
  @RequirePermissions('spend.imprest.write')
  @HttpCode(HttpStatus.CREATED)
  async createWallet(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: {
      walletName: string;
      custodianName: string;
      custodianEmail: string;
      currency?: string;
      targetBalanceMinor: number;
      initialFundingMinor?: number;
      fundingVoucherNumber?: string;
      lowBalanceThresholdMinor?: number;
    },
  ) {
    const tenantId = req.principal!.tenantId;
    return this.imprestService.createWallet(tenantId, body);
  }

  @Get('transactions')
  @RequirePermissions('spend.imprest.read')
  async listTransactions(
    @Req() req: AuthenticatedRequest,
    @Query('walletId') walletId?: string,
  ) {
    const tenantId = req.principal!.tenantId;
    return this.imprestService.listTransactions(tenantId, walletId);
  }

  @Post('disburse')
  @RequirePermissions('spend.imprest.write')
  @HttpCode(HttpStatus.CREATED)
  async disburse(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: {
      walletId: string;
      voucherNumber?: string;
      recipientName: string;
      amountMinor: number;
      purpose: string;
      receiptAttached?: boolean;
    },
  ) {
    const tenantId = req.principal!.tenantId;
    const recordedBy = req.principal!.subject || 'Custodian';
    return this.imprestService.recordDisbursement(tenantId, { ...body, recordedBy });
  }

  @Post('replenish')
  @RequirePermissions('spend.imprest.write')
  @HttpCode(HttpStatus.CREATED)
  async replenish(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: {
      walletId: string;
      amountMinor: number;
    },
  ) {
    const tenantId = req.principal!.tenantId;
    const recordedBy = req.principal!.subject || 'Treasury Officer';
    return this.imprestService.recordReplenishment(tenantId, { ...body, recordedBy });
  }
}
