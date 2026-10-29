import { PlatformContextPersonaSchema } from '@gigalibs/contracts';
import type { ModulePrincipal, RelayRequest } from '@gigalibs/module-sdk';
import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { InventoryService } from './inventory.service.js';
import { IssueDemandCommandGuard } from './issue-demand-command.guard.js';

const IssueDemandCommandEnvelope = z
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
        reservationId: z.string().uuid(),
        productionOrderId: z.string().uuid(),
        productionLineId: z.string().uuid(),
        quantity: z.string().optional(),
        correlationId: z.string().max(128).optional(),
      })
      .strict(),
  })
  .strict();

@Controller('internal/v1/issue-demand-command')
@UseGuards(IssueDemandCommandGuard)
export class IssueDemandCommandController {
  constructor(private readonly inventory: InventoryService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async execute(@Req() _relay: RelayRequest, @Body() body: unknown) {
    const envelope = IssueDemandCommandEnvelope.parse(body);
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
    return this.inventory.issueStockForWorkOrderDemand(principal, envelope.request);
  }
}
