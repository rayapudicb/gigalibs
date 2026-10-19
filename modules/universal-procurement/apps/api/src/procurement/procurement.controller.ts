import {
  type ApprovalPolicyV1,
  type ApprovePriceVarianceInputV1,
  ApprovePriceVarianceInputV1Schema,
  type CreateApprovalPolicyInputV1,
  CreateApprovalPolicyInputV1Schema,
  type CreateDebitMemoInputV1,
  CreateDebitMemoInputV1Schema,
  type CreatePurchaseOrderInputV1,
  CreatePurchaseOrderInputV1Schema,
  type ConvertRequisitionToPurchaseOrderInputV1,
  ConvertRequisitionToPurchaseOrderInputV1Schema,
  type CreateRequisitionInputV1,
  CreateRequisitionInputV1Schema,
  type CreateVendorBillInputV1,
  CreateVendorBillInputV1Schema,
  type DebitMemoV1,
  type MatchInvoiceInputV1,
  MatchInvoiceInputV1Schema,
  type MatchPoInvoiceRecordV1,
  type MatchPoReceiptRecordV1,
  type MatchReceiptInputV1,
  MatchReceiptInputV1Schema,
  type ProcurementRequisitionV1,
  type PurchaseOrderV1,
  type VendorBillV1,
} from '@gigalibs/contracts';
import { CurrentPrincipal, type ModulePrincipal, RequirePermissions } from '@gigalibs/module-sdk';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthorizationGuard } from '../authorization.js';
import { ProcurementService } from './procurement.service.js';

@Controller('v1')
@UseGuards(AuthorizationGuard)
export class ProcurementController {
  constructor(private readonly service: ProcurementService) {}

  // ─── Requisitions ───────────────────────────────────────────────────────────

  @Get('requisitions')
  @RequirePermissions('procurement:read')
  async listRequisitions(@CurrentPrincipal() principal: ModulePrincipal): Promise<ProcurementRequisitionV1[]> {
    return this.service.listRequisitions(principal);
  }

  @Post('requisitions')
  @RequirePermissions('procurement:requisitions:manage')
  async createRequisition(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Body() body: unknown,
  ): Promise<ProcurementRequisitionV1> {
    const input = parse(CreateRequisitionInputV1Schema, body);
    return this.service.createRequisition(principal, input);
  }

  @Get('requisitions/:id')
  @RequirePermissions('procurement:read')
  async getRequisition(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') id: string,
  ): Promise<ProcurementRequisitionV1> {
    return this.service.getRequisition(principal, id);
  }

  @Post('requisitions/:id/submit')
  @HttpCode(200)
  @RequirePermissions('procurement:requisitions:manage')
  async submitRequisition(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') id: string,
  ): Promise<ProcurementRequisitionV1> {
    return this.service.submitRequisition(principal, id);
  }

  @Post('requisitions/:id/approve')
  @HttpCode(200)
  @RequirePermissions('procurement:requisitions:approve')
  async approveRequisition(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') id: string,
  ): Promise<ProcurementRequisitionV1> {
    return this.service.approveRequisition(principal, id);
  }

  @Post('requisitions/:id/convert-to-po')
  @HttpCode(200)
  @RequirePermissions('procurement:orders:manage')
  async convertRequisitionToPurchaseOrder(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<PurchaseOrderV1> {
    const input = parse(ConvertRequisitionToPurchaseOrderInputV1Schema, body);
    return this.service.convertRequisitionToPurchaseOrder(principal, id, input);
  }

  @Post('requisitions/:id/reject')
  @HttpCode(200)
  @RequirePermissions('procurement:requisitions:approve')
  async rejectRequisition(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ): Promise<ProcurementRequisitionV1> {
    return this.service.rejectRequisition(principal, id, body?.reason);
  }

  // ─── Purchase Orders ────────────────────────────────────────────────────────

  @Get('orders')
  @RequirePermissions('procurement:read')
  async listOrders(@CurrentPrincipal() principal: ModulePrincipal): Promise<PurchaseOrderV1[]> {
    return this.service.listPurchaseOrders(principal);
  }

  @Post('orders')
  @RequirePermissions('procurement:orders:manage')
  async createOrder(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Body() body: unknown,
  ): Promise<PurchaseOrderV1> {
    const input = parse(CreatePurchaseOrderInputV1Schema, body);
    return this.service.createPurchaseOrder(principal, input);
  }

  @Get('orders/:id')
  @RequirePermissions('procurement:read')
  async getOrder(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') id: string,
  ): Promise<PurchaseOrderV1> {
    return this.service.getPurchaseOrder(principal, id);
  }

  @Post('orders/:id/issue')
  @HttpCode(200)
  @RequirePermissions('procurement:orders:issue')
  async issueOrder(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') id: string,
  ): Promise<PurchaseOrderV1> {
    return this.service.issuePurchaseOrder(principal, id);
  }

  @Post('orders/:id/acknowledge')
  @HttpCode(200)
  @RequirePermissions('procurement:orders:manage')
  async acknowledgeOrder(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') id: string,
  ): Promise<PurchaseOrderV1> {
    return this.service.acknowledgePurchaseOrder(principal, id);
  }

  @Get('orders/:id/verify-match')
  @RequirePermissions('procurement:read')
  async verifyThreeWayMatch(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') id: string,
  ) {
    return this.service.verifyThreeWayMatch(principal, id);
  }

  // ─── 3-Way Matching Engine ──────────────────────────────────────────────────

  @Post('match/receipt')
  @RequirePermissions('procurement:match')
  async matchReceipt(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Body() body: unknown,
  ): Promise<MatchPoReceiptRecordV1> {
    const input = parse(MatchReceiptInputV1Schema, body);
    return this.service.matchReceipt(principal, input);
  }

  @Post('match/invoice')
  @RequirePermissions('procurement:match')
  async matchInvoice(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Body() body: unknown,
  ): Promise<MatchPoInvoiceRecordV1> {
    const input = parse(MatchInvoiceInputV1Schema, body);
    return this.service.matchInvoice(principal, input);
  }

  @Post('inbox/receipts')
  @HttpCode(200)
  @RequirePermissions('procurement:match')
  async ingestReceiptEvent(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Body() body: any,
  ): Promise<{ processed: boolean; duplicate: boolean }> {
    return this.service.projectInventoryReceipt(principal, body);
  }

  @Post('match/variance/:id/approve')
  @HttpCode(200)
  @RequirePermissions('procurement:variance:override')
  async approveVariance(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<MatchPoInvoiceRecordV1> {
    const input = parse(ApprovePriceVarianceInputV1Schema, {
      ...(typeof body === 'object' && body !== null ? body : {}),
      matchRecordId: id,
    });
    return this.service.approvePriceVariance(principal, input);
  }

  // ─── Vendor Bills ───────────────────────────────────────────────────────────

  @Get('bills')
  @RequirePermissions('procurement:read')
  async listBills(@CurrentPrincipal() principal: ModulePrincipal): Promise<VendorBillV1[]> {
    return this.service.listVendorBills(principal);
  }

  @Post('bills')
  @RequirePermissions('procurement:bills:manage')
  async createBill(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Body() body: unknown,
  ): Promise<VendorBillV1> {
    const input = parse(CreateVendorBillInputV1Schema, body);
    return this.service.createVendorBill(principal, input);
  }

  @Get('bills/:id')
  @RequirePermissions('procurement:read')
  async getBill(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') id: string,
  ): Promise<VendorBillV1> {
    return this.service.getVendorBill(principal, id);
  }

  @Post('bills/:id/approve')
  @HttpCode(200)
  @RequirePermissions('procurement:bills:manage')
  async approveBill(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') id: string,
  ): Promise<VendorBillV1> {
    return this.service.approveVendorBill(principal, id);
  }

  // ─── Debit Memos ────────────────────────────────────────────────────────────

  @Get('debit-memos')
  @RequirePermissions('procurement:read')
  async listDebitMemos(@CurrentPrincipal() principal: ModulePrincipal): Promise<DebitMemoV1[]> {
    return this.service.listDebitMemos(principal);
  }

  @Post('debit-memos')
  @RequirePermissions('procurement:debit-memos:manage')
  async createDebitMemo(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Body() body: unknown,
  ): Promise<DebitMemoV1> {
    const input = parse(CreateDebitMemoInputV1Schema, body);
    return this.service.createDebitMemo(principal, input);
  }

  // ─── Delegation of Authority (Approval Policies) ───────────────────────────

  @Get('approval-policies')
  @RequirePermissions('procurement:read')
  async listApprovalPolicies(@CurrentPrincipal() principal: ModulePrincipal): Promise<ApprovalPolicyV1[]> {
    return this.service.listApprovalPolicies(principal);
  }

  @Post('approval-policies')
  @RequirePermissions('procurement:orders:approve')
  async createApprovalPolicy(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Body() body: unknown,
  ): Promise<ApprovalPolicyV1> {
    const input = parse(CreateApprovalPolicyInputV1Schema, body);
    return this.service.createApprovalPolicy(principal, input);
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
