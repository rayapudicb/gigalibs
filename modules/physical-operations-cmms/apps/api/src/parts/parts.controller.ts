import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  CmmsAuthorizationGuard,
  CommandContext,
  CurrentPrincipal,
  RequirePermissions,
  type CmmsCommandContext,
  type CmmsPrincipal,
} from '../auth/authorization.js';
import { PartsService } from './parts.service.js';

@Controller('v1/parts')
@UseGuards(CmmsAuthorizationGuard)
export class PartsController {
  constructor(private readonly parts: PartsService) {}

  @Post('search')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.parts.read')
  search(@CurrentPrincipal() principal: CmmsPrincipal, @Body() body: unknown) {
    return this.parts.search(principal, body);
  }

  // ─── Storerooms / Warehouses ────────────────────────────────────────────────

  @Get('storerooms')
  @RequirePermissions('cmms.parts.read')
  listStorerooms(@CurrentPrincipal() principal: CmmsPrincipal) {
    return this.parts.listStorerooms(principal);
  }

  @Post('storerooms')
  @RequirePermissions('cmms.parts.write')
  createStoreroom(@CommandContext() context: CmmsCommandContext, @Body() body: unknown) {
    return this.parts.createStoreroom(context, body);
  }

  @Patch('storerooms/:storeroomId')
  @RequirePermissions('cmms.parts.write')
  updateStoreroom(
    @CommandContext() context: CmmsCommandContext,
    @Param('storeroomId') storeroomId: string,
    @Body() body: unknown,
  ) {
    return this.parts.updateStoreroom(context, storeroomId, body);
  }

  @Delete('storerooms/:storeroomId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('cmms.parts.write')
  deleteStoreroom(@CommandContext() context: CmmsCommandContext, @Param('storeroomId') storeroomId: string) {
    return this.parts.deleteStoreroom(context, storeroomId);
  }

  // ─── Part Balances / Bins ───────────────────────────────────────────────────

  @Get('balances')
  @RequirePermissions('cmms.parts.read')
  listBalances(
    @CurrentPrincipal() principal: CmmsPrincipal,
    @Query('partId') partId?: string,
    @Query('storeroomId') storeroomId?: string,
  ) {
    return this.parts.listPartBalances(principal, partId, storeroomId);
  }

  @Put('balances')
  @RequirePermissions('cmms.parts.write')
  setBalance(@CommandContext() context: CmmsCommandContext, @Body() body: unknown) {
    return this.parts.setPartBalance(context, body);
  }

  // ─── Work Order Stock Issue & Return with TCO ───────────────────────────────

  @Post('work-orders/:workOrderId/issue')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.parts.write')
  issueToWorkOrder(
    @CommandContext() context: CmmsCommandContext,
    @Param('workOrderId') workOrderId: string,
    @Body() body: unknown,
  ) {
    return this.parts.issuePartToWorkOrder(context, workOrderId, body);
  }

  @Post('work-orders/:workOrderId/return')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.parts.write')
  returnFromWorkOrder(
    @CommandContext() context: CmmsCommandContext,
    @Param('workOrderId') workOrderId: string,
    @Body() body: unknown,
  ) {
    return this.parts.returnPartFromWorkOrder(context, workOrderId, body);
  }

  @Get('work-orders/:workOrderId/tco')
  @RequirePermissions('cmms.parts.read')
  getWorkOrderTco(@CurrentPrincipal() principal: CmmsPrincipal, @Param('workOrderId') workOrderId: string) {
    return this.parts.getWorkOrderTco(principal, workOrderId);
  }

  // ─── Individual Parts ───────────────────────────────────────────────────────

  @Get(':partId')
  @RequirePermissions('cmms.parts.read')
  get(@CurrentPrincipal() principal: CmmsPrincipal, @Param('partId') partId: string) {
    return this.parts.get(principal, partId);
  }

  @Get(':partId/movements')
  @RequirePermissions('cmms.parts.read')
  movements(@CurrentPrincipal() principal: CmmsPrincipal, @Param('partId') partId: string) {
    return this.parts.movements(principal, partId);
  }

  @Post()
  @RequirePermissions('cmms.parts.write')
  create(@CommandContext() context: CmmsCommandContext, @Body() body: unknown) {
    return this.parts.create(context, body);
  }

  @Patch(':partId')
  @RequirePermissions('cmms.parts.write')
  update(@CommandContext() context: CmmsCommandContext, @Param('partId') partId: string, @Body() body: unknown) {
    return this.parts.update(context, partId, body);
  }

  @Post(':partId/movements')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('cmms.parts.write')
  move(@CommandContext() context: CmmsCommandContext, @Param('partId') partId: string, @Body() body: unknown) {
    return this.parts.recordMovement(context, partId, body);
  }
}
