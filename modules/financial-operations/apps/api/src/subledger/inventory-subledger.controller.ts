import { inventoryReceiptCompletedPostingPolicyV1 } from '@gigalibs/posting-rules';
import { CurrentPrincipal, type ModulePrincipal, RequirePermissions } from '@gigalibs/module-sdk';
import { BadRequestException, Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { InventorySubledgerInboxService } from './inventory-inbox.service.js';
import { AuthorizationGuard } from '../authorization.js';
import { SCHEMA } from '../config.js';
import { DatabaseService } from '../database.service.js';
import { reconcileInventoryReceiptPosting } from '../posting/inventory-receipt-posting-reconciliation.js';
import { resolveInventoryReceiptPostingStatus } from '../posting/inventory-receipt-posting-status.js';

@Controller('v1/subledger/inventory')
@UseGuards(AuthorizationGuard)
export class InventorySubledgerController {
  constructor(
    private readonly database: DatabaseService,
    private readonly inbox: InventorySubledgerInboxService,
  ) {}

  @Get('receipts/:id/posting-status')
  @RequirePermissions('finance:read')
  async receiptPostingStatus(@CurrentPrincipal() principal: ModulePrincipal, @Param('id') receiptId: string) {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const status = await resolveInventoryReceiptPostingStatus(
        client,
        SCHEMA,
        principal.tenantId,
        receiptId,
        'COMPLETED',
      );
      return status;
    });
  }

  @Get('posting-reconciliation')
  @RequirePermissions('finance:read')
  async postingReconciliation(@CurrentPrincipal() principal: ModulePrincipal) {
    return this.database.withTenantTransaction(principal.tenantId, (client) =>
      reconcileInventoryReceiptPosting(
        client,
        SCHEMA,
        principal.tenantId,
        inventoryReceiptCompletedPostingPolicyV1.eventType,
      ),
    );
  }

  @Post('postings/:id/retry')
  @RequirePermissions('finance:subledger:retry')
  async retryRejectedPosting(
    @CurrentPrincipal() principal: ModulePrincipal,
    @Param('id') messageId: string,
    @Body() body: unknown,
  ) {
    const parsed = z.object({ reason: z.string().min(1).max(500) }).strict().safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Invalid retry body.');
    }
    return this.inbox.retryRejectedPosting(principal.tenantId, principal.subject, messageId, parsed.data.reason);
  }
}
