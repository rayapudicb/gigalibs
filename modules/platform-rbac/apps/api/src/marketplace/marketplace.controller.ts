import { Controller, Get, Post, Headers, Body } from '@nestjs/common';
import { requiredServiceIdentifier } from '../security/required-service-header.js';
import { MarketplaceService } from './marketplace.service.js';

@Controller('api/tenant/v1/marketplace')
export class MarketplaceController {
  constructor(private readonly marketplaceService: MarketplaceService) {}

  @Get('catalog')
  async getCatalog(@Headers('x-tenant-id') tenantHeader?: string) {
    return this.marketplaceService.getCatalog(
      requiredServiceIdentifier(tenantHeader, 'x-tenant-id'),
    );
  }

  @Post('purchase')
  async purchaseModule(
    @Headers('x-tenant-id') tenantHeader: string,
    @Headers('x-user-id') userHeader: string,
    @Body() body: { moduleCode: string; billingCycle?: 'MONTHLY' | 'ANNUAL' },
  ) {
    return this.marketplaceService.purchaseModule({
      tenantSlugOrId: requiredServiceIdentifier(tenantHeader, 'x-tenant-id'),
      moduleCode: body.moduleCode,
      purchasedBy: requiredServiceIdentifier(userHeader, 'x-user-id'),
      billingCycle: body.billingCycle,
    });
  }

  @Get('invoices')
  async getInvoices(@Headers('x-tenant-id') tenantHeader?: string) {
    return this.marketplaceService.getInvoices(
      requiredServiceIdentifier(tenantHeader, 'x-tenant-id'),
    );
  }

  @Get('wallet')
  async getWallets(@Headers('x-tenant-id') tenantHeader?: string) {
    return this.marketplaceService.getWallets(
      requiredServiceIdentifier(tenantHeader, 'x-tenant-id'),
    );
  }

  @Post('wallet/recharge')
  async rechargeWallet(
    @Headers('x-tenant-id') tenantHeader: string,
    @Headers('x-user-id') userHeader: string,
    @Body() body: { packId: string },
  ) {
    return this.marketplaceService.rechargeWallet({
      tenantSlugOrId: requiredServiceIdentifier(tenantHeader, 'x-tenant-id'),
      packId: body.packId,
      rechargedBy: requiredServiceIdentifier(userHeader, 'x-user-id'),
    });
  }
}
