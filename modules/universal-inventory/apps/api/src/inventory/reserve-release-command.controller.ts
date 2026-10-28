import { InventoryReserveReleaseRequestV1Schema, PlatformContextPersonaSchema } from '@gigalibs/contracts';
import type { ModulePrincipal, RelayRequest } from '@gigalibs/module-sdk';
import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { ReserveReleaseCommandGuard } from './reserve-release-command.guard.js';
import { InventoryService } from './inventory.service.js';

const ReserveReleaseCommandEnvelope = z
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
    request: InventoryReserveReleaseRequestV1Schema,
  })
  .strict();

@Controller('internal/v1/reserve-release-command')
@UseGuards(ReserveReleaseCommandGuard)
export class ReserveReleaseCommandController {
  constructor(private readonly inventory: InventoryService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async execute(@Req() _relay: RelayRequest, @Body() body: unknown) {
    const envelope = ReserveReleaseCommandEnvelope.parse(body);
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
    return this.inventory.executeReserveRelease(principal, envelope.request);
  }
}
