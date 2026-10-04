import {
  type ApproveAdjustmentInputV1,
  ApproveAdjustmentInputV1Schema,
  type BarcodeResolutionResultV1,
  type CountEntryV1,
  type CountPlanV1,
  type CreateCountPlanInputV1,
  CreateCountPlanInputV1Schema,
  type CreateInventoryItemInputV1,
  CreateInventoryItemInputV1Schema,
  type CreateKitInputV1,
  CreateKitInputV1Schema,
  type CreateLocationInputV1,
  CreateLocationInputV1Schema,
  type CreateLotInputV1,
  CreateLotInputV1Schema,
  type CreateReceiptInputV1,
  CreateReceiptInputV1Schema,
  type CreateReservationInputV1,
  CreateReservationInputV1Schema,
  type CreateWarehouseInputV1,
  CreateWarehouseInputV1Schema,
  type InventoryAdjustmentV1,
  type InventoryItemV1,
  type InventoryKitV1,
  type InventoryLocationV1,
  type InventoryLotV1,
  type InventoryReceiptV1,
  type InventoryReservationV1,
  type InventoryWarehouseV1,
  type PostStockMovementInputV1,
  PostStockMovementInputV1Schema,
  type StockBalanceV1,
  type StockLedgerEntryV1,
  type StockLedgerTransactionV1,
  type SubmitCountEntryInputV1,
  SubmitCountEntryInputV1Schema,
} from '@gigalibs/contracts';
import { CurrentPrincipal, type ModulePrincipal, RequirePermissions } from '@gigalibs/module-sdk';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthorizationGuard } from '../authorization.js';
import { InventoryService } from './inventory.service.js';

@Controller('v1')
@UseGuards(AuthorizationGuard)
export class InventoryController {
  constructor(private readonly service: InventoryService) {}

  // ─── Warehouses ─────────────────────────────────────────────────────────────

  @Get('warehouses')
  @RequirePermissions('inventory:read')
  async listWarehouses(@CurrentPrincipal() principal: ModulePrincipal): Promise<InventoryWarehouseV1[]> {
    return this.service.listWarehouses(principal);
  }

  @Post('warehouses')
  @RequirePermissions('inventory:warehouses:manage')
  async createWarehouse(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Body() body: unknown,
  ): Promise<InventoryWarehouseV1> {
    const input = parse(CreateWarehouseInputV1Schema, body);
    return this.service.createWarehouse(principal, input);
  }

  @Get('warehouses/:id')
  @RequirePermissions('inventory:read')
  async getWarehouse(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') id: string,
  ): Promise<InventoryWarehouseV1> {
    return this.service.getWarehouse(principal, id);
  }

  // ─── Locations ──────────────────────────────────────────────────────────────

  @Get('locations')
  @RequirePermissions('inventory:read')
  async listLocations(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Query('warehouseId') warehouseId?: string,
  ): Promise<InventoryLocationV1[]> {
    return this.service.listLocations(principal, warehouseId);
  }

  @Post('locations')
  @RequirePermissions('inventory:warehouses:manage')
  async createLocation(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Body() body: unknown,
  ): Promise<InventoryLocationV1> {
    const input = parse(CreateLocationInputV1Schema, body);
    return this.service.createLocation(principal, input);
  }

  // ─── Items ──────────────────────────────────────────────────────────────────

  @Post('items')
  @RequirePermissions('inventory:items:manage')
  async createItem(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Body() body: unknown,
  ): Promise<InventoryItemV1> {
    const input = parse(CreateInventoryItemInputV1Schema, body);
    return this.service.createItem(principal, input);
  }

  // ─── Lots ───────────────────────────────────────────────────────────────────

  @Post('lots')
  @RequirePermissions('inventory:receive')
  async createLot(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Body() body: unknown,
  ): Promise<InventoryLotV1> {
    const input = parse(CreateLotInputV1Schema, body);
    return this.service.createLot(principal, input);
  }

  // ─── Balances & Ledger ──────────────────────────────────────────────────────

  @Get('balances')
  @RequirePermissions('inventory:read')
  async listBalances(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Query('warehouseId') warehouseId?: string,
  ): Promise<StockBalanceV1[]> {
    return this.service.listBalances(principal, warehouseId);
  }

  @Get('ledger')
  @RequirePermissions('inventory:ledger:read')
  async listLedger(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Query('productId') productId?: string,
  ): Promise<StockLedgerEntryV1[]> {
    return this.service.listLedgerEntries(principal, productId);
  }

  // ─── Movements ──────────────────────────────────────────────────────────────

  @Post('movements')
  @RequirePermissions('inventory:transfer')
  async postMovement(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Body() body: unknown,
  ): Promise<{ transaction: StockLedgerTransactionV1; entries: StockLedgerEntryV1[] }> {
    const input = parse(PostStockMovementInputV1Schema, body);
    return this.service.postMovement(principal, input);
  }

  // ─── Receipts ───────────────────────────────────────────────────────────────

  @Get('receipts')
  @RequirePermissions('inventory:read')
  async listReceipts(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Query('id') id?: string,
  ): Promise<InventoryReceiptV1 | null> {
    if (id) return this.service.getReceipt(principal, id);
    return null;
  }

  @Post('receipts')
  @RequirePermissions('inventory:receive')
  async createReceipt(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Body() body: unknown,
  ): Promise<InventoryReceiptV1> {
    const input = parse(CreateReceiptInputV1Schema, body);
    return this.service.createReceipt(principal, input);
  }

  @Post('receipts/:id/complete')
  @RequirePermissions('inventory:receive')
  async completeReceipt(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') id: string,
  ): Promise<InventoryReceiptV1> {
    return this.service.completeReceipt(principal, id);
  }

  // ─── Reservations ───────────────────────────────────────────────────────────

  @Post('reservations')
  @RequirePermissions('inventory:reserve')
  async createReservation(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Body() body: unknown,
  ): Promise<InventoryReservationV1> {
    const input = parse(CreateReservationInputV1Schema, body);
    return this.service.createReservation(principal, input);
  }

  @Post('reservations/:id/release')
  @RequirePermissions('inventory:reserve')
  async releaseReservation(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') id: string,
  ): Promise<InventoryReservationV1> {
    return this.service.releaseReservation(principal, id);
  }

  @Post('reservations/:id/issue')
  @RequirePermissions('inventory:reserve')
  async issueStock(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.service.issueStockForOrderFulfillment(principal, {
      reservationId: id,
      orderId: body?.orderId,
      fulfillmentId: body?.fulfillmentId,
      quantity: body?.quantity,
      correlationId: body?.correlationId,
    });
  }

  // ─── Kits & Staging (CMMS) ──────────────────────────────────────────────────

  @Post('kits')
  @RequirePermissions('inventory:kits:manage')
  async createKit(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Body() body: unknown,
  ): Promise<InventoryKitV1> {
    const input = parse(CreateKitInputV1Schema, body);
    return this.service.createKit(principal, input);
  }

  @Get('kits/:id')
  @RequirePermissions('inventory:kits:read')
  async getKit(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') id: string,
  ): Promise<InventoryKitV1> {
    return this.service.getKit(principal, id);
  }

  @Post('kits/:id/stage')
  @RequirePermissions('inventory:kits:manage')
  async stageKit(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') id: string,
    @Body() body: { stagingLocationId: string },
  ): Promise<InventoryKitV1> {
    if (!body?.stagingLocationId) throw new BadRequestException('stagingLocationId is required.');
    return this.service.stageKit(principal, id, body.stagingLocationId);
  }

  @Post('kits/:id/issue')
  @RequirePermissions('inventory:issue')
  async issueKit(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') id: string,
    @Body() body: { technicianId: string },
  ): Promise<InventoryKitV1> {
    if (!body?.technicianId) throw new BadRequestException('technicianId is required.');
    return this.service.issueKit(principal, id, body.technicianId);
  }

  // ─── Cycle Counts & Adjustments ─────────────────────────────────────────────

  @Post('count-plans')
  @RequirePermissions('inventory:counts:approve')
  async createCountPlan(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Body() body: unknown,
  ): Promise<CountPlanV1> {
    const input = parse(CreateCountPlanInputV1Schema, body);
    return this.service.createCountPlan(principal, input);
  }

  @Post('count-entries')
  @RequirePermissions('inventory:count')
  async submitCountEntry(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Query('countPlanId') countPlanId: string,
    @Body() body: unknown,
  ): Promise<CountEntryV1> {
    if (!countPlanId) throw new BadRequestException('countPlanId query parameter is required.');
    const input = parse(SubmitCountEntryInputV1Schema, body);
    return this.service.submitCountEntry(principal, countPlanId, input);
  }

  @Post('adjustments/:id/approve')
  @RequirePermissions('inventory:adjust:approve')
  async approveAdjustment(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<InventoryAdjustmentV1> {
    const input = parse(ApproveAdjustmentInputV1Schema, body);
    return this.service.approveAdjustment(principal, id, input);
  }

  // ─── Barcode Resolution ─────────────────────────────────────────────────────

  @Post('barcodes/resolve')
  @RequirePermissions('inventory:read')
  async resolveBarcode(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Body() body: { rawCode: string },
  ): Promise<BarcodeResolutionResultV1> {
    if (!body?.rawCode) throw new BadRequestException('rawCode is required.');
    return this.service.resolveBarcode(principal, body.rawCode);
  }
}

function parse<T>(
  schema: { safeParse(value: unknown): { success: true; data: T } | { success: false; error: { issues: Array<{ path: PropertyKey[]; message: string }> } } },
  body: unknown,
): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new BadRequestException(
      `Validation failed: ${issue?.path.join('.') ?? ''} ${issue?.message ?? ''}`.trim(),
    );
  }
  return parsed.data;
}
