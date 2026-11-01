import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import {
  CmmsAuthorizationGuard,
  CommandContext,
  CurrentPrincipal,
  RequirePermissions,
  type CmmsCommandContext,
  type CmmsPrincipal,
} from '../auth/authorization.js';
import { SparesService } from './spares.service.js';

/** WI-OI-136 M-BOM: exploded diagrams with part hotspots and live stock, and work-order part reservations. */
@Controller('v1')
@UseGuards(CmmsAuthorizationGuard)
export class SparesController {
  constructor(private readonly spares: SparesService) {}

  @Get('assets/:assetId/diagrams')
  @RequirePermissions('cmms.bom.read')
  list(@CurrentPrincipal() principal: CmmsPrincipal, @Param('assetId') assetId: string) {
    return this.spares.list(principal, assetId);
  }

  @Post('assets/:assetId/diagrams')
  @RequirePermissions('cmms.bom.manage')
  create(@CommandContext() context: CmmsCommandContext, @Param('assetId') assetId: string, @Body() body: unknown) {
    return this.spares.create(context, assetId, body);
  }

  @Get('assets/:assetId/open-work-orders')
  @RequirePermissions('cmms.work-orders.read')
  openWorkOrders(@CurrentPrincipal() principal: CmmsPrincipal, @Param('assetId') assetId: string) {
    return this.spares.openWorkOrders(principal, assetId);
  }

  @Get('diagrams/:diagramId')
  @RequirePermissions('cmms.bom.read')
  detail(@CurrentPrincipal() principal: CmmsPrincipal, @Param('diagramId') diagramId: string) {
    return this.spares.detail(principal, diagramId);
  }

  @Patch('diagrams/:diagramId')
  @RequirePermissions('cmms.bom.manage')
  update(@CommandContext() context: CmmsCommandContext, @Param('diagramId') diagramId: string, @Body() body: unknown) {
    return this.spares.update(context, diagramId, body);
  }

  @Put('diagrams/:diagramId/hotspots')
  @RequirePermissions('cmms.bom.manage')
  hotspots(@CommandContext() context: CmmsCommandContext, @Param('diagramId') diagramId: string, @Body() body: unknown) {
    return this.spares.replaceHotspots(context, diagramId, body);
  }

  @Post('diagrams/:diagramId/revise')
  @RequirePermissions('cmms.bom.manage')
  revise(@CommandContext() context: CmmsCommandContext, @Param('diagramId') diagramId: string, @Body() body: unknown) {
    return this.spares.revise(context, diagramId, body);
  }

  @Post('diagrams/:diagramId/publish')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.bom.publish')
  publish(@CommandContext() context: CmmsCommandContext, @Param('diagramId') diagramId: string, @Body() body: unknown) {
    return this.spares.publish(context, diagramId, body);
  }

  @Get('diagrams/:diagramId/image')
  @RequirePermissions('cmms.bom.read')
  image(@CurrentPrincipal() principal: CmmsPrincipal, @Param('diagramId') diagramId: string) {
    return this.spares.image(principal, diagramId);
  }

  @Get('diagrams/:diagramId/consumption')
  @RequirePermissions('cmms.bom.read')
  consumption(@CurrentPrincipal() principal: CmmsPrincipal, @Param('diagramId') diagramId: string) {
    return this.spares.consumption(principal, diagramId);
  }

  @Post('part-reservations')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.parts.reserve')
  reserve(@CommandContext() context: CmmsCommandContext, @Body() body: unknown) {
    return this.spares.reserve(context, body);
  }

  @Post('part-reservations/:reservationId/release')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.parts.reserve')
  release(@CommandContext() context: CmmsCommandContext, @Param('reservationId') reservationId: string, @Body() body: unknown) {
    return this.spares.release(context, reservationId, body);
  }

  @Get('work-orders/:workOrderId/part-reservations')
  @RequirePermissions('cmms.parts.read')
  reservations(@CurrentPrincipal() principal: CmmsPrincipal, @Param('workOrderId') workOrderId: string) {
    return this.spares.workOrderReservations(principal, workOrderId);
  }
}
