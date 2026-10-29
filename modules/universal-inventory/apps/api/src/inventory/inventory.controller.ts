import {
  type ApproveAdjustmentInputV1,
  ApproveAdjustmentInputV1Schema,
  type BarcodeResolutionResultV1,
  ResolveBarcodeInputV1Schema,
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
  RetryReceiptPostingInputV1Schema,
  type CreateReservationInputV1,
  CreateReservationInputV1Schema,
  IssueReservationInputV1Schema,
  type InventoryAtpCheckResponseV1,
  InventoryAtpCheckRequestV1Schema,
  type InventoryReserveReleaseResponseV1,
  InventoryReserveReleaseRequestV1Schema,
  type CreateWarehouseInputV1,
  CreateWarehouseInputV1Schema,
  type InventoryAdjustmentV1,
  type MaterialLedgerCostLayerV1,
  type InventoryReceiptCostRecordV1,
  type OrgValuationSettingV1,
  UpsertOrgValuationSettingInputV1Schema,
  type InventoryWarehouseMapCellV1,
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
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthorizationGuard } from '../authorization.js';
import { InventoryService } from './inventory.service.js';
import { CreateTransferInputV1Schema, TransferService, type TransferV1 } from './transfer.service.js';
import {
  GeneratePurchaseDraftsInputV1Schema,
  type PurchaseDraftV1,
  type ReplenishRuleV1,
  type ReplenishmentSuggestionV1,
  ReplenishmentService,
  UpsertReplenishRuleInputV1Schema,
} from './replenishment.service.js';

@Controller('v1')
@UseGuards(AuthorizationGuard)
export class InventoryController {
  constructor(
    private readonly service: InventoryService,
    private readonly transfers: TransferService,
    private readonly replenishment: ReplenishmentService,
  ) {}

  // ─── Warehouses ─────────────────────────────────────────────────────────────

  @Get('warehouses')
  @RequirePermissions('inventory.read')
  async listWarehouses(@CurrentPrincipal() principal: ModulePrincipal): Promise<InventoryWarehouseV1[]> {
    return this.service.listWarehouses(principal);
  }

  @Post('warehouses')
  @RequirePermissions('inventory.warehouses.manage')
  async createWarehouse(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Body() body: unknown,
  ): Promise<InventoryWarehouseV1> {
    const input = parse(CreateWarehouseInputV1Schema, body);
    return this.service.createWarehouse(principal, input);
  }

  @Get('warehouses/:id')
  @RequirePermissions('inventory.read')
  async getWarehouse(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') id: string,
  ): Promise<InventoryWarehouseV1> {
    return this.service.getWarehouse(principal, id);
  }

  @Get('warehouses/:id/location-map')
  @RequirePermissions('inventory.read')
  async getWarehouseLocationMap(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') id: string,
  ): Promise<InventoryWarehouseMapCellV1[]> {
    return this.service.getWarehouseLocationMap(principal, id);
  }

  // ─── Locations ──────────────────────────────────────────────────────────────

  @Get('locations')
  @RequirePermissions('inventory.read')
  async listLocations(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Query('warehouseId') warehouseId?: string,
  ): Promise<InventoryLocationV1[]> {
    return this.service.listLocations(principal, warehouseId);
  }

  @Post('locations')
  @RequirePermissions('inventory.warehouses.manage')
  async createLocation(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Body() body: unknown,
  ): Promise<InventoryLocationV1> {
    const input = parse(CreateLocationInputV1Schema, body);
    return this.service.createLocation(principal, input);
  }

  // ─── Items ──────────────────────────────────────────────────────────────────

  @Post('items')
  @RequirePermissions('inventory.items.manage')
  async createItem(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Body() body: unknown,
  ): Promise<InventoryItemV1> {
    const input = parse(CreateInventoryItemInputV1Schema, body);
    return this.service.createItem(principal, input);
  }

  // ─── Lots ───────────────────────────────────────────────────────────────────

  @Post('lots')
  @RequirePermissions('inventory.receive')
  async createLot(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Body() body: unknown,
  ): Promise<InventoryLotV1> {
    const input = parse(CreateLotInputV1Schema, body);
    return this.service.createLot(principal, input);
  }

  // ─── Balances & Ledger ──────────────────────────────────────────────────────

  @Get('cost-layers')
  @RequirePermissions('inventory.ledger.read')
  async listCostLayers(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Query('productId') productId?: string,
  ): Promise<MaterialLedgerCostLayerV1[]> {
    return this.service.listCostLayers(principal, productId);
  }

  @Get('posted-receipt-costs')
  @RequirePermissions('inventory.ledger.read')
  async listPostedReceiptCosts(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Query('productId') productId?: string,
  ): Promise<InventoryReceiptCostRecordV1[]> {
    return this.service.listPostedReceiptCosts(principal, productId);
  }

  @Get('balances')
  @RequirePermissions('inventory.read')
  async listBalances(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Query('warehouseId') warehouseId?: string,
  ): Promise<StockBalanceV1[]> {
    return this.service.listBalances(principal, warehouseId);
  }

  @Get('ledger')
  @RequirePermissions('inventory.ledger.read')
  async listLedger(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Query('productId') productId?: string,
  ): Promise<StockLedgerEntryV1[]> {
    return this.service.listLedgerEntries(principal, productId);
  }

  // ─── Movements ──────────────────────────────────────────────────────────────

  @Post('movements')
  @RequirePermissions('inventory.transfer')
  async postMovement(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Body() body: unknown,
  ): Promise<{ transaction: StockLedgerTransactionV1; entries: StockLedgerEntryV1[] }> {
    const input = parse(PostStockMovementInputV1Schema, body);
    if (input.documentType === 'STOCK_REVERSAL') {
      throw new BadRequestException('Use the stock movement reversal action.');
    }
    return this.service.postMovement(principal, input);
  }

  @Post('movements/:id/reverse')
  @RequirePermissions('inventory.transfer')
  async reverseMovement(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') id: string,
  ): Promise<{ transaction: StockLedgerTransactionV1; entries: StockLedgerEntryV1[] }> {
    return this.service.reverseMovement(principal, id);
  }

  // ─── Transfers (Advanced SCM, WI-OI-125) ────────────────────────────────────

  @Post('transfers')
  @RequirePermissions('inventory.transfer')
  async createTransfer(@CurrentPrincipal() principal: ModulePrincipal, @Body() body: unknown): Promise<TransferV1> {
    return this.transfers.createTransfer(principal, parse(CreateTransferInputV1Schema, body));
  }

  @Get('transfers')
  @RequirePermissions('inventory.read')
  async listTransfers(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Query('status') status?: string,
  ): Promise<TransferV1[]> {
    return this.transfers.listTransfers(principal, status);
  }

  @Get('transfers/:id')
  @RequirePermissions('inventory.read')
  async getTransfer(@CurrentPrincipal() principal: ModulePrincipal, @Param('id') id: string): Promise<TransferV1> {
    return this.transfers.getTransfer(principal, id);
  }

  @Post('transfers/:id/dispatch')
  @RequirePermissions('inventory.transfer')
  async dispatchTransfer(@CurrentPrincipal() principal: ModulePrincipal, @Param('id') id: string): Promise<TransferV1> {
    return this.transfers.dispatchTransfer(principal, id);
  }

  @Post('transfers/:id/receive')
  @RequirePermissions('inventory.receive')
  async receiveTransfer(@CurrentPrincipal() principal: ModulePrincipal, @Param('id') id: string): Promise<TransferV1> {
    return this.transfers.receiveTransfer(principal, id);
  }

  // ─── Replenishment (Advanced SCM, WI-OI-125 S3/S5) ──────────────────────────

  @Post('replenish-rules')
  @RequirePermissions('inventory.items.manage')
  async upsertReplenishRule(@CurrentPrincipal() principal: ModulePrincipal, @Body() body: unknown): Promise<ReplenishRuleV1> {
    return this.replenishment.upsertRule(principal, parse(UpsertReplenishRuleInputV1Schema, body));
  }

  @Get('replenish-rules')
  @RequirePermissions('inventory.read')
  async listReplenishRules(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Query('warehouseId') warehouseId: string,
  ): Promise<ReplenishRuleV1[]> {
    return this.replenishment.listRules(principal, warehouseId);
  }

  @Get('replenish-radar')
  @RequirePermissions('inventory.read')
  async replenishRadar(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Query('warehouseId') warehouseId: string,
  ): Promise<ReplenishmentSuggestionV1[]> {
    return this.replenishment.computeRadar(principal, warehouseId);
  }

  @Post('replenish-pos')
  @RequirePermissions('inventory.items.manage')
  async generateReplenishmentDrafts(@CurrentPrincipal() principal: ModulePrincipal, @Body() body: unknown): Promise<PurchaseDraftV1[]> {
    return this.replenishment.generatePurchaseDrafts(principal, parse(GeneratePurchaseDraftsInputV1Schema, body));
  }

  // ─── Receipts ───────────────────────────────────────────────────────────────

  @Get('receipts')
  @RequirePermissions('inventory.read')
  async listReceipts(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Query('id') id?: string,
  ): Promise<InventoryReceiptV1 | null> {
    if (id) return this.service.getReceipt(principal, id);
    return null;
  }

  @Post('receipts')
  @RequirePermissions('inventory.receive')
  async createReceipt(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Body() body: unknown,
  ): Promise<InventoryReceiptV1> {
    const input = parse(CreateReceiptInputV1Schema, body);
    return this.service.createReceipt(principal, input);
  }

  @Post('receipts/:id/complete')
  @RequirePermissions('inventory.receive')
  async completeReceipt(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') id: string,
  ): Promise<InventoryReceiptV1> {
    return this.service.completeReceipt(principal, id);
  }

  @Post('receipts/:id/retry-posting')
  @RequirePermissions('inventory.receive')
  async retryReceiptPosting(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<InventoryReceiptV1> {
    const input = parse(RetryReceiptPostingInputV1Schema, body);
    return this.service.retryReceiptFinancePosting(principal, id, input.requestKey);
  }

  // ─── Org valuation (Material Ledger S4) ─────────────────────────────────────

  @Get('valuation-settings')
  @RequirePermissions('inventory.items.manage')
  async getOrgValuationSetting(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Query('orgUnitId') orgUnitId: string,
  ): Promise<OrgValuationSettingV1> {
    if (!orgUnitId?.trim()) {
      throw new BadRequestException({ code: 'UNIVERSAL_INVENTORY_VALIDATION_FAILED', message: 'orgUnitId is required.' });
    }
    return this.service.getOrgValuationSetting(principal, orgUnitId.trim());
  }

  @Put('valuation-settings')
  @RequirePermissions('inventory.items.manage')
  async upsertOrgValuationSetting(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Body() body: unknown,
  ): Promise<OrgValuationSettingV1> {
    const input = parse(UpsertOrgValuationSettingInputV1Schema, body);
    return this.service.upsertOrgValuationSetting(principal, input.orgUnitId, input);
  }

  // ─── ATP ────────────────────────────────────────────────────────────────────

  @Post('atp/check')
  @RequirePermissions('inventory.read')
  async checkAtp(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Body() body: unknown,
  ): Promise<InventoryAtpCheckResponseV1> {
    const input = parse(InventoryAtpCheckRequestV1Schema, body);
    return this.service.checkAtp(principal, input);
  }

  @Post('reserve-release')
  @RequirePermissions('inventory.reserve')
  async reserveRelease(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Body() body: unknown,
  ): Promise<InventoryReserveReleaseResponseV1> {
    const input = parse(InventoryReserveReleaseRequestV1Schema, body);
    return this.service.executeReserveRelease(principal, input);
  }

  // ─── Reservations ───────────────────────────────────────────────────────────

  @Get('reservations')
  @RequirePermissions('inventory.read')
  async listReservations(@CurrentPrincipal() principal: ModulePrincipal): Promise<InventoryReservationV1[]> {
    return this.service.listReservations(principal);
  }

  @Post('reservations')
  @RequirePermissions('inventory.reserve')
  async createReservation(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Body() body: unknown,
  ): Promise<InventoryReservationV1> {
    const input = parse(CreateReservationInputV1Schema, body);
    return this.service.createReservation(principal, input);
  }

  @Post('reservations/:id/release')
  @RequirePermissions('inventory.reserve')
  async releaseReservation(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') id: string,
  ): Promise<InventoryReservationV1> {
    return this.service.releaseReservation(principal, id);
  }

  @Post('reservations/:id/issue')
  @RequirePermissions('inventory.issue')
  async issueStock(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = parse(IssueReservationInputV1Schema, body);
    return this.service.issueStockForOrderFulfillment(principal, {
      reservationId: id,
      ...input,
    });
  }

  // ─── Kits & Staging (CMMS) ──────────────────────────────────────────────────

  @Post('kits')
  @RequirePermissions('inventory.kits.manage')
  async createKit(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Body() body: unknown,
  ): Promise<InventoryKitV1> {
    const input = parse(CreateKitInputV1Schema, body);
    return this.service.createKit(principal, input);
  }

  @Get('kits/:id')
  @RequirePermissions('inventory.kits.read')
  async getKit(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') id: string,
  ): Promise<InventoryKitV1> {
    return this.service.getKit(principal, id);
  }

  @Post('kits/:id/stage')
  @RequirePermissions('inventory.kits.manage')
  async stageKit(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') id: string,
    @Body() body: { stagingLocationId: string },
  ): Promise<InventoryKitV1> {
    if (!body?.stagingLocationId) throw new BadRequestException('stagingLocationId is required.');
    return this.service.stageKit(principal, id, body.stagingLocationId);
  }

  @Post('kits/:id/issue')
  @RequirePermissions('inventory.issue')
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
  @RequirePermissions('inventory.counts.approve')
  async createCountPlan(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Body() body: unknown,
  ): Promise<CountPlanV1> {
    const input = parse(CreateCountPlanInputV1Schema, body);
    return this.service.createCountPlan(principal, input);
  }

  @Post('count-entries')
  @RequirePermissions('inventory.count')
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
  @RequirePermissions('inventory.adjust.approve')
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
  @RequirePermissions('inventory.read')
  async resolveBarcode(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Body() body: unknown,
  ): Promise<BarcodeResolutionResultV1> {
    const input = parse(ResolveBarcodeInputV1Schema, body);
    return this.service.resolveBarcode(principal, input.rawCode);
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
