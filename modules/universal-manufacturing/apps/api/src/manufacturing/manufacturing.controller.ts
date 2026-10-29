import { CurrentPrincipal, RequirePermissions, type ModulePrincipal } from '@gigalibs/module-sdk';
import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthorizationGuard } from '../authorization.js';
import { ManufacturingService } from './manufacturing.service.js';

@Controller('v1')
@UseGuards(AuthorizationGuard)
export class ManufacturingController {
  constructor(private readonly manufacturing: ManufacturingService) {}

  @Get('boms')
  @RequirePermissions('universal-manufacturing.bom.read')
  listBoms(@CurrentPrincipal() principal: ModulePrincipal) {
    return this.manufacturing.listBoms(principal);
  }

  @Post('boms')
  @RequirePermissions('universal-manufacturing.bom.manage')
  createBom(@CurrentPrincipal() principal: ModulePrincipal, @Body() body: unknown) {
    return this.manufacturing.createBom(principal, body);
  }

  @Get('boms/:id/tree')
  @RequirePermissions('universal-manufacturing.bom.read')
  bomTree(@CurrentPrincipal() principal: ModulePrincipal, @Param('id') id: string) {
    return this.manufacturing.getBomTree(principal, id);
  }

  @Get('production-orders')
  @RequirePermissions('universal-manufacturing.production.read')
  listOrders(@CurrentPrincipal() principal: ModulePrincipal) {
    return this.manufacturing.listProductionOrders(principal);
  }

  @Post('production-orders')
  @RequirePermissions('universal-manufacturing.production.manage')
  createOrder(@CurrentPrincipal() principal: ModulePrincipal, @Body() body: unknown) {
    return this.manufacturing.createProductionOrder(principal, body);
  }

  @Post('production-orders/:id/release')
  @RequirePermissions('universal-manufacturing.production.manage')
  releaseOrder(@CurrentPrincipal() principal: ModulePrincipal, @Param('id') id: string) {
    return this.manufacturing.releaseProductionOrder(principal, id);
  }

  @Post('production-orders/:id/issue')
  @RequirePermissions('universal-manufacturing.production.manage')
  issueOrder(@CurrentPrincipal() principal: ModulePrincipal, @Param('id') id: string) {
    return this.manufacturing.issueProductionOrder(principal, id);
  }

  @Post('production-orders/:id/complete')
  @RequirePermissions('universal-manufacturing.production.manage')
  completeOrder(@CurrentPrincipal() principal: ModulePrincipal, @Param('id') id: string) {
    return this.manufacturing.completeProductionOrder(principal, id);
  }

  @Post('mrp/preview')
  @RequirePermissions('universal-manufacturing.mrp.read')
  mrpPreview(@CurrentPrincipal() principal: ModulePrincipal, @Body() body: unknown) {
    return this.manufacturing.previewMrp(principal, body);
  }
}
