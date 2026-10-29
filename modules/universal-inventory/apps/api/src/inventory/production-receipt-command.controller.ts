import { PlatformContextPersonaSchema } from '@gigalibs/contracts';
import type { ModulePrincipal, RelayRequest } from '@gigalibs/module-sdk';
import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { InventoryService } from './inventory.service.js';
import { ProductionReceiptCommandGuard } from './production-receipt-command.guard.js';

const ProductionReceiptCommandEnvelope = z
  .object({
    tenantId: z.string().min(1),
    messageId: z.string().uuid(),
    actor: z
      .object({
        subject: z.string().min(1),
        sessionId: z.string().min(1),
        authVersion: z.number().int().positive(),
        permissions: z.array(z.string()),
        roles: z.array(z.string()),
        persona: PlatformContextPersonaSchema,
        organization: z.unknown(),
        departmentScope: z.unknown(),
        placeScope: z.unknown(),
      })
      .strict(),
    request: z
      .object({
        commandKey: z.string().uuid(),
        productionOrderId: z.string().uuid(),
        warehouseId: z.string().uuid(),
        orgUnitId: z.string().min(1).max(64),
        productId: z.string().uuid(),
        uomId: z.string().uuid(),
        quantity: z.string(),
      })
      .strict(),
  })
  .strict();

@Controller('internal/v1/production-receipt-command')
@UseGuards(ProductionReceiptCommandGuard)
export class ProductionReceiptCommandController {
  constructor(private readonly inventory: InventoryService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async execute(@Req() _relay: RelayRequest, @Body() body: unknown) {
    const envelope = ProductionReceiptCommandEnvelope.parse(body);
    const actor = envelope.actor;
    const principal: ModulePrincipal = {
      tenantId: envelope.tenantId,
      subject: actor.subject,
      sessionId: actor.sessionId,
      authVersion: actor.authVersion,
      permissions: actor.permissions,
      roles: actor.roles,
      persona: actor.persona,
      organization: actor.organization as ModulePrincipal['organization'],
      departmentScope: actor.departmentScope as ModulePrincipal['departmentScope'],
      placeScope: actor.placeScope as ModulePrincipal['placeScope'],
    };
    return this.inventory.receiveManufacturingFinishedGoods(principal, envelope.request);
  }
}
