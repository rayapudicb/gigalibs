import { CommandContext, CurrentPrincipal, type ModuleCommandContext, type ModulePrincipal, RequirePermissions } from '@gigalibs/module-sdk';
import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { AuthorizationGuard } from '../authorization.js';
import { ProductCataloguePackService } from './pack.service.js';

/** WI-OI-154: Product Catalogue's section of the active industry pack (`pack.apply` from the kernel). */
@Controller('product-catalogue/v1/pack')
@UseGuards(AuthorizationGuard)
export class ProductCataloguePackController {
  constructor(private readonly packs: ProductCataloguePackService) {}

  @Get()
  @RequirePermissions('products:read')
  current(@CurrentPrincipal() principal: ModulePrincipal) {
    return this.packs.current(principal);
  }

  @Post('apply')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('uoms:manage')
  apply(@CommandContext() context: ModuleCommandContext, @Body() body: unknown) {
    return this.packs.apply(context, body);
  }
}
