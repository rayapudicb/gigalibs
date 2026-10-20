import {
  CreateCostProfileInputV1Schema,
  IngestReceiptCostLayerInputV1Schema,
  RecordShipmentCostInputV1Schema,
  CreateLandedCostInputV1Schema,
  ExecuteRevaluationInputV1Schema,
} from '@gigalibs/contracts';
import { z } from 'zod';
import {
  CurrentPrincipal,
  type ModulePrincipal,
  RequirePermissions,
} from '@gigalibs/module-sdk';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthorizationGuard } from '../authorization.js';
import { CostingService } from './costing.service.js';

function parse<T>(
  schema: { safeParse(value: unknown): { success: true; data: T } | { success: false; error: { issues: Array<{ path: PropertyKey[]; message: string }> } } },
  body: unknown,
): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new BadRequestException(
      `Validation error: ${issue?.path.join('.') ?? ''} ${issue?.message ?? ''}`.trim(),
    );
  }
  return parsed.data;
}

@Controller('v1/costing')
@UseGuards(AuthorizationGuard)
export class CostingController {
  constructor(private readonly costingService: CostingService) {}

  // ─── 1. Cost Profiles ───────────────────────────────────────────────────────

  @Post('profiles')
  @RequirePermissions('finance:books:manage')
  async createProfile(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Body() body: unknown,
  ) {
    const input = parse(CreateCostProfileInputV1Schema, body);
    return this.costingService.createCostProfile(
      principal.tenantId,
      principal.subject,
      input,
    );
  }

  @Get('profiles')
  @RequirePermissions('finance:reports:read')
  async listProfiles(@CurrentPrincipal() principal: ModulePrincipal) {
    return this.costingService.listCostProfiles(principal.tenantId);
  }

  @Get('profiles/:id')
  @RequirePermissions('finance:reports:read')
  async getProfile(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') id: string,
  ) {
    return this.costingService.getCostProfile(principal.tenantId, id);
  }

  @Get('product-standard-costs')
  @RequirePermissions('finance:read')
  async listProductStandardCosts(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Query('costProfileId') costProfileId?: string,
    @Query('productId') productId?: string,
  ) {
    return this.costingService.listProductStandardCosts(principal.tenantId, costProfileId, productId);
  }

  @Post('product-standard-costs')
  @RequirePermissions('finance:costing:manage')
  async createProductStandardCost(@CurrentPrincipal() principal: ModulePrincipal, @Body() body: unknown) {
    const input = parse(
      z
        .object({
          costProfileId: z.string().uuid(),
          productId: z.string().uuid(),
          standardUnitCostScaled: z.string().regex(/^\d+$/),
          effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          changeReason: z.string().min(1).max(500),
        })
        .strict(),
      body,
    );
    return this.costingService.createProductStandardCost(principal.tenantId, principal.subject, input);
  }

  @Post('product-standard-costs/:id/archive')
  @RequirePermissions('finance:costing:manage')
  async archiveProductStandardCost(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const parsed = parse(z.object({ reason: z.string().min(1).max(500) }).strict(), body);
    return this.costingService.archiveProductStandardCost(principal.tenantId, principal.subject, id, parsed.reason);
  }

  // ─── 2. Inbound Receipts & Cost Layers ──────────────────────────────────────

  @Post('receipt-layers')
  @RequirePermissions('finance:journals:create')
  async ingestReceiptLayer(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Body() body: unknown,
  ) {
    const input = parse(IngestReceiptCostLayerInputV1Schema, body);
    return this.costingService.ingestReceiptLayer(
      principal.tenantId,
      principal.subject,
      input,
    );
  }

  // ─── 3. Outbound Shipments / Consumptions (COGS) ───────────────────────────

  @Post('shipments')
  @RequirePermissions('finance:journals:create')
  async recordShipment(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Body() body: unknown,
  ) {
    const input = parse(RecordShipmentCostInputV1Schema, body);
    return this.costingService.recordShipmentCost(
      principal.tenantId,
      principal.subject,
      input,
    );
  }

  // ─── 4. Landed Cost Vouchers ────────────────────────────────────────────────

  @Post('landed-costs')
  @RequirePermissions('finance:journals:create')
  async createLandedCost(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Body() body: unknown,
  ) {
    const input = parse(CreateLandedCostInputV1Schema, body);
    return this.costingService.createLandedCostVoucher(
      principal.tenantId,
      principal.subject,
      input,
    );
  }

  // ─── 5. Inventory Revaluation (NRV Impairment) ──────────────────────────────

  @Post('revaluations')
  @RequirePermissions('finance:journals:create')
  async executeRevaluation(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Body() body: unknown,
  ) {
    const input = parse(ExecuteRevaluationInputV1Schema, body);
    return this.costingService.executeRevaluation(
      principal.tenantId,
      principal.subject,
      input,
    );
  }

  // ─── 6. Valuation Reporting ─────────────────────────────────────────────────

  @Get('valuation-summary')
  @RequirePermissions('finance:reports:read')
  async getValuationSummary(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Query('warehouseId') warehouseId?: string,
  ) {
    return this.costingService.getValuationSummary(principal.tenantId, warehouseId);
  }
}
